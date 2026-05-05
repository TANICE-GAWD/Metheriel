import { useState, useMemo } from "react";
import { Group, Paper, Text, Badge, Stack, Accordion } from "@mantine/core";
import ClaimChart from "./ClaimChart";
import "../../assets/global.css";
import "./ConflictView.css";

const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with','by',
  'from','is','are','was','were','be','been','being','have','has','had','do',
  'does','did','will','would','could','should','may','might','shall','can',
  'that','this','these','those','it','its','as','if','so','not','no','nor',
  'yet','both','either','neither','each','any','all','some','such','than',
  'then','when','where','who','which','what','how','also','more','most',
  'other','into','said','one','two','first','second','said','said',
]);

const PATENT_ID_RE = /^[A-Z]{2}\d+[A-Z0-9]*$/i;

// Simple suffix stemmer for English technical vocabulary
function stem(word) {
  const rules = [
    ['ations', 5], ['ation', 5], ['tions', 5], ['tion', 4],
    ['ings', 4], ['ing', 3], ['ments', 5], ['ment', 4],
    ['ated', 4], ['ness', 4], ['ions', 4], ['ion', 3],
    ['ers', 3], ['ous', 3], ['ive', 3], ['ful', 3],
    ['al', 2], ['ed', 2], ['ly', 2], ['er', 2], ['es', 2], ['s', 1],
  ];
  for (const [suffix, minRemaining] of rules) {
    if (word.endsWith(suffix) && word.length - suffix.length >= minRemaining) {
      return word.slice(0, -suffix.length);
    }
  }
  return word;
}

