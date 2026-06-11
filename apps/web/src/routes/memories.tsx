import { BrainIcon } from 'lucide-react';

import { Link, createFileRoute } from '@tanstack/react-router';

import { MemoriesPage } from '@/components/memories/memories-page';
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Page, PageContent } from '@/components/ui/page';
import { memoryStatsQueryOptions, semanticMemoriesQueryOptions } from '@/lib/queries/memories';

function MemoriesErrorComponent({ error }: { error: Error }) {
  return (
    <Page>
      <PageContent>
        <Empty className="mt-16">
          <EmptyMedia>
            <BrainIcon className="size-10 text-muted-foreground/30" />
          </EmptyMedia>
          <EmptyTitle>Memory unavailable</EmptyTitle>
          <EmptyDescription>
            {error.message}{' '}
            <Link to="/settings/memory" className="underline underline-offset-4 hover:text-primary">
              Go to Memory settings
            </Link>
          </EmptyDescription>
        </Empty>
      </PageContent>
    </Page>
  );
}

export const Route = createFileRoute('/memories')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(memoryStatsQueryOptions),
      context.queryClient.ensureQueryData(semanticMemoriesQueryOptions({ page: 1, pageSize: 12 })),
    ]),
  component: MemoriesPage,
  errorComponent: MemoriesErrorComponent,
});
