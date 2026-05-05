import { useState, useRef } from 'react';
import {
  Container, Stack, Group, Title, Text, SegmentedControl,
  TextInput, Textarea, Button, Card, SimpleGrid, Skeleton,
  Alert, Paper, Divider,
} from '@mantine/core';
import { analyzePatent, analyzePatentById } from './services/api';
import ResultCard from './components/Results/ResultCard';
import { Analytics } from '@vercel/analytics/react';
import './App.css';

const EXAMPLE_IDS = ['US9419951B1', 'US7123456B2'];

export default function App() {
  const [mode, setMode]         = useState('id');
  const [query, setQuery]       = useState('');
  const [claimText, setClaimText] = useState('');
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const resultsRef = useRef(null);

  const handleModeSwitch = (next) => {
    setMode(next);
    setQuery('');
    setClaimText('');
    setData(null);
    setError('');
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    setData(null);
    setClaimText('');

    try {
      const looksLikePatentId = /^[A-Z]{2}\d+[A-Z0-9]*$/i.test(query.trim());
      const response = mode === 'id' || looksLikePatentId
        ? await analyzePatentById({ patentId: query })
        : await analyzePatent({ claimText: query });

      setClaimText(response.claim_text || query);
      setData(response);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-root">
      <Container size="lg" py="xl">

        {/* ── HEADER ── */}
        <Stack align="center" gap="xs" mb="xl">
          <Title order={1} className="app-title">Metheriel</Title>
          <Text c="dimmed" size="sm">AI-Powered Prior Art Discovery &amp; Patent Infringement Analysis</Text>
        </Stack>

        {/* ── SEARCH ── */}
        <Card shadow="sm" mb="xl" p="lg" style={{ borderTop: '3px solid var(--mantine-color-blue-6)' }}>
          <Stack gap="md">
            <SegmentedControl
              value={mode}
              onChange={handleModeSwitch}
              data={[
                { label: 'Patent ID', value: 'id' },
                { label: 'Paste Claim', value: 'claim' },
              ]}
              w="fit-content"
            />

            <form onSubmit={handleSearch}>
              <Stack gap="sm">
                {mode === 'id' ? (
                  <>
                    <TextInput
                      placeholder="e.g. US9419951B1 or patents.google.com URL"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      size="md"
                      spellCheck={false}
                    />
                    <Group gap="xs" align="center">
                      <Text size="sm" c="dimmed">Try:</Text>
                      {EXAMPLE_IDS.map(id => (
                        <button
                          key={id}
                          type="button"
                          className="example-chip"
                          onClick={() => setQuery(id)}
                        >
                          {id}
                        </button>
                      ))}
                    </Group>
                  </>
                ) : (
                  <Textarea
                    placeholder="Paste patent claim here..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    rows={6}
                    size="md"
                  />
                )}

                <Button
                  type="submit"
                  loading={loading}
                  size="md"
                  color="blue"
                  w={180}
                >
                  {loading ? 'Analyzing…' : 'Analyze Patent'}
                </Button>
              </Stack>
            </form>
          </Stack>
        </Card>

        {/* ── RESULTS ── */}
        <div ref={resultsRef}>

          {loading && (
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" mb="md">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} height={120} radius="md" />
              ))}
            </SimpleGrid>
          )}

          {error && (
            <Alert color="red" title="Error" mb="md" radius="md">
              {error}
            </Alert>
          )}

          {data?.status === 'no_results' && (
            <Paper withBorder p="xl" radius="md" ta="center">
              <Title order={4} mb="xs">No Prior Art Found</Title>
              <Text c="dimmed" size="sm">Try simplifying or rephrasing your claim.</Text>
            </Paper>
          )}

          {data?.results?.length > 0 && (
            <Stack gap="xl">
              <Divider label={<Text size="xs" tt="uppercase" fw={700} c="dimmed" style={{ letterSpacing: '0.5px' }}>Analysis Results</Text>} labelPosition="left" />

              {/* Keywords */}
              <Card shadow="sm" p="md">
                <Group gap="xs" mb="sm" align="center">
                  <div style={{ width: 3, height: 16, background: 'var(--mantine-color-blue-6)', borderRadius: 2 }} />
                  <Text fw={700} size="sm" tt="uppercase" c="dimmed" style={{ letterSpacing: '0.5px' }}>
                    Extracted Keywords
                  </Text>
                </Group>
                <Stack gap="xs">
                  {Object.entries(data.keywords).map(([lang, words]) => (
                    <Group key={lang} gap="xs" wrap="wrap">
                      <Text size="xs" fw={700} c="dimmed" w={24}>{lang}</Text>
                      {words.map((w, i) => (
                        <span key={i} className="keyword-chip">{w}</span>
                      ))}
                    </Group>
                  ))}
                </Stack>
              </Card>

              {/* Result cards */}
              <Stack gap="md">
                <Group gap="xs" align="center">
                  <div style={{ width: 3, height: 16, background: 'var(--mantine-color-blue-6)', borderRadius: 2 }} />
                  <Text fw={700} size="sm" tt="uppercase" c="dimmed" style={{ letterSpacing: '0.5px' }}>
                    Prior Art Results — {data.results.length} found
                  </Text>
                </Group>
                {data.results.map((r, i) => (
                  <ResultCard key={i} result={r} claimText={claimText} />
                ))}
              </Stack>
            </Stack>
          )}
        </div>

      </Container>
      <Analytics />
    </div>
  );
}
