import { useState, useRef } from "react";
import { analyzePatent } from "./services/api";
import ResultCard from "./components/Results/ResultCard";
import "./assets/global.css";
import "./App.css";
import { Analytics } from "@vercel/analytics/react"

export default function App() {
  
  
  

  const [query, setQuery] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const resultsRef = useRef(null);

  
  
  

  const handleSearch = async (e) => {
    e.preventDefault();

    if (!query.trim()) return;

    setLoading(true);
    setError("");
    setData(null);

    try {
      const response = await analyzePatent({
        claimText: query,
      });

      setData(response);

      
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({
          behavior: "smooth",
        });
      }, 100);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  
  
  

  return (
    <div className="app-container">
      {/* HEADER */}
      <header className="app-header">
        <h1>Metheriel</h1>
        <p className="text-muted">
          AI-Powered Prior Art Discovery
        </p>
      </header>

      {/* SEARCH */}
      <section className="search-section card">
        <form onSubmit={handleSearch} className="flex-column">
          <textarea
            placeholder="Paste patent claim here..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            rows={6}
            className="search-input"
          />

          <button
            className="button-primary"
            disabled={loading}
          >
            {loading ? "Analyzing..." : "Analyze Patent"}
          </button>
        </form>
      </section>

      {/* DYNAMIC SECTION */}
      <section ref={resultsRef} className="results-section">

        {/* LOADING */}
        {loading && (
          <div className="grid">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="card skeleton" style={{ height: "120px" }} />
            ))}
          </div>
        )}

        {/* ERROR */}
        {error && (
          <div className="card error-card">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* NO RESULTS */}
        {data?.status === "no_results" && (
          <div className="card empty-state">
            <h3>No Prior Art Found</h3>
            <p className="text-muted">
              Try simplifying or rephrasing your claim.
            </p>
          </div>
        )}

        {/* RESULTS */}
        {data?.results?.length > 0 && (
          <div className="grid">
            {/* KEYWORDS */}
            <div className="card">
              <h3>Extracted Keywords</h3>

              {Object.entries(data.keywords).map(([lang, words]) => (
                <div key={lang} className="keyword-group">
                  <strong>{lang}</strong>
                  <div className="keyword-list">
                    {words.map((w, i) => (
                      <span key={i} className="keyword-chip">
                        {w}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* RESULTS */}
            <div style={{ gridColumn: "1 / -1" }}>
              <h3 style={{ marginBottom: "1rem" }}>Prior Art Results</h3>
              {data.results.map((r, i) => (
                <ResultCard
                  key={i}
                  result={r}
                  claimText={query}
                />
              ))}
            </div>
            <Analytics/>
          </div>
        )}
      </section>
    </div>
  );
}