import { createFileRoute } from '@tanstack/react-router';

import { SkillsSettings } from '@/components/settings/skills';
import { skillsQueryOptions } from '@/lib/queries/skills';

export const Route = createFileRoute('/settings/skills')({
  loader: ({ context }) => context.queryClient.ensureQueryData(skillsQueryOptions),
  component: SkillsSettings,
});
