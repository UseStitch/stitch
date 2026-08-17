import { ArrowUpIcon, BanIcon, HistoryIcon, InboxIcon } from 'lucide-react';

import { Icon } from '@/components/primitives/icon';
import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { formatDateTime } from '@/lib/format';

type ConsolidationRun = {
  timestamp: string;
  status: string;
  summary: string;
  candidates: number;
  promoted: number;
  rejected: number;
};

function parseCount(section: string, label: string): number {
  const match = new RegExp(`^- ${label}: (\\d+)$`, 'm').exec(section);
  return Number(match?.[1] ?? 0);
}

function parseRuns(markdown: string): ConsolidationRun[] {
  return markdown
    .split(/^## /m)
    .slice(1)
    .map((section) => {
      const [heading = '', ...body] = section.trim().split('\n');
      const separator = heading.lastIndexOf(' - ');
      const summaryLines: string[] = [];
      for (const line of body) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('- ')) summaryLines.push(trimmed);
      }

      return {
        timestamp: heading.slice(0, separator),
        status: heading.slice(separator + 3),
        summary: summaryLines.join(' '),
        candidates: parseCount(section, 'Candidates'),
        promoted: parseCount(section, 'Promoted'),
        rejected: parseCount(section, 'Rejected/no-op'),
      };
    })
    .reverse();
}

function formatTimestamp(timestamp: string): string {
  const value = Date.parse(timestamp);
  return Number.isNaN(value) ? timestamp : formatDateTime(value);
}

function statusVariant(status: string): 'default' | 'destructive' | 'soft' {
  if (status === 'accepted') return 'default';
  if (status === 'noop') return 'soft';
  return 'destructive';
}

const metrics = [
  { key: 'candidates', label: 'Candidates', icon: InboxIcon },
  { key: 'promoted', label: 'Promoted', icon: ArrowUpIcon },
  { key: 'rejected', label: 'Skipped', icon: BanIcon },
] as const;

export function ConsolidationLog({ markdown }: { markdown: string }) {
  const runs = parseRuns(markdown);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Consolidation history</CardTitle>
        <CardDescription>{runs.length} recorded runs, newest first</CardDescription>
      </CardHeader>
      <CardContent className="max-h-128 overflow-y-auto">
        {runs.length ? (
          <div className="grid grid-cols-1 gap-space-s md:grid-cols-2 lg:grid-cols-3">
            {runs.map((run) => (
              <article
                key={`${run.timestamp}-${run.status}`}
                className="flex min-h-48 flex-col gap-space-s rounded-lg border border-border p-space-m">
                <Stack direction="row" align="center" justify="between" gap="s" wrap>
                  <time>
                    <Text as="span" variant="caption" tone="muted">
                      {formatTimestamp(run.timestamp)}
                    </Text>
                  </time>
                  <Badge variant={statusVariant(run.status)} className="capitalize">
                    {run.status}
                  </Badge>
                </Stack>
                <Text as="p" variant="body" lineClamp="3">
                  {run.summary}
                </Text>
                <div className="mt-auto grid grid-cols-3 gap-space-xs pt-space-m">
                  {metrics.map(({ key, label, icon }) => (
                    <div key={key} className="rounded-md bg-surface-sunken p-space-s">
                      <Stack direction="row" align="center" gap="xs">
                        <Icon as={icon} size="s" tone="muted" />
                        <Text as="div" variant="body-strong">
                          {run[key]}
                        </Text>
                      </Stack>
                      <Text as="div" variant="caption" tone="muted" truncate>
                        {label}
                      </Text>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty>
            <EmptyMedia>
              <HistoryIcon />
            </EmptyMedia>
            <EmptyTitle>No consolidation history</EmptyTitle>
            <EmptyDescription>Run consolidation to create the first log entry.</EmptyDescription>
          </Empty>
        )}
      </CardContent>
    </Card>
  );
}
