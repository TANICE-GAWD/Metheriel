import { useState, useRef } from "react";
import { analyzePatent } from "./services/api";
import "./assets/global.css";
import "./App.css";

export default function App() {
  // =========================
  // 1. STATE
  // =========================

  const [query, setQuery] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const resultsRef = useRef(null);

  // =========================
  // 2. SEARCH LOGIC
  // =========================

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

      // scroll to results after render
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

  // =========================
  // 3. RENDER
  // =========================

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
            <div className="card">
              <h3>Prior Art Results</h3>

              {data.results.map((r, i) => (
                <div key={i} className="result-item">
                  <a href={r.url} target="_blank" rel="noreferrer">
                    {r.title}
                  </a>
                  <p className="text-muted">{r.snippet}</p>
                  <div className="result-meta">
                    <span>{r.source}</span>
                    <span>
                      {new Date(r.date).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}