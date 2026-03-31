import { MicIcon, PlayIcon } from 'lucide-react';
import * as React from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';

import type { Meeting } from '@stitch/shared/meetings/types';

import { formatAppName, formatDuration } from '@/components/recordings/recording-detail/formatting';
import { StatusBadge } from '@/components/recordings/recording-detail/status-badge';
import { Button } from '@/components/ui/button';
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
} from '@/components/ui/sidebar';
import { useSSE } from '@/hooks/sse/sse-context';
import {
  meetingKeys,
  recordingsQueryOptions,
  transcriptionQueryOptions,
  useStartRecording,
} from '@/lib/queries/meetings';
import { useMeetingStore } from '@/stores/meeting-store';

const ONE_MINUTE_MS = 60_000;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;
const ONE_WEEK_MS = 7 * ONE_DAY_MS;

function formatShortDate(timestamp: number): string {
  const date = new Date(timestamp);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

function formatSidebarTimestamp(timestamp: number, nowMs: number): string {
  const diffMs = Math.max(0, nowMs - timestamp);

  if (diffMs < ONE_HOUR_MS) {
    const minutes = Math.max(1, Math.floor(diffMs / ONE_MINUTE_MS));
    return `${minutes}m ago`;
  }

  if (diffMs < ONE_DAY_MS) {
    const hours = Math.floor(diffMs / ONE_HOUR_MS);
    return `${hours}h ago`;
  }

  if (diffMs < ONE_WEEK_MS) {
    const days = Math.floor(diffMs / ONE_DAY_MS);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  return formatShortDate(timestamp);
}

function RecordingSidebarItem({
  recording,
  isActive,
  nowMs,
}: {
  recording: Meeting;
  isActive: boolean;
  nowMs: number;
}) {
  const { data: transcription } = useQuery(transcriptionQueryOptions(recording.id));
  const title = transcription?.title || formatAppName(recording.app);
  const shouldShowStatusBadge = transcription?.status !== 'completed';

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isActive}
        className="h-auto items-start py-2"
        render={
          <Link
            to="/recordings/$id"
            params={{ id: recording.id }}
            className="flex flex-col items-start gap-0.5"
          />
        }
      >
        <div className="flex w-full items-center gap-2">
          <span className="truncate text-sm">{title}</span>
          {shouldShowStatusBadge && <StatusBadge status={recording.status} />}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>{formatSidebarTimestamp(recording.startedAt, nowMs)}</span>
          {recording.durationSecs !== null && (
            <>
              <span className="text-border">|</span>
              <span>{formatDuration(recording.durationSecs)}</span>
            </>
          )}
        </div>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function RecordingsSidebarContent() {
  const queryClient = useQueryClient();
  const { data: recordings } = useQuery(recordingsQueryOptions);
  const startRecording = useStartRecording();
  const meetingStatus = useMeetingStore((s) => s.status);
  const params = useParams({ strict: false });
  const currentId = params.id;
  const hasActiveRecording =
    meetingStatus === 'recording' ||
    recordings?.some((recording) => recording.status === 'recording');
  const [nowMs, setNowMs] = React.useState(() => Date.now());

  React.useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, ONE_MINUTE_MS);

    return () => {
      clearInterval(timer);
    };
  }, []);

  useSSE({
    'transcription-started': () => {
      void queryClient.invalidateQueries({ queryKey: meetingKeys.all });
    },
    'transcription-completed': () => {
      void queryClient.invalidateQueries({ queryKey: meetingKeys.all });
    },
    'transcription-failed': () => {
      void queryClient.invalidateQueries({ queryKey: meetingKeys.all });
    },
  });

  const sortedRecordings = React.useMemo(
    () => (recordings ? [...recordings].sort((a, b) => b.startedAt - a.startedAt) : []),
    [recordings],
  );

  return (
    <>
      <SidebarHeader className="pb-0">
        <div className="flex items-center gap-2 px-2 py-1">
          <div className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium">
            <MicIcon className="size-4" />
            Recordings
          </div>
          {!hasActiveRecording && (
            <Button
              size="xs"
              onClick={() => startRecording.mutate()}
              disabled={startRecording.isPending}
            >
              <PlayIcon data-icon="inline-start" className="size-3" />
              {startRecording.isPending ? 'Starting...' : 'Start'}
            </Button>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {recordings && recordings.length > 0 ? (
          <SidebarGroup>
            <SidebarGroupLabel>Recent</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {sortedRecordings.map((recording) => (
                  <RecordingSidebarItem
                    key={recording.id}
                    recording={recording}
                    isActive={recording.id === currentId}
                    nowMs={nowMs}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
            <MicIcon className="size-8 text-muted-foreground/40" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">No recordings yet</p>
              <p className="text-xs text-muted-foreground/70">
                Recordings will appear here when a meeting is detected.
              </p>
            </div>
          </div>
        )}
      </SidebarContent>
    </>
  );
}
