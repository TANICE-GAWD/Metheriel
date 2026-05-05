import { useState } from "react";
import "./ClaimChart.css";

const VERDICT_META = {
  strong:   { label: "Strong Prior Art",   cls: "verdict-strong"   },
  moderate: { label: "Moderate Prior Art", cls: "verdict-moderate" },
  weak:     { label: "Weak Prior Art",     cls: "verdict-weak"     },
  none:     { label: "No Match Found",     cls: "verdict-none"     },
};

const STATUS_META = {
  disclosed: { icon: "✓", cls: "status-disclosed", label: "Disclosed"  },
  partial:   { icon: "◑", cls: "status-partial",   label: "Partial"    },
  absent:    { icon: "✗", cls: "status-absent",     label: "Absent"     },
};

function ConfidenceBar({ value }) {
  const color =
    value >= 70 ? "#15803d" :
    value >= 40 ? "#b45309" : "#b91c1c";
  return (
    <div className="conf-bar-wrap">
      <div
        className="conf-bar-fill"
        style={{ width: `${value}%`, background: color }}
      />
      <span className="conf-bar-label" style={{ color }}>{value}%</span>
    </div>
  );
}

function exportCSV(elements, sourceTitle) {
  const rows = [
    ["#", "Claim Element", "Prior Art Disclosure", "Confidence (%)", "Status"],
    ...elements.map(el => [
      el.num,
      `"${el.element.replace(/"/g, '""')}"`,
      `"${el.disclosure.replace(/"/g, '""')}"`,
      el.confidence,
      el.status,
    ]),
  ];
  const csv = rows.map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `claim-chart-${sourceTitle ? sourceTitle.slice(0, 30).replace(/\s+/g, "-") : "export"}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ClaimChart({ data, sourceTitle, sourceUrl }) {
  const [expanded, setExpanded] = useState(null);

  if (!data) return null;

  const { elements = [], overall_confidence = 0, verdict = "none" } = data;
  const verdictMeta = VERDICT_META[verdict] || VERDICT_META.none;

  const disclosed = elements.filter(e => e.status === "disclosed").length;
  const partial   = elements.filter(e => e.status === "partial").length;
  const absent    = elements.filter(e => e.status === "absent").length;

  return (
    <div className="claim-chart-wrapper">
      {/* ── HEADER ── */}
      <div className="cc-header">
        <div className="cc-header-left">
          <h2 className="cc-title">Claim Chart</h2>
          {sourceTitle && (
            <p className="cc-source">
              vs.{" "}
              {sourceUrl
                ? <a href={sourceUrl} target="_blank" rel="noreferrer">{sourceTitle}</a>
                : sourceTitle}
            </p>
          )}
        </div>

        <div className="cc-header-right">
          <div className={`cc-verdict ${verdictMeta.cls}`}>{verdictMeta.label}</div>

          <div className="cc-overall">
            <div className="cc-overall-value">{overall_confidence}%</div>
            <div className="cc-overall-label">Overall Match</div>
          </div>

          <button
            className="cc-export-btn"
            onClick={() => exportCSV(elements, sourceTitle)}
            title="Download as CSV"
          >
            ↓ Export CSV
          </button>
        </div>
      </div>

      {/* ── SUMMARY PILLS ── */}
      <div className="cc-summary">
        <span className="cc-pill pill-disclosed">✓ {disclosed} Disclosed</span>
        <span className="cc-pill pill-partial">◑ {partial} Partial</span>
        <span className="cc-pill pill-absent">✗ {absent} Absent</span>
        <span className="cc-pill pill-total">{elements.length} Elements Total</span>
      </div>

      {/* ── TABLE ── */}
      <div className="cc-table-wrap">
        <table className="cc-table">
          <thead>
            <tr>
              <th className="col-num">#</th>
              <th className="col-element">Claim Element</th>
              <th className="col-disclosure">Prior Art Disclosure</th>
              <th className="col-conf">Match</th>
              <th className="col-status">Status</th>
            </tr>
          </thead>
          <tbody>
            {elements.map((el, idx) => {
              const sm = STATUS_META[el.status] || STATUS_META.absent;
              const isOpen = expanded === idx;
              return (
                <tr
                  key={idx}
                  className={`cc-row cc-row-${el.status} ${isOpen ? "cc-row-open" : ""}`}
                  onClick={() => setExpanded(isOpen ? null : idx)}
                >
                  <td className="col-num">{el.num}</td>

                  <td className="col-element">
                    <div className={`cc-element-text ${isOpen ? "" : "cc-clamp"}`}>
                      {el.element}
                    </div>
                  </td>

                  <td className="col-disclosure">
                    {el.disclosure === "Not disclosed" ? (
                      <span className="no-disclosure">Not disclosed</span>
                    ) : (
                      <div className={`cc-disclosure-text ${isOpen ? "" : "cc-clamp"}`}>
                        "{el.disclosure}"
                      </div>
                    )}
                  </td>

                  <td className="col-conf">
                    <ConfidenceBar value={el.confidence} />
                  </td>

                  <td className="col-status">
                    <span className={`cc-status-badge ${sm.cls}`}>
                      {sm.icon} {sm.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
