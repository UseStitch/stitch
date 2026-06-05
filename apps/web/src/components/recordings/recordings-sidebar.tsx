import { LibraryIcon, MicIcon } from 'lucide-react';

import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';

import {
  formatReadableDuration,
  formatRecordingShortDate,
  formatRecordingTime,
  getRecordingDisplayTitle,
} from './shared/formatting';

import { InternalSidebar } from '@/components/navigation/internal-sidebar';
import { recordingsQueryOptions } from '@/lib/queries/recordings';

export function RecordingsSidebarContent() {
  const params = useParams({ strict: false });
  const selectedRecordingId = typeof params.id === 'string' ? params.id : null;

  const { data } = useQuery(recordingsQueryOptions({ page: 1, pageSize: 100 }));
  const recordings = data?.recordings ?? [];

  return (
    <>
      <InternalSidebar.Header>
        <InternalSidebar.Top>
          <InternalSidebar.TopTitle>
            <Link to="/recordings" className="flex min-w-0 items-center gap-2 truncate">
              <LibraryIcon className="size-4 shrink-0" />
              <span className="truncate">Recordings</span>
            </Link>
          </InternalSidebar.TopTitle>
        </InternalSidebar.Top>
      </InternalSidebar.Header>

      <InternalSidebar.Content>
        {recordings.length > 0 ? (
          <InternalSidebar.Group title="Recent">
            <InternalSidebar.List>
              {recordings.map((recording) => {
                const displayTitle = getRecordingDisplayTitle(recording);
                const isAnalyzed = recording.analysisTitle !== null;
                return (
                  <InternalSidebar.Item
                    key={recording.id}
                    isActive={recording.id === selectedRecordingId}
                    className="h-auto py-1.5"
                    render={
                      <Link
                        to="/recordings/$id"
                        params={{ id: recording.id }}
                        className="flex items-center gap-2"
                      />
                    }
                  >
                    <MicIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm">{displayTitle}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {formatRecordingShortDate(recording.startedAt)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                        <span>
                          {formatReadableDuration(recording.durationMs)}
                          {' · '}
                          <span className={isAnalyzed ? 'text-success' : undefined}>
                            {isAnalyzed ? 'Analyzed' : 'Not analyzed'}
                          </span>
                        </span>
                        <span>{formatRecordingTime(recording.startedAt)}</span>
                      </div>
                    </div>
                  </InternalSidebar.Item>
                );
              })}
            </InternalSidebar.List>
          </InternalSidebar.Group>
        ) : (
          <InternalSidebar.EmptyState
            icon={MicIcon}
            title="No recordings yet"
            description="Start a recording to capture meeting audio."
          />
        )}
      </InternalSidebar.Content>
    </>
  );
}