export default function ConflictView({
  claimText,
  priorArtText,
  conflicts = [],
  confidence = 0.78,
  infringements = [],
  claimChart = null,
  sourceTitle = "",
  sourceUrl = "",
}) {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [expandedConflict, setExpandedConflict] = useState(null);

  const isPatentIdOnly = useMemo(
    () => PATENT_ID_RE.test((claimText || '').trim()),
    [claimText]
  );

  // Build a set of stems from claim words for stem-based matching
  const claimStems = useMemo(() => {
    if (!claimText || isPatentIdOnly) return new Set();
    const stems = new Set();
    claimText.toLowerCase().split(/\W+/).forEach(word => {
      if (word.length > 3 && !STOP_WORDS.has(word)) {
        stems.add(stem(word));
      }
    });
    return stems;
  }, [claimText, isPatentIdOnly]);

  function renderHeatmap(text) {
    if (!text) return text;
    return text.split(/(\s+)/).map((token, idx) => {
      if (/^\s+$/.test(token)) return token;
      const clean = token.toLowerCase().replace(/\W/g, '');
      if (clean.length > 3 && !STOP_WORDS.has(clean) && claimStems.has(stem(clean))) {
        return <span key={idx} className="heat-word heat-medium">{token}</span>;
      }
      return token;
    });
  }

  // Render prior art with LLM-identified infringement phrases highlighted by strength
  function renderInfringementText(text) {
    if (!text) return text;
    if (!infringements?.length) return renderHeatmap(text);

    let parts = [text];
    infringements.forEach((match, mIdx) => {
      if (!match.phrase) return;
      parts = parts.flatMap(part => {
        if (typeof part !== 'string') return [part];
        const split = part.split(match.phrase);
        if (split.length === 1) return [part];
        const result = [];
        split.forEach((s, i) => {
          result.push(s);
          if (i < split.length - 1) {
            result.push(
              <span
                key={`inf-${mIdx}-${i}`}
                className={`infringe-phrase infringe-${match.strength || 'low'}`}
                title={`Claim element: ${match.element}`}
              >
                {match.phrase}
              </span>
            );
          }
        });
        return result;
      });
    });
    return parts;
  }

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
      {/* METRICS — always visible */}
      <Group justify="space-between" align="flex-start" mb="md" wrap="wrap" gap="md">
        <Stack gap={4}>
          <Text fw={700} size="md">Conflict Analysis</Text>
          <Text size="sm" c="dimmed">
            {totalConflicts} exact phrase overlap{totalConflicts !== 1 ? "s" : ""} detected
          </Text>
        </Stack>

        <Group gap="sm" wrap="wrap">
          <Paper withBorder p="sm" radius="sm" ta="center" miw={90}
            title="Jaccard phrase-match — exact wording overlap">
            <Text fw={700} size="xl" lh={1}>{Math.round(confidence * 100)}%</Text>
            <Text size="10px" c="dimmed" tt="uppercase" mt={2} style={{ letterSpacing: '0.4px' }}>Phrase Match</Text>
            <Text size="9px" c="dimmed" fs="italic">exact wording</Text>
          </Paper>

          <Badge
            color={risk.class === "risk-high" ? "red" : risk.class === "risk-medium" ? "orange" : "green"}
            variant="light"
            size="lg"
            p="sm"
          >
            {risk.label}
          </Badge>

          <Paper withBorder p="sm" radius="sm" ta="center" miw={90}
            title="AI element-by-element semantic match — see Claim Chart below">
            <Text fw={700} size="xl" lh={1}>
              {claimChart ? `${claimChart.overall_confidence}%` : "—"}
            </Text>
            <Text size="10px" c="dimmed" tt="uppercase" mt={2} style={{ letterSpacing: '0.4px' }}>Semantic Match</Text>
            <Text size="9px" c="dimmed" fs="italic">AI analysis</Text>
          </Paper>
        </Group>
      </Group>

      <Accordion multiple variant="separated" radius="sm">

        {/* IDENTIFIED CONFLICTS */}
        {totalConflicts > 0 && (
          <Accordion.Item value="conflicts">
            <Accordion.Control>
              <Group gap="xs">
                <Text fw={600} size="sm">Identified Conflicts</Text>
                <Badge size="sm" variant="filled" color="red">{totalConflicts}</Badge>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
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
                              conflict.similarity > 0.7 ? "#d92d20"
                              : conflict.similarity > 0.5 ? "#f59e0b"
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
                      <div className="expand-icon">{expandedConflict === idx ? "−" : "+"}</div>
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
                            {conflict.similarity > 0.7 ? "High" : conflict.similarity > 0.5 ? "Medium" : "Low"}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Accordion.Panel>
          </Accordion.Item>
        )}

        {/* SIDE-BY-SIDE COMPARISON */}
        <Accordion.Item value="comparison">
          <Accordion.Control>
            <Text fw={600} size="sm">Patent Claim vs Prior Art</Text>
          </Accordion.Control>
          <Accordion.Panel>
            <div className="conflict-container">
              <div className="conflict-pane">
                <div className="pane-header">
                  <h3>Patent Claim</h3>
                  <Badge variant="filled" color="dark" size="sm">Current</Badge>
                </div>
                {isPatentIdOnly ? (
                  <div className="patent-id-placeholder">
                    <p>Claim text for <strong>{claimText}</strong> could not be loaded.</p>
                    <a
                      href={`https://patents.google.com/patent/${claimText.trim().toUpperCase()}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View on Google Patents →
                    </a>
                  </div>
                ) : (
                  <div className="conflict-text">
                    {highlightText(claimText, conflicts, "left")}
                  </div>
                )}
              </div>

              <div className="conflict-pane">
                <div className="pane-header">
                  <h3>Prior Art Reference</h3>
                  <Badge variant="filled" color="gray" size="sm">Existing</Badge>
                </div>
                <div className="conflict-text">
                  {renderInfringementText(priorArtText)}
                </div>
                {infringements?.length > 0 ? (
                  <div className="heatmap-legend">
                    <span className="legend-label">Infringement risk:</span>
                    <span className="infringe-phrase infringe-low">low</span>
                    <span className="infringe-phrase infringe-medium">medium</span>
                    <span className="infringe-phrase infringe-high">high</span>
                  </div>
                ) : claimStems.size > 0 && (
                  <div className="heatmap-legend">
                    <span className="legend-label">Keyword match:</span>
                    <span className="heat-word heat-medium">matched term</span>
                  </div>
                )}
              </div>
            </div>
          </Accordion.Panel>
        </Accordion.Item>

        {/* CLAIM CHART */}
        {claimChart?.elements?.length > 0 && (
          <Accordion.Item value="claimchart">
            <Accordion.Control>
              <Group gap="xs">
                <Text fw={600} size="sm">Claim Chart</Text>
                <Badge size="sm" variant="light" color="blue">{claimChart.elements.length} elements</Badge>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <ClaimChart
                data={claimChart}
                sourceTitle={sourceTitle}
                sourceUrl={sourceUrl}
              />
            </Accordion.Panel>
          </Accordion.Item>
        )}

      </Accordion>
    </div>
  );
}