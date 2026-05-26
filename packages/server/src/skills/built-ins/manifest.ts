export type BuiltInSkillFile = {
  sourceUrl: URL;
  bundledPath: string;
};

export const BUILT_IN_SKILL_FILES: BuiltInSkillFile[] = [
  {
    sourceUrl: new URL('./pdf.md', import.meta.url),
    bundledPath: 'skills/built-ins/pdf.md',
  },
];
