package engine

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"backend/internal/search"
)

type Deconstructor struct {
	apiKey string
}

func NewDeconstructor() (*Deconstructor, error) {
	apiKey := os.Getenv("GROQ_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("missing GROQ_API_KEY")
	}

	return &Deconstructor{
		apiKey: apiKey,
	}, nil
}



type llmResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

type keywordResponse struct {
	Keywords map[string][]string `json:"keywords"`
	Domain   string              `json:"domain"`
	Intent   string              `json:"intent"`
}



func buildPrompt(claim string) string {
	return fmt.Sprintf(
		`Extract from the patent claim:
1. Core technical keywords (EN, DE, ZH)
2. Domain (1-2 words, e.g., "mobile payments")
3. Intent (short phrase, what problem does it solve?)

Rules:
- Remove legal words
- Keep only technical concepts
- Max 6 keywords per language
- NO explanation
- OUTPUT ONLY JSON

Format:
{"keywords":{"EN":[],"DE":[],"ZH":[]},"domain":"...","intent":"..."}

Claim:
%s`, claim)
}



func extractJSON(text string) (string, error) {
	start := strings.Index(text, "{")
	end := strings.LastIndex(text, "}")

	if start == -1 || end == -1 || start >= end {
		return "", fmt.Errorf("no valid JSON found")
	}

	return text[start : end+1], nil
}



func (d *Deconstructor) Deconstruct(
	ctx context.Context,
	rawClaim string,
	targetDateStr string,
) (search.SearchQuery, error) {

	prompt := buildPrompt(rawClaim)

	url := "https://api.groq.com/openai/v1/chat/completions"

	body := map[string]interface{}{
		"model": "llama-3.1-8b-instant",
		"messages": []map[string]string{
			{
				"role":    "system",
				"content": "You are a strict JSON generator. Output only JSON.",
			},
			{
				"role":    "user",
				"content": prompt,
			},
		},
		"temperature": 0,
		"max_tokens": 200, 
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return search.SearchQuery{}, err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonBody))
	if err != nil {
		return search.SearchQuery{}, err
	}

	req.Header.Set("Authorization", "Bearer "+d.apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{
		Timeout: 12 * time.Second,
	}

	resp, err := client.Do(req)
	if err != nil {
		return search.SearchQuery{}, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return search.SearchQuery{}, err
	}

	if resp.StatusCode != 200 {
		return search.SearchQuery{}, fmt.Errorf("groq error: %s", string(respBody))
	}

	var llmResp llmResponse
	if err := json.Unmarshal(respBody, &llmResp); err != nil {
		return search.SearchQuery{}, err
	}

	if len(llmResp.Choices) == 0 {
		return search.SearchQuery{}, fmt.Errorf("empty response")
	}

	text := strings.TrimSpace(llmResp.Choices[0].Message.Content)

	cleanJSON, err := extractJSON(text)
	if err != nil {
		return search.SearchQuery{}, fmt.Errorf(
			"failed to extract JSON: %w\nRAW: %s",
			err,
			text,
		)
	}

	var parsed keywordResponse
	if err := json.Unmarshal([]byte(cleanJSON), &parsed); err != nil {
		return search.SearchQuery{}, fmt.Errorf(
			"json parse error: %w\nCLEAN: %s\nRAW: %s",
			err,
			cleanJSON,
			text,
		)
	}



	var targetDate time.Time
	if targetDateStr != "" {
		t, err := time.Parse("2006-01-02", targetDateStr)
		if err != nil {
			return search.SearchQuery{}, fmt.Errorf("invalid date format")
		}
		targetDate = t
	}


	query := search.SearchQuery{
		Keywords:   parsed.Keywords,
		Domain:     parsed.Domain,
		Intent:     parsed.Intent,
		TargetDate: targetDate,
		MaxResults: 20,
	}

	return query, nil
}

// IsRelevant checks if a document snippet addresses the same technical problem
func (d *Deconstructor) IsRelevant(ctx context.Context, intent string, snippet string) bool {
	if intent == "" || snippet == "" {
		return true // default to true if missing intent
	}

	prompt := fmt.Sprintf(`You are a patent examiner.

CLAIM INTENT:
%s

DOCUMENT SNIPPET:
%s

Does this document address the SAME technical problem or domain?

Answer ONLY:
YES or NO`, intent, snippet)

	url := "https://api.groq.com/openai/v1/chat/completions"

	body := map[string]interface{}{
		"model": "llama-3.1-8b-instant",
		"messages": []map[string]string{
			{
				"role":    "system",
				"content": "You are a strict YES/NO classifier. Answer only YES or NO.",
			},
			{
				"role":    "user",
				"content": prompt,
			},
		},
		"temperature": 0,
		"max_tokens":  50,
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return false
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonBody))
	if err != nil {
		return false
	}

	req.Header.Set("Authorization", "Bearer "+d.apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{
		Timeout: 8 * time.Second,
	}

	resp, err := client.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return false
	}

	var llmResp llmResponse
	if err := json.Unmarshal(respBody, &llmResp); err != nil {
		return false
	}

	if len(llmResp.Choices) == 0 {
		return false
	}

	response := strings.ToUpper(strings.TrimSpace(llmResp.Choices[0].Message.Content))
	return strings.Contains(response, "YES")
}