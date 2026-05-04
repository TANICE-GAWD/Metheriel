package search

import (
	"context"
	"errors"
	"sync"
	"time"
)






type SearchProvider interface {
	Name() string
	Search(ctx context.Context, query SearchQuery) ([]SearchResult, error)
}






type SearchResult struct {
	Title     string    `json:"title"`
	URL       string    `json:"url"`
	Snippet   string    `json:"snippet"`
	Date      time.Time `json:"date"`
	Source    string    `json:"source"`
	Language  string    `json:"language"`
	Score     float64   `json:"score,omitempty"` 
}






type SearchQuery struct {
	Keywords   map[string][]string `json:"keywords"` 
	Domain     string              `json:"domain"`
	Intent     string              `json:"intent"`
	TargetDate time.Time           `json:"target_date"`
	MaxResults int                 `json:"max_results"`
}





var (
	providersMu sync.RWMutex
	providers   = make(map[string]SearchProvider)
)


func RegisterProvider(p SearchProvider) {
	providersMu.Lock()
	defer providersMu.Unlock()
	providers[p.Name()] = p
}


func GetProviders() []SearchProvider {
	providersMu.RLock()
	defer providersMu.RUnlock()

	list := make([]SearchProvider, 0, len(providers))
	for _, p := range providers {
		list = append(list, p)
	}
	return list
}






func MultiSearch(ctx context.Context, query SearchQuery) ([]SearchResult, error) {
	ps := GetProviders()
	if len(ps) == 0 {
		return nil, errors.New("no search providers registered")
	}

	var wg sync.WaitGroup
	resultCh := make(chan []SearchResult, len(ps))
	errCh := make(chan error, len(ps))

	
	for _, provider := range ps {
		wg.Add(1)

		go func(p SearchProvider) {
			defer wg.Done()

			
			providerCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
			defer cancel()

			results, err := p.Search(providerCtx, query)
			if err != nil {
				errCh <- err
				return
			}

			resultCh <- results
		}(provider)
	}

	
	wg.Wait()
	close(resultCh)
	close(errCh)

	
	var allResults []SearchResult
	for res := range resultCh {
		allResults = append(allResults, res...)
	}

	
	var firstErr error
	for err := range errCh {
		if firstErr == nil {
			firstErr = err
		}
	}

	return allResults, firstErr
}