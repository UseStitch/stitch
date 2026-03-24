import { MicIcon } from 'lucide-react';

import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';

import type { Meeting } from '@stitch/shared/meetings/types';

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
import {
  formatAppName,
  formatDate,
  formatDuration,
  StatusBadge,
} from '@/components/recording-detail';
import { recordingsQueryOptions, transcriptionQueryOptions } from '@/lib/queries/meetings';

function RecordingSidebarItem({ recording, isActive }: { recording: Meeting; isActive: boolean }) {
  const { data: transcription } = useQuery(transcriptionQueryOptions(recording.id));
  const title = transcription?.title || formatAppName(recording.app);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isActive}
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
          <StatusBadge status={recording.status} />
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>{formatDate(recording.startedAt)}</span>
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
  const { data: recordings } = useQuery(recordingsQueryOptions);
  const params = useParams({ strict: false });
  const currentId = params.id;

  return (
    <>
      <SidebarHeader className="pb-0">
        <div className="flex items-center gap-2 px-2 py-1 text-sm font-medium">
          <MicIcon className="size-4" />
          Recordings
        </div>
      </SidebarHeader>

      <SidebarContent>
        {recordings && recordings.length > 0 ? (
          <SidebarGroup>
            <SidebarGroupLabel>Recent</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {[...recordings].reverse().map((recording) => (
                  <RecordingSidebarItem
                    key={recording.id}
                    recording={recording}
                    isActive={recording.id === currentId}
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
