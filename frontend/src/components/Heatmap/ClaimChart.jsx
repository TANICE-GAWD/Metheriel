import { useState } from 'react';
import {
  Table, Badge, Progress, Button, Text, Group, Stack,
  Paper, Anchor, Divider,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import './ClaimChart.css';

const STATUS = {
  disclosed: { color: 'green',  icon: '✓', label: 'Disclosed' },
  partial:   { color: 'orange', icon: '◑', label: 'Partial'   },
  absent:    { color: 'red',    icon: '✗', label: 'Absent'    },
};

const VERDICT = {
  strong:   { color: 'green',  label: 'Strong Prior Art'   },
  moderate: { color: 'orange', label: 'Moderate Prior Art' },
  weak:     { color: 'red',    label: 'Weak Prior Art'     },
  none:     { color: 'gray',   label: 'No Match Found'     },
};

function exportCSV(elements, sourceTitle) {
  const rows = [
    ['#', 'Claim Element', 'Prior Art Disclosure', 'Confidence (%)', 'Status'],
    ...elements.map(el => [
      el.num,
      `"${el.element.replace(/"/g, '""')}"`,
      `"${el.disclosure.replace(/"/g, '""')}"`,
      el.confidence,
      el.status,
    ]),
  ];
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `claim-chart-${(sourceTitle || 'export').slice(0, 30).replace(/\s+/g, '-')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ClaimChart({ data, sourceTitle, sourceUrl }) {
  const [openRow, setOpenRow] = useState(null);
  const isMobile = useMediaQuery('(max-width: 768px)');

  if (!data || !data.elements?.length) return null;

  const { elements, overall_confidence = 0, verdict = 'none' } = data;
  const vm = VERDICT[verdict] || VERDICT.none;

  const disclosed = elements.filter(e => e.status === 'disclosed').length;
  const partial   = elements.filter(e => e.status === 'partial').length;
  const absent    = elements.filter(e => e.status === 'absent').length;

  return (
    <Stack gap="md">
      {/* Header */}
      <Group justify="space-between" wrap="wrap" gap="sm">
        <Stack gap={4}>
          <Text fw={700} size="lg">Claim Chart</Text>
          {sourceTitle && (
            <Text size="sm" c="dimmed">
              vs.{' '}
              {sourceUrl
                ? <Anchor href={sourceUrl} target="_blank" rel="noreferrer" size="sm">{sourceTitle}</Anchor>
                : sourceTitle}
            </Text>
          )}
        </Stack>

        <Group gap="sm" wrap="wrap">
          <Badge color={vm.color} variant="light" size="lg">{vm.label}</Badge>

          <Paper withBorder p="xs" radius="sm" ta="center" miw={90}>
            <Text fw={700} size="xl" lh={1}>{overall_confidence}%</Text>
            <Text size="10px" c="dimmed" tt="uppercase" style={{ letterSpacing: '0.4px' }}>
              Semantic Match
            </Text>
          </Paper>

          <Button
            variant="outline"
            color="blue"
            size="xs"
            onClick={() => exportCSV(elements, sourceTitle)}
          >
            ↓ Export CSV
          </Button>
        </Group>
      </Group>

      {/* Summary pills */}
      <Group gap="xs" wrap="wrap">
        <Badge color="green"  variant="light">✓ {disclosed} Disclosed</Badge>
        <Badge color="orange" variant="light">◑ {partial} Partial</Badge>
        <Badge color="red"    variant="light">✗ {absent} Absent</Badge>
        <Badge color="gray"   variant="outline">{elements.length} Elements</Badge>
      </Group>

      {/* Mobile: card per element */}
      {isMobile ? (
        <Stack gap="sm">
          {elements.map((el, idx) => {
            const sm = STATUS[el.status] || STATUS.absent;
            const barColor = el.confidence >= 70 ? 'green' : el.confidence >= 40 ? 'orange' : 'red';
            const isOpen = openRow === idx;
            return (
              <Paper
                key={idx}
                withBorder
                radius="sm"
                p="sm"
                style={{ borderLeft: `3px solid var(--mantine-color-${sm.color}-6)`, cursor: 'pointer' }}
                onClick={() => setOpenRow(isOpen ? null : idx)}
              >
                <Group justify="space-between" mb={6} wrap="nowrap">
                  <Text size="xs" fw={600} c="dimmed">#{el.num}</Text>
                  <Badge color={sm.color} variant="light" size="sm">{sm.icon} {sm.label}</Badge>
                </Group>

                <Text size="xs" fs="italic" c="dark" mb={8} lineClamp={isOpen ? undefined : 2}>
                  {el.element}
                </Text>

                <Stack gap={4} mb={isOpen ? 8 : 0}>
                  <Progress value={el.confidence} color={barColor} size="sm" radius="xs" />
                  <Text size="10px" fw={600} c={barColor}>{el.confidence}% match</Text>
                </Stack>

                {isOpen && (
                  <>
                    <Divider my={8} />
                    <Text size="xs" fw={600} c="dimmed" mb={4}>Prior Art Disclosure</Text>
                    {el.disclosure === 'Not disclosed' ? (
                      <Text size="xs" c="red" fs="italic">Not disclosed</Text>
                    ) : (
                      <Text size="xs" c="dimmed" fs="italic">"{el.disclosure}"</Text>
                    )}
                  </>
                )}
              </Paper>
            );
          })}
        </Stack>
      ) : (
        /* Desktop: table */
        <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
          <Table striped highlightOnHover withColumnBorders={false} verticalSpacing="sm">
            <Table.Thead style={{ background: '#1a1a2e' }}>
              <Table.Tr>
                <Table.Th style={{ color: '#fff', width: 40, textAlign: 'center' }}>#</Table.Th>
                <Table.Th style={{ color: '#fff', width: '32%' }}>Claim Element</Table.Th>
                <Table.Th style={{ color: '#fff' }}>Prior Art Disclosure</Table.Th>
                <Table.Th style={{ color: '#fff', width: 110 }}>Match</Table.Th>
                <Table.Th style={{ color: '#fff', width: 110 }}>Status</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {elements.map((el, idx) => {
                const sm      = STATUS[el.status] || STATUS.absent;
                const isOpen  = openRow === idx;
                const barColor = el.confidence >= 70 ? 'green' : el.confidence >= 40 ? 'orange' : 'red';
                return (
                  <Table.Tr
                    key={idx}
                    onClick={() => setOpenRow(isOpen ? null : idx)}
                    style={{ cursor: 'pointer', borderLeft: `3px solid var(--mantine-color-${sm.color}-6)` }}
                  >
                    <Table.Td ta="center">
                      <Text size="xs" fw={600} c="dimmed">{el.num}</Text>
                    </Table.Td>

                    <Table.Td>
                      <Text size="xs" fs="italic" c="dark" lineClamp={isOpen ? undefined : 2}>
                        {el.element}
                      </Text>
                    </Table.Td>

                    <Table.Td>
                      {el.disclosure === 'Not disclosed' ? (
                        <Text size="xs" c="red" fs="italic">Not disclosed</Text>
                      ) : (
                        <Text size="xs" c="dimmed" lineClamp={isOpen ? undefined : 2}>
                          "{el.disclosure}"
                        </Text>
                      )}
                    </Table.Td>

                    <Table.Td>
                      <Stack gap={4}>
                        <Progress value={el.confidence} color={barColor} size="sm" radius="xs" />
                        <Text size="10px" fw={600} c={barColor}>{el.confidence}%</Text>
                      </Stack>
                    </Table.Td>

                    <Table.Td>
                      <Badge color={sm.color} variant="light" size="sm">
                        {sm.icon} {sm.label}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Paper>
      )}
    </Stack>
  );
}
