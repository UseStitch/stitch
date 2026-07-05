import { MicIcon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { SortingState } from '@tanstack/react-table';

import type { Recording } from '@stitch/shared/recordings/types';

import { RecordingStartStopBar } from './list/recording-start-stop-bar';
import { RecordingsPagination } from './list/recordings-pagination';
import { RecordingsTable } from './list/recordings-table';
import { getErrorMessage, shouldConfirmRecordingDelete } from './shared/actions';
import { DeleteRecordingDialog } from './shared/delete-recording-dialog';

import type { SttModelSelection } from '@/components/model-selectors/stt-model-selector-popover';
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
  recordingsQueryOptions,
  useDeleteRecording,
  useStartRecording,
  useStopRecording,
} from '@/lib/queries/recordings';

const PAGE_SIZE = 12;

export function RecordingsPage() {
  const [page, setPage] = React.useState(1);
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'startedAt', desc: true }]);
  const [title, setTitle] = React.useState('');
  const [recordingToDelete, setRecordingToDelete] = React.useState<Recording | null>(null);

  const { data } = useSuspenseQuery({
    ...recordingsQueryOptions({ page, pageSize: PAGE_SIZE }),
    refetchInterval: (query) => (query.state.data?.activeRecordingId ? 1_000 : false),
  });
  const startRecording = useStartRecording();
  const stopRecording = useStopRecording();
  const deleteRecording = useDeleteRecording();
  const navigate = useNavigate();

  const activeRecording = data.recordings.find((recording) => recording.id === data.activeRecordingId);

  const deleteById = React.useCallback(
    (recordingId: string, onSuccess?: () => void) => {
      void deleteRecording.mutateAsync(recordingId).then(
        () => {
          onSuccess?.();
          toast.success('Recording deleted', { id: 'recording-delete' });
        },
        (error: unknown) =>
          toast.error(getErrorMessage(error, 'Failed to delete recording'), { id: 'recording-delete' }),
      );
    },
    [deleteRecording],
  );

  const handleDelete = React.useCallback(
    (recording: Recording) => {
      if (shouldConfirmRecordingDelete(recording)) {
        setRecordingToDelete(recording);
        return;
      }

      deleteById(recording.id);
    },
    [deleteById],
  );

  return (
    <Page>
      <PageContent>
        <PageHeader>
          <PageHeaderContent>
            <PageIcon>
              <MicIcon className="size-5" />
            </PageIcon>
            <div>
              <PageTitle>Recordings</PageTitle>
              <PageDescription>
                Record any meeting and store raw audio in your local app data directory.
              </PageDescription>
            </div>
          </PageHeaderContent>
        </PageHeader>

        <RecordingStartStopBar
          activeRecording={activeRecording}
          isStarting={startRecording.isPending}
          isStopping={stopRecording.isPending}
          title={title}
          onTitleChange={setTitle}
          onStart={(sttModel?: SttModelSelection) => {
            void startRecording
              .mutateAsync({
                title: title.trim() || undefined,
                sttProviderId: sttModel?.providerId,
                sttModelId: sttModel?.modelId,
              })
              .then(
                () => {
                  setTitle('');
                  toast.success('Recording started', { id: 'recording-start' });
                },
                (error: unknown) =>
                  toast.error(getErrorMessage(error, 'Failed to start recording'), { id: 'recording-start' }),
              );
          }}
          onStop={() => {
            void stopRecording.mutateAsync().then(
              () => toast.success('Recording stopped', { id: 'recording-stop' }),
              (error: unknown) =>
                toast.error(getErrorMessage(error, 'Failed to stop recording'), { id: 'recording-stop' }),
            );
          }}
        />

        <div className="overflow-hidden rounded-xl border border-border bg-background">
          <RecordingsTable
            recordings={data.recordings}
            activeRecordingId={data.activeRecordingId}
            sorting={sorting}
            onSortingChange={setSorting}
            onDelete={handleDelete}
            onNavigate={(recordingId) => {
              void navigate({ to: '/recordings/$id', params: { id: recordingId } });
            }}
          />
          <RecordingsPagination page={page} pageCount={data.totalPages} onPageChange={setPage} />
        </div>
      </PageContent>

      <DeleteRecordingDialog
        recording={recordingToDelete}
        isDeleting={deleteRecording.isPending}
        onOpenChange={(open) => !open && setRecordingToDelete(null)}
        onConfirm={() => {
          if (!recordingToDelete) return;
          deleteById(recordingToDelete.id, () => setRecordingToDelete(null));
        }}
      />
    </Page>
  );
}
