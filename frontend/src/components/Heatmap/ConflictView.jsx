import { useState } from "react";
import "../../assets/global.css";
import "./ConflictView.css";

export default function ConflictView({
  claimText,
  priorArtText,
  conflicts = [],
  confidence = 0.78,
}) {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [expandedConflict, setExpandedConflict] = useState(null);

  // Calculate conflict statistics
  const totalConflicts = conflicts.length;
  const avgSimilarity = conflicts.length > 0
    ? (conflicts.reduce((sum, c) => sum + c.similarity, 0) / conflicts.length).toFixed(2)
    : 0;
  const highSimilarityCount = conflicts.filter(c => c.similarity > 0.7).length;

  function highlightText(text, conflicts, side) {
    if (!text) return text;
    if (!conflicts || !Array.isArray(conflicts) || conflicts.length === 0) {
      return text;
    }

    let parts = [text];

    conflicts.forEach((conflict, index) => {
      if (!conflict) return;

      const target = side === "left" ? conflict.claim : conflict.prior;

      if (!target) return;

      parts = parts.flatMap(part => {
        if (typeof part !== "string") return [part];

        const split = part.split(target);

        if (split.length === 1) return [part];

        const result = [];
        split.forEach((s, i) => {
          result.push(s);

          if (i < split.length - 1) {
            result.push(
              <span
                key={`${index}-${i}`}
                className={`highlight-text ${hoveredIndex === index ? "active" : ""}`}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                {target}
              </span>
            );
          }
        });

        return result;
      });
    });

    return parts;
  }

  // Get risk badge based on confidence
  const getRiskBadge = () => {
    if (confidence >= 0.8) return { label: "High Risk", class: "risk-high" };
    if (confidence >= 0.5) return { label: "Medium Risk", class: "risk-medium" };
    return { label: "Low Risk", class: "risk-low" };
  };

  const risk = getRiskBadge();

  return (
    <div className="conflict-wrapper">
      {/* HEADER WITH METRICS */}
      <div className="conflict-header">
        <div className="header-left">
          <h2>Conflict Analysis</h2>
          <p className="header-subtitle">
            {totalConflicts} overlapping phrase{totalConflicts !== 1 ? "s" : ""} detected
          </p>
        </div>

        <div className="header-metrics">
          <div className="metric-card">
            <div className="metric-value">{Math.round(confidence * 100)}%</div>
            <div className="metric-label">Overlap Score</div>
          </div>

          <div className="metric-card">
            <div className={`metric-badge ${risk.class}`}>
              {risk.label}
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-value">{avgSimilarity}</div>
            <div className="metric-label">Avg Similarity</div>
          </div>
        </div>
      </div>

      {/* CONFLICT DETAILS TAB */}
      {totalConflicts > 0 && (
        <div className="conflict-details-section">
          <div className="section-title">
            <span>Identified Conflicts</span>
            <span className="conflict-count">{totalConflicts}</span>
          </div>

          <div className="conflict-list">
            {conflicts.map((conflict, idx) => (
              <div
                key={idx}
                className={`conflict-item ${expandedConflict === idx ? "expanded" : ""}`}
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                <div
                  className="conflict-item-header"
                  onClick={() => setExpandedConflict(expandedConflict === idx ? null : idx)}
                >
                  <div className="conflict-similarity-bar">
                    <div
                      className="similarity-fill"
                      style={{
                        width: `${conflict.similarity * 100}%`,
                        backgroundColor:
                          conflict.similarity > 0.7
                            ? "#d92d20"
                            : conflict.similarity > 0.5
                            ? "#f59e0b"
                            : "#10b981",
                      }}
                    />
                  </div>

                  <div className="conflict-item-content">
                    <div className="conflict-preview">
                      <strong>Claim:</strong> {conflict.claim.substring(0, 60)}
                      {conflict.claim.length > 60 ? "..." : ""}
                    </div>
                    <div className="similarity-score">
                      Similarity: {(conflict.similarity * 100).toFixed(0)}%
                    </div>
                  </div>

                  <div className="expand-icon">
                    {expandedConflict === idx ? "−" : "+"}
                  </div>
                </div>

                {expandedConflict === idx && (
                  <div className="conflict-item-details">
                    <div className="detail-row">
                      <span className="detail-label">From Patent Claim:</span>
                      <span className="detail-text">{conflict.claim}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">In Prior Art:</span>
                      <span className="detail-text">{conflict.prior}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Overlap Strength:</span>
                      <span className="detail-strength">
                        {conflict.similarity > 0.7
                          ? "High"
                          : conflict.similarity > 0.5
                          ? "Medium"
                          : "Low"}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SIDE-BY-SIDE COMPARISON */}
      <div className="conflict-container">
        {/* LEFT: CLAIM */}
        <div className="conflict-pane">
          <div className="pane-header">
            <h3>Patent Claim</h3>
            <span className="pane-badge">Current</span>
          </div>
          <div className="conflict-text">
            {highlightText(claimText, conflicts, "left")}
          </div>
        </div>

        {/* RIGHT: PRIOR ART */}
        <div className="conflict-pane">
          <div className="pane-header">
            <h3>Prior Art Reference</h3>
            <span className="pane-badge">Existing</span>
          </div>
          <div className="conflict-text">
            {highlightText(priorArtText, conflicts, "right")}
          </div>
        </div>
      </div>
    </div>
  );
}