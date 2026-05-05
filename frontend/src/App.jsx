import { useState, useRef } from "react";
import { analyzePatent, analyzePatentById } from "./services/api";
import ResultCard from "./components/Results/ResultCard";
import "./assets/global.css";
import "./App.css";
import { Analytics } from "@vercel/analytics/react"

export default function App() {
  const [mode, setMode] = useState("id"); // "id" | "claim"
  const [query, setQuery] = useState("");
  const [claimText, setClaimText] = useState(""); // actual claim text, resolved after scrape
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const resultsRef = useRef(null);

  const handleModeSwitch = (next) => {
    setMode(next);
    setQuery("");
    setClaimText("");
    setData(null);
    setError("");
  };

  const handleSearch = async (e) => {
    e.preventDefault();

    if (!query.trim()) return;

    setLoading(true);
    setError("");
    setData(null);
    setClaimText("");

    try {
      // Auto-detect a bare patent ID even when the user is in paste-claim mode.
      const looksLikePatentId = /^[A-Z]{2}\d+[A-Z0-9]*$/i.test(query.trim());
      const response =
        mode === "id" || looksLikePatentId
          ? await analyzePatentById({ patentId: query })
          : await analyzePatent({ claimText: query });

      // analyzePatentById always echoes the scraped claim; fall back to raw input only for paste mode.
      setClaimText(response.claim_text || query);
      setData(response);

      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth" });
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
        {/* Mode toggle */}
        <div className="mode-toggle">
          <button
            type="button"
            className={`mode-btn${mode === "id" ? " mode-btn--active" : ""}`}
            onClick={() => handleModeSwitch("id")}
          >
            Patent ID
          </button>
          <button
            type="button"
            className={`mode-btn${mode === "claim" ? " mode-btn--active" : ""}`}
            onClick={() => handleModeSwitch("claim")}
          >
            Paste Claim
          </button>
        </div>

        <form onSubmit={handleSearch} className="flex-column">
          {mode === "id" ? (
            <>
              <input
                type="text"
                placeholder="e.g. US7123456B2 or paste a patents.google.com URL"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="search-input"
                spellCheck={false}
              />
              <div className="example-chips">
                <span className="example-label">Try:</span>
                {["US9419951B1", "US7123456B2"].map(id => (
                  <button
                    key={id}
                    type="button"
                    className="example-chip"
                    onClick={() => setQuery(id)}
                  >
                    {id}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <textarea
              placeholder="Paste patent claim here..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              rows={6}
              className="search-input"
            />
          )}

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
                  claimText={claimText}
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