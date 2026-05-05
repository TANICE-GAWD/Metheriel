package search

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// EspacenetProvider searches the Espacenet patent database
// Free tier: 20K requests per month, no API key required for basic queries
type EspacenetProvider struct {
	baseURL string
	client  *http.Client
}

func NewEspacenetProvider() *EspacenetProvider {
	return &EspacenetProvider{
		baseURL: "https://www.espacenet.com/cgi-bin/espacenet",
		client: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

func (e *EspacenetProvider) Name() string {
	return "espacenet"
}

// buildEspacenetQuery constructs a query string for Espacenet search
// Espacenet accepts keyword queries and returns patent results
func buildEspacenetQuery(keywords []string) string {
	// Use AND operator for core keywords, max 5 to avoid timeouts
	maxKeywords := 5
	if len(keywords) > maxKeywords {
		keywords = keywords[:maxKeywords]
	}

	var parts []string
	for _, kw := range keywords {
		kw = strings.TrimSpace(kw)
		if kw == "" {
			continue
		}
		parts = append(parts, kw)
	}

	// Join with AND for strict matching
	return strings.Join(parts, " AND ")
}

// espacenetResult represents a single patent result from Espacenet JSON response
type espacenetResult struct {
	Title       string `json:"title"`
	AbstractEn  string `json:"abstract_en"`
	AbstractDe  string `json:"abstract_de"`
	AbstractFr  string `json:"abstract_fr"`
	PatentID    string `json:"patent_id"`
	PublicationDate string `json:"publication_date"`
	Applicant   string `json:"applicant"`
}

// espacenetResponse represents the JSON response structure from Espacenet
type espacenetResponse struct {
	Results []espacenetResult `json:"results"`
	Count   int               `json:"count"`
}

// Search queries Espacenet for patents matching the search query
func (e *EspacenetProvider) Search(
	ctx context.Context,
	query SearchQuery,
) ([]SearchResult, error) {

	// Get English keywords (fallback to other languages if needed)
	var keywords []string
	if enKeywords, ok := query.Keywords["EN"]; ok && len(enKeywords) > 0 {
		keywords = enKeywords
	} else if deKeywords, ok := query.Keywords["DE"]; ok && len(deKeywords) > 0 {
		keywords = deKeywords
	} else if zhKeywords, ok := query.Keywords["ZH"]; ok && len(zhKeywords) > 0 {
		keywords = zhKeywords
	}

	if len(keywords) == 0 {
		return nil, fmt.Errorf("no keywords provided for Espacenet search")
	}

	searchQuery := buildEspacenetQuery(keywords)

	// Construct Espacenet search URL
	// Using their free JSON  endpoint
	reqURL := fmt.Sprintf(
		"%s?action=Search&CL=&QUERY=%s&STR=&DB=espacenet&FIRST=%d&NUM=%d&format=json",
		e.baseURL,
		url.QueryEscape(searchQuery),
		1,
		query.MaxResults,
	)

	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, err
	}

	// Set User-Agent to avoid blocking
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; Metheriel/1.0)")

	resp, err := e.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("espacenet request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("espacenet API error: status %d - %s", resp.StatusCode, string(body))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	// Parse JSON response
	var espacenetResp espacenetResponse
	if err := json.Unmarshal(body, &espacenetResp); err != nil {
		// If JSON parsing fails, Espacenet might be returning HTML - return error
		return nil, fmt.Errorf("failed to parse Espacenet response: %w", err)
	}

	// Convert to SearchResult format
	var results []SearchResult
	for _, entry := range espacenetResp.Results {
		if entry.Title == "" {
			continue
		}

		// Parse publication date
		pubDate := time.Now()
		if entry.PublicationDate != "" {
			if parsed, err := time.Parse("2006-01-02", entry.PublicationDate); err == nil {
				pubDate = parsed
			}
		}

		// Filter by target date if specified
		if !query.TargetDate.IsZero() && pubDate.After(query.TargetDate) {
			continue
		}

		// Prefer English abstract, fallback to German or French
		abstract := entry.AbstractEn
		if abstract == "" {
			abstract = entry.AbstractDe
		}
		if abstract == "" {
			abstract = entry.AbstractFr
		}
		if abstract == "" {
			abstract = entry.Applicant // Fallback to applicant info
		}

		result := SearchResult{
			Title:    strings.TrimSpace(entry.Title),
			URL:      fmt.Sprintf("https://www.espacenet.com/patent/ES/%s", entry.PatentID),
			Snippet:  strings.TrimSpace(abstract),
			Date:     pubDate,
			Source:   "Espacenet",
			Language: "EN",
		}

		results = append(results, result)
	}

	return results, nil
}

// init registers the Espacenet provider
func init() {
	RegisterProvider(NewEspacenetProvider())
}
