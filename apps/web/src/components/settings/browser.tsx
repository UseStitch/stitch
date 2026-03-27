import { CheckCircleIcon, DownloadIcon, FolderIcon, LoaderIcon, UserIcon } from 'lucide-react';
import * as React from 'react';

import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  chromeProfilesQueryOptions,
  importProfileMutationOptions,
} from '@/lib/queries/browser';
import { settingsQueryOptions } from '@/lib/queries/settings';
import { cn } from '@/lib/utils';

function formatImportedLabel(raw: string): string {
  const separator = ' — ';
  const idx = raw.lastIndexOf(separator);
  if (idx === -1) return raw;

  const label = raw.slice(0, idx);
  const iso = raw.slice(idx + separator.length);
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return raw;

  const formatted = date.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  return `${label} — ${formatted}`;
}

function ProfileStatus() {
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);
  const imported = settings['browser.profileImported'];
  const activeProfile = settings['browser.activeProfile'];

  if (!imported || imported === 'skipped') {
    return (
      <p className="text-sm text-muted-foreground">
        No Chrome profile has been imported. The browser uses a clean profile.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <CheckCircleIcon className="size-4 text-success" />
        <span className="text-foreground">Imported: {formatImportedLabel(imported)}</span>
      </div>
      {activeProfile ? (
        <div className="flex items-center gap-2 text-sm">
          <FolderIcon className="size-4 text-muted-foreground" />
          <span className="font-mono text-xs text-muted-foreground">
            {activeProfile}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function ProfileList() {
  const queryClient = useQueryClient();
  const { data: profiles } = useSuspenseQuery(chromeProfilesQueryOptions);
  const importMutation = useMutation(importProfileMutationOptions(queryClient));

  if (profiles.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No Chrome profiles found. Make sure Google Chrome is installed and has been used at least
        once.
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      {profiles.map((profile, index) => (
        <div
          key={profile.id}
          className={cn(
            'flex items-center justify-between gap-4 py-3',
            index < profiles.length - 1 && 'border-b border-border/50',
          )}
        >
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-full bg-muted">
              <UserIcon className="size-4 text-muted-foreground" />
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <Label className="text-sm font-medium">{profile.name}</Label>
              {profile.email ? (
                <p className="text-xs text-muted-foreground">{profile.email}</p>
              ) : (
                <p className="text-xs text-muted-foreground">{profile.id}</p>
              )}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={importMutation.isPending}
            onClick={() => importMutation.mutate(profile.id)}
          >
            {importMutation.isPending && importMutation.variables === profile.id ? (
              <>
                <LoaderIcon className="size-3.5 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <DownloadIcon className="size-3.5" />
                Import
              </>
            )}
          </Button>
        </div>
      ))}
      {importMutation.isPending ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Copying Chrome profile data. This may take a few seconds...
        </p>
      ) : null}
    </div>
  );
}

export function BrowserSettings() {
  const isMac = window.electron?.platform === 'darwin';

  return (
    <div className="flex h-full flex-col">
      <div className="mb-6">
        <h2 className="text-base font-bold">Browser</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure the browser used by the AI agent
        </p>
      </div>

      {isMac ? (
        <>
          <section className="space-y-3">
            <h3 className="text-sm font-medium">Chrome Profile</h3>
            <p className="text-xs text-muted-foreground">
              Import your Chrome profile to use your existing logins, cookies, and sessions. This
              copies your profile data into the Stitch browser and fully replaces any previous
              import.
            </p>
            <React.Suspense
              fallback={<div className="text-sm text-muted-foreground">Loading...</div>}
            >
              <ProfileStatus />
            </React.Suspense>
          </section>

          <section className="mt-8 space-y-3">
            <h3 className="text-sm font-medium">Available Profiles</h3>
            <React.Suspense
              fallback={<div className="text-sm text-muted-foreground">Loading profiles...</div>}
            >
              <ProfileList />
            </React.Suspense>
          </section>
        </>
      ) : (
        <section className="space-y-3">
          <h3 className="text-sm font-medium">Chrome Profile</h3>
          <p className="text-xs text-muted-foreground">
            The browser uses a default Chrome profile on Windows. Profile importing is only
            available on macOS.
          </p>
        </section>
      )}
    </div>
  );
}
