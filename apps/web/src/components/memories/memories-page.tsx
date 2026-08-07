import { BrainIcon, FolderOpenIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import * as React from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { CuratedFile } from '@/components/memories/curated-file';
import { DailyFile } from '@/components/memories/daily-file';
import { MemoryDetailSheet } from '@/components/memories/memory-detail-sheet';
import { Icon } from '@/components/primitives/icon';
import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty';
import {
  Page,
  PageContent,
  PageDescription,
  PageHeader,
  PageHeaderContent,
  PageIcon,
  PageTitle,
} from '@/components/ui/page';
import { SearchInput } from '@/components/ui/search-input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ManagedMemoryEntry, MemoryFileSnapshot } from '@/lib/queries/memories';
import {
  consolidateMemoryMutationOptions,
  dailyMemoryQueryOptions,
  memoryFilesQueryOptions,
  memorySearchQueryOptions,
  openMemoryFolderMutationOptions,
  resetMemoriesMutationOptions,
} from '@/lib/queries/memories';

type Tab = 'memory' | 'user' | 'daily' | 'dreams';

export function MemoriesPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = React.useState<Tab>('memory');
  const [search, setSearch] = React.useState('');
  const [selected, setSelected] = React.useState<{ entry: ManagedMemoryEntry; file: MemoryFileSnapshot } | null>(null);
  const [resetOpen, setResetOpen] = React.useState(false);
  const overview = useQuery(memoryFilesQueryOptions);
  const daily = useQuery(dailyMemoryQueryOptions());
  const searchQuery = useQuery(memorySearchQueryOptions(search.trim()));
  const consolidate = useMutation(consolidateMemoryMutationOptions(queryClient));
  const reset = useMutation(resetMemoriesMutationOptions(queryClient));
  const openFolder = useMutation(openMemoryFolderMutationOptions());

  const data = overview.data;
  const cards = [
    ['Long-term usage', data?.memory.capacity ? `${data.memory.capacity.used} / ${data.memory.capacity.limit}` : '-'],
    ['Profile usage', data?.user.capacity ? `${data.user.capacity.used} / ${data.user.capacity.limit}` : '-'],
    ['Daily candidates', String(data?.pendingCandidateCount ?? 0)],
    ['Last consolidation', data?.consolidation.status ?? 'never'],
  ];

  function openSearchResult(filePath: string) {
    if (filePath === 'USER.md') setTab('user');
    else if (filePath.startsWith('daily/')) setTab('daily');
    else setTab('memory');
    setSearch('');
  }

  return (
    <Page>
      <PageContent>
        <PageHeader>
          <PageHeaderContent>
            <PageIcon>
              <Icon as={BrainIcon} size="l" />
            </PageIcon>
            <div>
              <PageTitle>Memory files</PageTitle>
              <PageDescription>Inspectable Markdown, curated locally</PageDescription>
            </div>
          </PageHeaderContent>
          <Stack direction="row" wrap gap="s">
            <Button variant="outline" size="sm" onClick={() => openFolder.mutate()}>
              <FolderOpenIcon /> Open folder
            </Button>
            <Button variant="outline" size="sm" onClick={() => consolidate.mutate()} disabled={consolidate.isPending}>
              <RefreshCwIcon /> {consolidate.isPending ? 'Running...' : 'Consolidate'}
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setResetOpen(true)}>
              <Trash2Icon /> Reset
            </Button>
          </Stack>
        </PageHeader>

        <div className="grid grid-cols-2 gap-space-m lg:grid-cols-4">
          {cards.map(([label, value]) => (
            <Card key={label} size="sm">
              <CardHeader>
                <CardDescription>{label}</CardDescription>
                <CardTitle className="capitalize">{value}</CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>

        <div className="relative mt-space-xl max-w-xl">
          <SearchInput
            placeholder="Search curated and daily memory..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {search.trim() && searchQuery.data ? (
            <Card className="absolute z-20 mt-space-s max-h-80 w-full overflow-y-auto shadow-lg">
              <CardContent className="space-y-space-s">
                {searchQuery.data.results.map((result) => (
                  <Button
                    key={`${result.filePath}:${result.lineStart}`}
                    type="button"
                    variant="ghost"
                    size="inline"
                    width="full"
                    align="start"
                    onClick={() => openSearchResult(result.filePath)}>
                    <span className="block w-full p-space-s">
                      <div>
                        <Text as="span" variant="caption" tone="muted">
                          {result.filePath}:{result.lineStart}
                        </Text>
                      </div>
                      <span className="block">{result.excerpt}</span>
                    </span>
                  </Button>
                ))}
                {searchQuery.data.results.length === 0 ? (
                  <Text as="p" variant="body" tone="muted">
                    No matches.
                  </Text>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)} className="mt-space-xl">
          <TabsList variant="line" className="max-w-full flex-wrap justify-start group-data-horizontal/tabs:h-auto">
            <TabsTrigger value="memory">Long-term</TabsTrigger>
            <TabsTrigger value="user">User profile</TabsTrigger>
            <TabsTrigger value="daily">Daily notes</TabsTrigger>
            <TabsTrigger value="dreams">Consolidation log</TabsTrigger>
          </TabsList>
          <TabsContent value="memory" className="mt-space-xl">
            {data ? (
              <CuratedFile
                target="memory"
                file={data.memory}
                onEdit={(entry) => setSelected({ entry, file: data.memory })}
              />
            ) : null}
          </TabsContent>
          <TabsContent value="user" className="mt-space-xl">
            {data ? (
              <CuratedFile target="user" file={data.user} onEdit={(entry) => setSelected({ entry, file: data.user })} />
            ) : null}
          </TabsContent>
          <TabsContent value="daily" className="mt-space-xl space-y-space-l">
            {daily.data?.files.map((file) => (
              <DailyFile key={file.name} file={file} processedIds={new Set(data?.processedCandidateIds ?? [])} />
            ))}
            {daily.data?.files.length === 0 ? (
              <Empty>
                <EmptyTitle>No daily candidates</EmptyTitle>
                <EmptyDescription>Automatic capture will append durable candidates here.</EmptyDescription>
              </Empty>
            ) : null}
          </TabsContent>
          <TabsContent value="dreams" className="mt-space-xl">
            <Card>
              <CardContent>
                <pre className="overflow-x-auto text-sm whitespace-pre-wrap">{data?.dreams.rawContent}</pre>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </PageContent>

      <MemoryDetailSheet
        key={selected?.entry.id}
        entry={selected?.entry ?? null}
        file={selected?.file ?? null}
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset file-based memory?"
        description="This permanently deletes MEMORY.md, USER.md, daily notes, consolidation state, and the consolidation log. Legacy LanceDB data is not migrated or changed."
        onConfirm={() => reset.mutate(undefined, { onSuccess: () => setResetOpen(false) })}
        isPending={reset.isPending}
        pendingLabel="Resetting..."
      />
    </Page>
  );
}
