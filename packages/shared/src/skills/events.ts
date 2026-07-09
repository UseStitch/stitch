export const SKILL_EVENT_NAMES = ['skill-created', 'skill-updated', 'skill-deleted'] as const;

export type SkillEvents = {
  'skill-created': { name: string };
  'skill-updated': { name: string; previousName: string };
  'skill-deleted': { name: string };
};
