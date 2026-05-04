import { useState } from "react";
import ConflictView from "../Heatmap/ConflictView";
import { getDetailedAnalysis } from "../../services/api";
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
      const data = await getDetailedAnalysis({
        patentText: claimText,
        priorArtText: result.snippet,
      });

      setAnalysis(data);
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

      {/* HEADER */}
      <div className="result-header">
        <a href={result.url} target="_blank" rel="noreferrer">
          {result.title}
        </a>

        <div className="result-meta">
          <span>{result.source}</span>
          <span>
            {new Date(result.date).toLocaleDateString()}
          </span>
        </div>
      </div>

      {/* SNIPPET */}
      <p className="result-snippet">
        {result.snippet}
      </p>

      {/* ACTION */}
      <button
        className="button-primary"
        onClick={handleToggle}
        disabled={loading}
      >
        {loading
          ? "Analyzing..."
          : isExpanded
          ? "Hide Analysis"
          : "View Analysis"}
      </button>

      {/* ERROR */}
      {error && (
        <div className="error-text">
          {error}
        </div>
      )}

      {/* EXPANDED VIEW */}
      {isExpanded && analysis && (
        <ConflictView
          claimText={claimText}
          priorArtText={result.snippet}
          conflicts={analysis.conflicts}
          confidence={analysis.confidence}
        />
      )}
    </div>
  );
}