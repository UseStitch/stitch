import * as React from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  CATEGORY_LABELS,
  CONFIDENCE_LABELS,
  CONFIDENCE_VARIANTS,
} from '@/components/memories/constants';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import type { MemoryCategory, MemoryConfidence, SemanticMemory } from '@/lib/queries/memories';
import { deleteMemoryMutationOptions, updateMemoryMutationOptions } from '@/lib/queries/memories';

type Props = {
  memory: SemanticMemory | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function MemoryDetailSheet({ memory, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [content, setContent] = React.useState('');
  const [category, setCategory] = React.useState<MemoryCategory>('fact');
  const [confidence, setConfidence] = React.useState<MemoryConfidence>('stated');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false);

  React.useEffect(() => {
    if (memory) {
      setContent(memory.content);
      setCategory(memory.category);
      setConfidence(memory.confidence);
    }
  }, [memory]);

  const updateMutation = useMutation(updateMemoryMutationOptions(queryClient));
  const deleteMutation = useMutation(deleteMemoryMutationOptions(queryClient));

  function handleSave() {
    if (!memory) return;
    updateMutation.mutate(
      {
        id: memory.id,
        updates: {
          content: content !== memory.content ? content : undefined,
          category: category !== memory.category ? category : undefined,
          confidence: confidence !== memory.confidence ? confidence : undefined,
        },
      },
      { onSuccess: () => onOpenChange(false) },
    );
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

  const isDirty =
    memory &&
    (content !== memory.content ||
      category !== memory.category ||
      confidence !== memory.confidence);
  const selectedCategoryLabel = CATEGORY_LABELS[category];
  const selectedConfidenceLabel = CONFIDENCE_LABELS[confidence];

  if (!memory) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
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
                onChange={(e) => setContent(e.target.value)}
                className="min-h-28 resize-none"
                placeholder="Memory content..."
              />
            </div>

            {/* Category */}
            <div className="flex flex-col gap-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as MemoryCategory)}>
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
              <Select
                value={confidence}
                onValueChange={(v) => setConfidence(v as MemoryConfidence)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>{selectedConfidenceLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CONFIDENCE_LABELS) as MemoryConfidence[]).map((conf) => (
                    <SelectItem key={conf} value={conf}>
                      <div className="flex items-center gap-2">
                        <Badge variant={CONFIDENCE_VARIANTS[conf]}>{CONFIDENCE_LABELS[conf]}</Badge>
                      </div>
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
                <span className="text-foreground">
                  {new Date(memory.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Updated</span>
                <span className="text-foreground">
                  {new Date(memory.updatedAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          <SheetFooter className="flex flex-row items-center justify-between gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmDeleteOpen(true)}
              disabled={deleteMutation.isPending}
            >
              Delete
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!isDirty || updateMutation.isPending}
              >
                {updateMutation.isPending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete memory?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This memory will be permanently removed and cannot be recovered.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
