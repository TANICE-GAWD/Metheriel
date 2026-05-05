import { useState } from "react";
import ConflictView from "../Heatmap/ConflictView";
import { getDetailedAnalysis, checkInfringement, generateClaimChart } from "../../services/api";
import "./ResultCard.css";

export default function ResultCard({ result, claimText }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  
  
  

  const handleToggle = async () => {
    if (isExpanded) {
      setIsExpanded(false);
      return;
    }

    setIsExpanded(true);

    if (analysis) return;

    setLoading(true);
    setError("");

    try {
      const [data, infringement, chart] = await Promise.all([
        getDetailedAnalysis({ claimText, priorArtText: result.snippet }),
        checkInfringement({ claimText, priorArtText: result.snippet }),
        generateClaimChart({
          claimText,
          priorArtText: result.snippet,
          sourceTitle: result.title,
          sourceUrl: result.url,
        }),
      ]);

      setAnalysis({
        ...data,
        infringements: infringement.matches || [],
        claimChart: chart,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  
  
  

  const getScoreClass = () => {
    if (!result.score) return "";

    if (result.score > 0.8) return "high";
    if (result.score > 0.5) return "medium";
    return "low";
  };

  
  
  

  return (
    <div className={`result-card ${getScoreClass()}`}>

      {/* TOP BAR WITH INDICATORS */}
      <div className="result-top-bar">
        <div className="result-badge-group">
          <span className="source-badge">{result.source}</span>
          <span className="language-badge">{result.language}</span>
        </div>
        <div className="result-date">
          {new Date(result.date).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </div>
      </div>

      {/* HEADER */}
      <div className="result-header">
        <a href={result.url} target="_blank" rel="noreferrer" className="result-title">
          {result.title}
        </a>
      </div>

      {/* SNIPPET */}
      <p className="result-snippet">
        {result.snippet.length > 300
          ? result.snippet.substring(0, 300) + "..."
          : result.snippet}
      </p>

      {/* ACTION BUTTONS */}
      <div className="result-actions">
        <button
          className="button-analyze"
          onClick={handleToggle}
          disabled={loading}
        >
          {loading ? (
            <>
              <span className="spinner"></span>
              Analyzing...
            </>
          ) : isExpanded ? (
            <>
              ✕ Hide Analysis
            </>
          ) : (
            <>
              → View Conflict Analysis
            </>
          )}
        </button>

        <a
          href={result.url}
          target="_blank"
          rel="noreferrer"
          className="button-external"
          title="Open in new tab"
        >
          ↗
        </a>
      </div>

      {/* ERROR */}
      {error && (
        <div className="result-error">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* CONFLICT VIEW */}
      {isExpanded && analysis && (
        <ConflictView
          claimText={claimText}
          priorArtText={result.snippet}
          conflicts={analysis.conflicts}
          confidence={analysis.confidence}
          infringements={analysis.infringements || []}
          claimChart={analysis.claimChart}
          sourceTitle={result.title}
          sourceUrl={result.url}
        />
      )}

    </div>
  );
}