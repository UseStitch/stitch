import * as React from 'react';

import { useParams } from '@tanstack/react-router';

import { PrefixedString } from '@openwork/shared/id';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useDialogContext } from '@/context/dialog-context';
import { useRenameSession } from '@/lib/queries/chat';

export function RenameSessionDialog() {
  const { renameSessionOpen, setRenameSessionOpen } = useDialogContext();
  const params = useParams({ strict: false });
  const renameMutation = useRenameSession();
  const [title, setTitle] = React.useState('');

  const sessionId = params.id;

  React.useEffect(() => {
    if (renameSessionOpen && sessionId) {
      setTitle('');
    }
  }, [renameSessionOpen, sessionId]);

  const handleRename = async () => {
    if (!title.trim() || !sessionId) return;
    await renameMutation.mutateAsync({
      sessionId: sessionId as PrefixedString<'ses'>,
      title: title.trim(),
    });
    setRenameSessionOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRename();
    }
  };

  return (
    <Dialog open={renameSessionOpen} onOpenChange={setRenameSessionOpen}>
      <DialogHeader className="sr-only">
        <DialogTitle>Rename Session</DialogTitle>
      </DialogHeader>
      <DialogContent className="max-w-sm">
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Rename Session</h2>
          <Input
            placeholder="Session name"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRenameSessionOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={!title.trim() || renameMutation.isPending}>
              Rename
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
