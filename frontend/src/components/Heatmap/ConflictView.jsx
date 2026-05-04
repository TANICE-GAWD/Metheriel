import { useState } from "react";
import "../../assets/global.css";
import "./ConflictView.css";



export default function ConflictView({
  claimText,
  priorArtText,
  conflicts = [],
  confidence = 0.78,
}) {
  const [hoveredId, setHoveredId] = useState(null);

  
  
  

  const highlightText = (text, side) => {
    if (!conflicts.length) return text;

    let parts = [text];

    conflicts.forEach((conflict) => {
      const regex = new RegExp(`(${conflict.keyword})`, "gi");

      parts = parts.flatMap((part) => {
        if (typeof part !== "string") return [part];

        return part.split(regex).map((chunk, i) => {
          if (regex.test(chunk)) {
            return {
              text: chunk,
              id: conflict.id,
            };
          }
          return chunk;
        });
      });
    });

    return parts.map((part, i) => {
      if (typeof part === "string") {
        return <span key={i}>{part}</span>;
      }

      return (
        <span
          key={i}
          className={`highlight-text ${
            hoveredId === part.id ? "active" : ""
          }`}
          onMouseEnter={() => setHoveredId(part.id)}
          onMouseLeave={() => setHoveredId(null)}
        >
          {part.text}
        </span>
      );
    });
  };

  
  
  

  return (
    <div className="conflict-wrapper">

      {/* PROOF BANNER */}
      <div className="conflict-banner">
        <strong>Overlap Confidence:</strong>{" "}
        {(confidence * 100).toFixed(1)}%
      </div>

      <div className="conflict-container">

        {/* LEFT: CLAIM */}
        <div className="conflict-pane">
          <h3>Patent Claim</h3>
          <div className="conflict-text">
            {highlightText(claimText, "left")}
          </div>
        </div>

        {/* RIGHT: PRIOR ART */}
        <div className="conflict-pane">
          <h3>Prior Art</h3>
          <div className="conflict-text">
            {highlightText(priorArtText, "right")}
          </div>
        </div>

      </div>
    </div>
  );
}