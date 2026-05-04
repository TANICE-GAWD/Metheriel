package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"backend/internal/engine"
	"backend/internal/search"

	"github.com/joho/godotenv"
)





type AnalyzeRequest struct {
	ClaimText string `json:"claim_text"`
	TargetDate string `json:"target_date,omitempty"`
}

type AnalyzeResponse struct {
	Keywords map[string][]string   `json:"keywords"`
	Results  []search.SearchResult `json:"results"`
}

type DetailedAnalysisRequest struct {
	ClaimText string `json:"claim_text"`
	PriorText string `json:"prior_text"`
}

type Conflict struct {
	Claim      string  `json:"claim"`
	Prior      string  `json:"prior"`
	Similarity float64 `json:"similarity"`
}

type DetailedAnalysisResponse struct {
	Conflicts  []Conflict `json:"conflicts"`
	Confidence float64   `json:"confidence"`
}





func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}





func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		next.ServeHTTP(w, r)

		log.Printf("[%s] %s took %v",
			r.Method,
			r.URL.Path,
			time.Since(start),
		)
	})
}





func DetailedAnalysisHandler(decon *engine.Deconstructor) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req DetailedAnalysisRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		if req.ClaimText == "" || req.PriorText == "" {
			http.Error(w, "claim_text and prior_text are required", http.StatusBadRequest)
			return
		}

		// Extract sentences/phrases for comparison
		claimPhrases := extractPhrases(req.ClaimText)
		priorPhrases := extractPhrases(req.PriorText)

		conflicts := findConflicts(claimPhrases, priorPhrases)
		if conflicts == nil {
			conflicts = []Conflict{}
		}

		confidence := calculateConfidence(conflicts, len(claimPhrases))

		resp := DetailedAnalysisResponse{
			Conflicts:  conflicts,
			Confidence: confidence,
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}
}

func extractPhrases(text string) []string {
	// Split by common delimiters: periods, commas, semicolons
	var phrases []string
	for _, sent := range strings.Split(text, ".") {
		sent = strings.TrimSpace(sent)
		if len(sent) > 5 {
			phrases = append(phrases, sent)
		}
	}
	return phrases
}

func findConflicts(claimPhrases, priorPhrases []string) []Conflict {
	var conflicts []Conflict

	for _, claimPhrase := range claimPhrases {
		claimWords := strings.Fields(strings.ToLower(claimPhrase))

		for _, priorPhrase := range priorPhrases {
			priorWords := strings.Fields(strings.ToLower(priorPhrase))

			// Calculate simple word overlap
			overlap := 0
			for _, cw := range claimWords {
				for _, pw := range priorWords {
					if cw == pw {
						overlap++
						break
					}
				}
			}

			if overlap > 0 {
				similarity := float64(overlap) / float64(len(claimWords)+len(priorWords)-overlap)

				// Only keep significant overlaps
				if similarity > 0.3 {
					conflicts = append(conflicts, Conflict{
						Claim:      claimPhrase,
						Prior:      priorPhrase,
						Similarity: similarity,
					})
				}
			}
		}
	}

	return conflicts
}

func calculateConfidence(conflicts []Conflict, totalClaims int) float64 {
	if len(conflicts) == 0 {
		return 0.0
	}

	totalSimilarity := 0.0
	for _, c := range conflicts {
		totalSimilarity += c.Similarity
	}

	avgSimilarity := totalSimilarity / float64(len(conflicts))
	// Weight by overlap density
	confidence := avgSimilarity * float64(len(conflicts)) / float64(totalClaims+1)

	if confidence > 1.0 {
		confidence = 1.0
	}

	return confidence
}

func AnalyzeHandler(decon *engine.Deconstructor) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {

		var req AnalyzeRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		if req.ClaimText == "" {
			http.Error(w, "claim_text is required", http.StatusBadRequest)
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 25*time.Second)
		defer cancel()

		
		
		

		query, err := decon.Deconstruct(ctx, req.ClaimText, req.TargetDate)
		if err != nil {
			http.Error(w, "failed to deconstruct claim: "+err.Error(), http.StatusInternalServerError)
			return
		}

		
		
		

		results, err := search.MultiSearch(ctx, query)
		if err != nil {
			log.Println("search warning:", err) 
		}

		// Apply relevance filter using domain matching
		var filtered []search.SearchResult
		if query.PrimaryDomain != "" {
			for _, r := range results {
				if decon.IsRelevant(ctx, query.PrimaryDomain, query.TechnicalLayer, query.CoreProblem, r.Snippet) {
					filtered = append(filtered, r)
				}
			}
		} else {
			filtered = results
		}

		// FALLBACK: If filter removed everything but we had results, return top unfiltered results
		// This prevents "No Prior Art Found" when filter is overly aggressive
		if len(filtered) == 0 && len(results) > 0 {
			log.Printf("Filter removed all %d results, falling back to top 5 unfiltered", len(results))
			// Return top 5 unfiltered results as fallback
			if len(results) > 5 {
				filtered = results[:5]
			} else {
				filtered = results
			}
		}

		if filtered == nil {
			filtered = []search.SearchResult{}
		}

		
		
		

		resp := AnalyzeResponse{
			Keywords: query.Keywords,
			Results:  filtered,
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}
}





func main() {

	
	
	

	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found (using system env)")
	}

	
	
	

	decon, err := engine.NewDeconstructor()
	if err != nil {
		log.Fatal("failed to init deconstructor:", err)
	}

	

	
	
	

	mux := http.NewServeMux()
	mux.Handle("/v1/analyze", AnalyzeHandler(decon))
	mux.Handle("/v1/analyze-detailed", DetailedAnalysisHandler(decon))

	handler := corsMiddleware(loggingMiddleware(mux))

	server := &http.Server{
		Addr:         ":8080",
		Handler:      handler,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	
	
	

	go func() {
		log.Println(" Metheriel API running on http://localhost:8080")
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal("server error:", err)
		}
	}()

	
	
	

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)

	<-stop
	log.Println(" Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatal("forced shutdown:", err)
	}

	log.Println(" Server exited cleanly")
}