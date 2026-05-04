package search

import (
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)





type ArxivProvider struct {
	baseURL string
	client  *http.Client
}

func NewArxivProvider() *ArxivProvider {
	return &ArxivProvider{
		baseURL: "https://export.arxiv.org/api/query",
		client: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

func (a *ArxivProvider) Name() string {
	return "arxiv"
}





func buildArxivQuery(keywords []string) string {
	var parts []string

	for _, kw := range keywords {
		kw = strings.TrimSpace(kw)
		if kw == "" {
			continue
		}
		
		parts = append(parts, fmt.Sprintf("all:%s", url.QueryEscape(kw)))
	}

	
	return strings.Join(parts, "+AND+")
}





type arxivFeed struct {
	Entries []arxivEntry `xml:"entry"`
}

type arxivEntry struct {
	Title     string `xml:"title"`
	Summary   string `xml:"summary"`
	ID        string `xml:"id"`
	Published string `xml:"published"`
}





func (a *ArxivProvider) Search(
	ctx context.Context,
	query SearchQuery,
) ([]SearchResult, error) {

	enKeywords, ok := query.Keywords["EN"]
	if !ok || len(enKeywords) == 0 {
		return nil, fmt.Errorf("no EN keywords provided for ArXiv search")
	}

	searchQuery := buildArxivQuery(enKeywords)

	reqURL := fmt.Sprintf(
		"%s?search_query=%s&start=0&max_results=%d",
		a.baseURL,
		searchQuery,
		query.MaxResults,
	)

	
	
	

	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, err
	}

	resp, err := a.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("arxiv API error: %s", resp.Status)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	
	
	

	var feed arxivFeed
	if err := xml.Unmarshal(body, &feed); err != nil {
		return nil, fmt.Errorf("failed to parse ArXiv XML: %w", err)
	}

	
	
	

	var results []SearchResult

	for _, entry := range feed.Entries {

		
		pubDate, err := time.Parse(time.RFC3339, entry.Published)
		if err != nil {
			continue 
		}

		
		if !query.TargetDate.IsZero() && pubDate.After(query.TargetDate) {
			continue
		}

		result := SearchResult{
			Title:    strings.TrimSpace(entry.Title),
			URL:      strings.TrimSpace(entry.ID),
			Snippet:  strings.TrimSpace(entry.Summary),
			Date:     pubDate,
			Source:   "ArXiv",
			Language: "EN",
		}

		results = append(results, result)
	}

	return results, nil
}





func init() {
	RegisterProvider(NewArxivProvider())
}