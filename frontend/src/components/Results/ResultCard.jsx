import { useState } from 'react';
import {
  Card, Group, Badge, Text, Button, Anchor, Stack, Divider,
} from '@mantine/core';
import ConflictView from '../Heatmap/ConflictView';
import { getDetailedAnalysis, checkInfringement, generateClaimChart } from '../../services/api';

const SCORE_COLOR = (s) => s > 0.8 ? 'red' : s > 0.5 ? 'orange' : 'gray';

export default function ResultCard({ result, claimText }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [analysis, setAnalysis]     = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');

  const handleToggle = async () => {
    if (isExpanded) { setIsExpanded(false); return; }
    setIsExpanded(true);
    if (analysis) return;

    setLoading(true);
    setError('');
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
      setAnalysis({ ...data, infringements: infringement.matches || [], claimChart: chart });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const dateStr = result.date
    ? new Date(result.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : null;

  return (
    <Card shadow="sm" withBorder radius="md" p={0} style={{ overflow: 'visible' }}>
      {/* Top accent bar */}
      {result.score > 0 && (
        <div
          style={{
            height: 3,
            background: result.score > 0.8 ? '#c92a2a' : result.score > 0.5 ? '#e67700' : '#868e96',
            borderRadius: '6px 6px 0 0',
          }}
        />
      )}

      <Stack gap={0} p="md">
        {/* Meta row */}
        <Group justify="space-between" mb="xs" wrap="wrap" gap="xs">
          <Group gap="xs">
            <Badge variant="light" color="blue" size="sm">{result.source}</Badge>
            {result.language && result.language !== 'en' && (
              <Badge variant="outline" color="gray" size="sm">{result.language}</Badge>
            )}
          </Group>
          <Group gap="sm">
            {result.score > 0 && (
              <Badge color={SCORE_COLOR(result.score)} variant="filled" size="sm">
                {Math.round(result.score * 100)}% match
              </Badge>
            )}
            {dateStr && <Text size="xs" c="dimmed">{dateStr}</Text>}
          </Group>
        </Group>

        {/* Title */}
        <Anchor href={result.url} target="_blank" rel="noreferrer" fw={600} size="sm" c="dark" lineClamp={2} mb="xs">
          {result.title}
        </Anchor>

        {/* Snippet */}
        <Text size="sm" c="dimmed" lineClamp={3} mb="md">
          {result.snippet}
        </Text>

        {/* Actions */}
        <Group gap="xs">
          <Button
            variant={isExpanded ? 'outline' : 'filled'}
            color="blue"
            size="xs"
            loading={loading}
            onClick={handleToggle}
          >
            {loading ? 'Analyzing…' : isExpanded ? '✕ Hide Analysis' : '→ View Conflict Analysis'}
          </Button>
          <Anchor href={result.url} target="_blank" rel="noreferrer" size="xs" c="dimmed">
            ↗ Open
          </Anchor>
        </Group>

        {error && (
          <Text size="xs" c="red" mt="xs">{error}</Text>
        )}
      </Stack>

      {/* Expanded analysis */}
      {isExpanded && analysis && (
        <>
          <Divider />
          <div style={{ padding: '1rem' }}>
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
          </div>
        </>
      )}
    </Card>
  );
}
