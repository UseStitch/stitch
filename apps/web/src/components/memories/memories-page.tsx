import { BrainIcon, SearchIcon, Trash2Icon } from 'lucide-react';
import { PinIcon } from 'lucide-react';
import * as React from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  CATEGORY_LABELS,
  CATEGORY_VARIANTS,
  CONFIDENCE_LABELS,
} from '@/components/memories/constants';
import { MemoryDetailSheet } from '@/components/memories/memory-detail-sheet';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import {
  Page,
  PageContent,
  PageDescription,
  PageHeader,
  PageHeaderContent,
  PageIcon,
  PageTitle,
} from '@/components/ui/page';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table } from '@/components/ui/table';
import type { MemoryCategory, MemorySource, SemanticMemory } from '@/lib/queries/memories';
import {
  bulkDeleteMemoriesMutationOptions,
  memoryStatsQueryOptions,
  semanticMemoriesQueryOptions,
  semanticMemorySearchQueryOptions,
  pinMemoryMutationOptions,
  pruneMemoriesMutationOptions,
  runMaintenanceMutationOptions,
} from '@/lib/queries/memories';
import { cn } from '@/lib/utils';

type FilterSource = MemorySource | 'all';
type FilterCategory = MemoryCategory | 'all';

const SOURCE_FILTER_LABELS: Record<FilterSource, string> = {
  all: 'All sources',
  chat: 'Chat',
  automation: 'Automation',
};

const CATEGORY_FILTER_LABELS: Record<FilterCategory, string> = {
  all: 'All categories',
  preference: CATEGORY_LABELS.preference,
  fact: CATEGORY_LABELS.fact,
  constraint: CATEGORY_LABELS.constraint,
};

