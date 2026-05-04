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

  
  
  

  return (
    <div className="conflict-wrapper">
      {/* OVERLAP BANNER */}
      <div className="conflict-banner">
        Overlap Score: {Math.round(confidence * 100)}%
      </div>

      <div className="conflict-container">
        {/* LEFT: CLAIM */}
        <div className="conflict-pane">
          <h3>Patent Claim</h3>
          <div className="conflict-text">
            {highlightText(claimText, conflicts, "left")}
          </div>
        </div>

        {/* RIGHT: PRIOR ART */}
        <div className="conflict-pane">
          <h3>Prior Art</h3>
          <div className="conflict-text">
            {highlightText(priorArtText, conflicts, "right")}
          </div>
        </div>
      </div>
    </div>
  );
}