import { createFileRoute } from '@tanstack/react-router';

import { MemoriesPage } from '@/components/memories/memories-page';

export const Route = createFileRoute('/memories')({
  component: MemoriesPage,
});