export function MemoriesPage() {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const pageSize = 12;
  const [filterSource, setFilterSource] = React.useState<FilterSource>('all');
  const [filterCategory, setFilterCategory] = React.useState<FilterCategory>('all');
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [sheetMemory, setSheetMemory] = React.useState<SemanticMemory | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = React.useState(false);

  const { data: stats } = useQuery(memoryStatsQueryOptions);
  const pruneMutation = useMutation(pruneMemoriesMutationOptions(queryClient));
  const maintenanceMutation = useMutation(runMaintenanceMutationOptions(queryClient));

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const isSearching = debouncedSearch.length > 0;

  const listQuery = useQuery(
    semanticMemoriesQueryOptions({
      page,
      pageSize,
      source: filterSource === 'all' ? undefined : filterSource,
      category: filterCategory === 'all' ? undefined : filterCategory,
    }),
  );
  const searchQuery = useQuery(
    semanticMemorySearchQueryOptions({
      q: debouncedSearch,
      page,
      pageSize,
      source: filterSource === 'all' ? undefined : filterSource,
      category: filterCategory === 'all' ? undefined : filterCategory,
    }),
  );

  React.useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filterSource, filterCategory]);

  const pageData = isSearching ? searchQuery.data : listQuery.data;
  const memories = pageData?.memories ?? [];

  const bulkDeleteMutation = useMutation(bulkDeleteMemoriesMutationOptions(queryClient));

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === memories.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(memories.map((m) => m.id)));
    }
  }

  function openMemory(memory: SemanticMemory) {
    setSheetMemory(memory);
    setSheetOpen(true);
  }

  function handleBulkDelete() {
    bulkDeleteMutation.mutate(Array.from(selectedIds), {
      onSuccess: () => {
        setSelectedIds(new Set());
        setBulkDeleteOpen(false);
      },
    });
  }

  React.useEffect(() => {
    setSelectedIds(new Set());
  }, [pageData?.page, pageData?.total, debouncedSearch, filterSource, filterCategory]);

  const isLoading = isSearching ? searchQuery.isLoading : listQuery.isLoading;
  const totalPages = pageData?.totalPages ?? 0;
  const currentPage = (pageData?.page ?? page) - 1;
  const pageNumbers = React.useMemo(() => {
    if (totalPages <= 1) {
      return [] as number[];
    }

    const firstPage = 0;
    const lastPage = totalPages - 1;
    const start = Math.max(firstPage, currentPage - 1);
    const end = Math.min(lastPage, currentPage + 1);

    const pages = new Set<number>([firstPage, lastPage]);
    for (let index = start; index <= end; index += 1) {
      pages.add(index);
    }

    return [...pages].sort((a, b) => a - b);
  }, [currentPage, totalPages]);

  const allSelected = memories.length > 0 && selectedIds.size === memories.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < memories.length;
  const selectedSourceLabel = SOURCE_FILTER_LABELS[filterSource];
  const selectedCategoryLabel = CATEGORY_FILTER_LABELS[filterCategory];

  return (
    <Page>
      <PageContent>
        <PageHeader>
          <PageHeaderContent>
            <PageIcon>
              <BrainIcon className="size-5" />
            </PageIcon>
            <div>
              <PageTitle>Memories</PageTitle>
              <PageDescription>
                {isLoading
                  ? 'Loading…'
                  : `${memories.length} ${memories.length === 1 ? 'memory' : 'memories'} stored`}
              </PageDescription>
            </div>
          </PageHeaderContent>
          {stats && !isSearching && (
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>
                <strong>{stats.pinned}</strong> pinned
              </span>
              <span>
                <strong>{stats.stale}</strong> stale
              </span>
              <span>
                <strong>{stats.avgAccessCount.toFixed(1)}</strong> avg accesses
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => pruneMutation.mutate()}
                disabled={pruneMutation.isPending || maintenanceMutation.isPending}
                className="h-7 px-2 text-xs"
              >
                Prune Stale
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => maintenanceMutation.mutate()}
                disabled={maintenanceMutation.isPending || pruneMutation.isPending}
                className="h-7 px-2 text-xs"
              >
                {maintenanceMutation.isPending ? 'Running…' : 'Run Maintenance'}
              </Button>
            </div>
          )}
        </PageHeader>

        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative w-64">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search memories…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-8"
            />
          </div>

          <Select value={filterSource} onValueChange={(v) => setFilterSource(v as FilterSource)}>
            <SelectTrigger className="w-36 bg-background">
              <SelectValue>{selectedSourceLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              <SelectItem value="chat">Chat</SelectItem>
              <SelectItem value="automation">Automation</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filterCategory}
            onValueChange={(v) => setFilterCategory(v as FilterCategory)}
          >
            <SelectTrigger className="w-40 bg-background">
              <SelectValue>{selectedCategoryLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              <SelectItem value="preference">Preference</SelectItem>
              <SelectItem value="fact">Fact</SelectItem>
              <SelectItem value="workflow">Workflow</SelectItem>
              <SelectItem value="constraint">Constraint</SelectItem>
            </SelectContent>
          </Select>

          {selectedIds.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setBulkDeleteOpen(true)}
              className="ml-auto"
            >
              <Trash2Icon />
              Delete {selectedIds.size}
            </Button>
          )}
        </div>

        <Table.Container>
          <Table.Scroller>
            <Table.Root className="min-w-200 table-fixed">
              <Table.Header>
                <Table.Row className="hover:bg-transparent">
                  <Table.Head className="w-14 text-center">
                    <Checkbox
                      checked={allSelected}
                      data-indeterminate={someSelected || undefined}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all"
                    />
                  </Table.Head>
                  <Table.Head className="w-10 text-center"></Table.Head>
                  <Table.Head className="w-full min-w-0">Content</Table.Head>
                  <Table.Head className="w-28 text-center">Category</Table.Head>
                  <Table.Head className="w-28 text-center">Confidence</Table.Head>
                  <Table.Head className="w-24 text-center">Source</Table.Head>
                  <Table.Head className="w-24 text-right">Created</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <Table.Row key={i} className="hover:bg-transparent">
                      <Table.Cell className="w-14" />
                      <Table.Cell className="w-10" />
                      <Table.Cell className="w-full max-w-0 min-w-0 overflow-hidden">
                        <div className="h-4 animate-pulse rounded bg-muted" />
                      </Table.Cell>
                      <Table.Cell className="w-28">
                        <div className="mx-auto h-5 w-24 animate-pulse rounded-full bg-muted" />
                      </Table.Cell>
                      <Table.Cell className="w-28">
                        <div className="mx-auto h-4 w-20 animate-pulse rounded bg-muted" />
                      </Table.Cell>
                      <Table.Cell className="w-24">
                        <div className="mx-auto h-5 w-20 animate-pulse rounded-full bg-muted" />
                      </Table.Cell>
                      <Table.Cell className="w-24">
                        <div className="ml-auto h-4 w-20 animate-pulse rounded bg-muted" />
                      </Table.Cell>
                    </Table.Row>
                  ))
                ) : memories.length === 0 ? (
                  <Table.EmptyRow colSpan={7}>
                    <Empty>
                      <EmptyMedia>
                        <BrainIcon className="size-10 text-muted-foreground/30" />
                      </EmptyMedia>
                      <EmptyTitle>
                        {isSearching ? 'No memories match your search' : 'No memories yet'}
                      </EmptyTitle>
                      {!isSearching && (
                        <EmptyDescription>
                          Memories are automatically extracted from your conversations when memory
                          is enabled in settings.
                        </EmptyDescription>
                      )}
                    </Empty>
                  </Table.EmptyRow>
                ) : (
                  memories.map((memory) => (
                    <MemoryRow
                      key={memory.id}
                      memory={memory}
                      selected={selectedIds.has(memory.id)}
                      onToggleSelect={() => toggleSelect(memory.id)}
                      onClick={() => openMemory(memory)}
                    />
                  ))
                )}
              </Table.Body>
            </Table.Root>
          </Table.Scroller>

          {totalPages > 1 ? (
            <div className="border-t border-border px-3 py-3">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(event) => {
                        event.preventDefault();
                        if (page > 1) {
                          setPage((current) => current - 1);
                        }
                      }}
                      className={page <= 1 ? 'pointer-events-none opacity-50' : undefined}
                    />
                  </PaginationItem>

                  {pageNumbers.map((pageNumber, index) => {
                    const previousPage = pageNumbers[index - 1];
                    const showGap = previousPage !== undefined && pageNumber - previousPage > 1;
                    return (
                      <React.Fragment key={`page-${pageNumber}`}>
                        {showGap ? (
                          <PaginationItem>
                            <PaginationEllipsis />
                          </PaginationItem>
                        ) : null}
                        <PaginationItem>
                          <PaginationLink
                            href="#"
                            isActive={pageNumber === currentPage}
                            onClick={(event) => {
                              event.preventDefault();
                              setPage(pageNumber + 1);
                            }}
                          >
                            {pageNumber + 1}
                          </PaginationLink>
                        </PaginationItem>
                      </React.Fragment>
                    );
                  })}

                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(event) => {
                        event.preventDefault();
                        if (page < totalPages) {
                          setPage((current) => current + 1);
                        }
                      }}
                      className={page >= totalPages ? 'pointer-events-none opacity-50' : undefined}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          ) : null}
        </Table.Container>
      </PageContent>

      {/* Detail sheet */}
      <MemoryDetailSheet memory={sheetMemory} open={sheetOpen} onOpenChange={setSheetOpen} />

      {/* Bulk delete confirmation */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>
              Delete {selectedIds.size} {selectedIds.size === 1 ? 'memory' : 'memories'}?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            These memories will be permanently removed and cannot be recovered.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={bulkDeleteMutation.isPending}
            >
              {bulkDeleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}

type MemoryRowProps = {
  memory: SemanticMemory;
  selected: boolean;
  onToggleSelect: () => void;
  onClick: () => void;
};

function MemoryRow({ memory, selected, onToggleSelect, onClick }: MemoryRowProps) {
  const queryClient = useQueryClient();
  const pinMutation = useMutation(pinMemoryMutationOptions(queryClient));

  return (
    <Table.Row className={cn('cursor-pointer', selected && 'bg-muted/40')} onClick={onClick}>
      <Table.Cell
        className="w-14 text-center"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <Checkbox checked={selected} onCheckedChange={onToggleSelect} aria-label="Select memory" />
      </Table.Cell>

      <Table.Cell
        className="w-10 cursor-pointer text-center text-muted-foreground hover:text-foreground"
        onClick={(e) => {
          e.stopPropagation();
          pinMutation.mutate({ id: memory.id, pinned: !memory.pinned });
        }}
      >
        {memory.pinned ? (
          <PinIcon className="h-4 w-4 fill-foreground text-foreground" />
        ) : (
          <PinIcon className="h-4 w-4 opacity-30 hover:opacity-100" />
        )}
      </Table.Cell>

      <Table.Cell className="w-full max-w-0 min-w-0 overflow-hidden">
        <Table.Title className="block">{memory.content}</Table.Title>
      </Table.Cell>

      <Table.Cell className="w-28 text-center">
        <Table.Badge variant={CATEGORY_VARIANTS[memory.category]}>
          {CATEGORY_LABELS[memory.category]}
        </Table.Badge>
      </Table.Cell>

      <Table.Cell className="w-28 text-center">
        <Table.Status className="normal-case">{CONFIDENCE_LABELS[memory.confidence]}</Table.Status>
      </Table.Cell>

      <Table.Cell className="w-24 text-center">
        <Table.Badge variant="outline" className="capitalize">
          {memory.source}
        </Table.Badge>
      </Table.Cell>

      <Table.Cell className="w-24 text-right">
        <Table.Time value={memory.createdAt} />
      </Table.Cell>
    </Table.Row>
  );
}
