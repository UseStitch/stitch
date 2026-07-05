import * as React from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { CATEGORY_LABELS, CONFIDENCE_LABELS } from '@/components/memories/constants';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import type { MemoryCategory, MemoryConfidence, SemanticMemory } from '@/lib/queries/memories';
import { deleteMemoryMutationOptions, updateMemoryMutationOptions } from '@/lib/queries/memories';

const DEBOUNCE_MS = 600;

type Props = { memory: SemanticMemory | null; open: boolean; onOpenChange: (open: boolean) => void };

export function MemoryDetailSheet({ memory, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [content, setContent] = React.useState('');
  const [category, setCategory] = React.useState<MemoryCategory>('fact');
  const [confidence, setConfidence] = React.useState<MemoryConfidence>('stated');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false);

  const updateMutation = useMutation(updateMemoryMutationOptions(queryClient));
  const deleteMutation = useMutation(deleteMemoryMutationOptions(queryClient));

  const memoryRef = React.useRef(memory);
  memoryRef.current = memory;

  React.useEffect(() => {
    if (memory) {
      setContent(memory.content);
      setCategory(memory.category);
      setConfidence(memory.confidence);
    }
  }, [memory]);

  function save(updates: { content?: string; category?: MemoryCategory; confidence?: MemoryConfidence }) {
    if (!memoryRef.current) return;
    updateMutation.mutate({ id: memoryRef.current.id, updates });
  }

  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  function saveDebounced(nextContent: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => save({ content: nextContent }), DEBOUNCE_MS);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
      const current = memoryRef.current;
      if (current && content !== current.content) {
        save({ content });
      }
    }
    onOpenChange(nextOpen);
  }

  function handleContentChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    setContent(next);
    if (memoryRef.current && next !== memoryRef.current.content) {
      saveDebounced(next);
    }
  }

  function handleCategoryChange(v: string | null) {
    if (!v) return;
    const next = v as MemoryCategory;
    setCategory(next);
    if (memoryRef.current && next !== memoryRef.current.category) {
      save({ category: next });
    }
  }

  function handleConfidenceChange(v: string | null) {
    if (!v) return;
    const next = v as MemoryConfidence;
    setConfidence(next);
    if (memoryRef.current && next !== memoryRef.current.confidence) {
      save({ confidence: next });
    }
  }

  function handleDelete() {
    if (!memory) return;
    deleteMutation.mutate(memory.id, {
      onSuccess: () => {
        setConfirmDeleteOpen(false);
        onOpenChange(false);
      },
    });
  }

  const selectedCategoryLabel = CATEGORY_LABELS[category];
  const selectedConfidenceLabel = CONFIDENCE_LABELS[confidence];

  if (!memory) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Memory</SheetTitle>
          </SheetHeader>

          <div className="flex flex-1 flex-col gap-5 px-4">
            {/* Content */}
            <div className="flex flex-col gap-1.5">
              <Label>Content</Label>
              <Textarea
                value={content}
                onChange={handleContentChange}
                className="min-h-28 resize-none"
                placeholder="Memory content..."
              />
            </div>

            {/* Category */}
            <div className="flex flex-col gap-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={handleCategoryChange}>
                <SelectTrigger className="w-full">
                  <SelectValue>{selectedCategoryLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATEGORY_LABELS) as MemoryCategory[]).map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {CATEGORY_LABELS[cat]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Confidence */}
            <div className="flex flex-col gap-1.5">
              <Label>Confidence</Label>
              <Select value={confidence} onValueChange={handleConfidenceChange}>
                <SelectTrigger className="w-full">
                  <SelectValue>{selectedConfidenceLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CONFIDENCE_LABELS) as MemoryConfidence[]).map((conf) => (
                    <SelectItem key={conf} value={conf}>
                      {CONFIDENCE_LABELS[conf]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Read-only metadata */}
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Source</span>
                <Badge variant="outline" className="capitalize">
                  {memory.source}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Accessed</span>
                <span className="text-foreground">{memory.accessCount} times</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Created</span>
                <span className="text-foreground">{new Date(memory.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Updated</span>
                <span className="text-foreground">{new Date(memory.updatedAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          <SheetFooter className="flex flex-row items-center justify-between gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmDeleteOpen(true)}
              disabled={deleteMutation.isPending}>
              Delete
            </Button>
            {updateMutation.isPending && <span className="text-xs text-muted-foreground">Saving…</span>}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="Delete memory?"
        description="This memory will be permanently removed and cannot be recovered."
        onConfirm={handleDelete}
        pendingLabel="Deleting…"
        isPending={deleteMutation.isPending}
      />
    </>
  );
}
