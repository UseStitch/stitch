import { DownloadIcon, EyeIcon, PlusIcon, Trash2Icon, WandSparklesIcon } from 'lucide-react';
import * as React from 'react';

import { useSuspenseQuery } from '@tanstack/react-query';

import type { Skill } from '@stitch/shared/skills/types';

import { SettingPage, SettingSubPage } from '@/components/settings/settings-ui';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  skillsQueryOptions,
  useCreateSkill,
  useDeleteSkill,
  useImportSkill,
  useSearchSkills,
  useUpdateSkill,
} from '@/lib/queries/skills';

type SkillDraft = {
  name: string;
  description: string;
  content: string;
};

const EMPTY_DRAFT: SkillDraft = {
  name: '',
  description: '',
  content: '',
};

function toDraft(skill: Skill | null): SkillDraft {
  if (!skill) return EMPTY_DRAFT;
  return {
    name: skill.name,
    description: skill.description,
    content: skill.content,
  };
}

type SkillView = { type: 'list' } | { type: 'editor'; skill: Skill | null } | { type: 'import' };

function formatInstalls(installs: number): string {
  if (installs >= 1_000_000) return `${(installs / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (installs >= 1_000) return `${(installs / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return installs.toString();
}

function ImportSkillView({ onBack }: { onBack: () => void }) {
  const [search, setSearch] = React.useState('');
  const importSkill = useImportSkill();
  const { data: searchResults = [], isFetching: isSearching } = useSearchSkills(search);

  function handleImport(skill: { source: string; name: string; slug: string }) {
    importSkill.mutate(skill, { onSuccess: onBack });
  }

  return (
    <SettingSubPage
      title="Import Skill"
      description="Search the public agent skills directory and import into Stitch."
      onBack={onBack}
      backLabel="Back to skills"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <Input
          autoFocus
          value={search}
          placeholder="Search skills, e.g. frontend design"
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="thin-scrollbar min-h-0 flex-1 overflow-auto rounded-lg border border-border/50">
          {search.trim().length < 2 ? (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground">
              Type at least 2 characters to search
            </div>
          ) : searchResults.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground">
              {isSearching ? 'Searching...' : 'No skills found'}
            </div>
          ) : (
            searchResults.map((skill) => (
              <div
                key={`${skill.source}/${skill.slug}`}
                className="flex items-center justify-between gap-4 border-b border-border/50 px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{skill.name}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {skill.source} - {formatInstalls(skill.installs)} installs
                  </p>
                </div>
                <Button
                  variant={skill.isImported ? 'secondary' : 'outline'}
                  size="sm"
                  disabled={skill.isImported || importSkill.isPending}
                  onClick={() => handleImport(skill)}
                >
                  {skill.isImported ? 'Imported' : 'Import'}
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </SettingSubPage>
  );
}

function SkillEditor({ skill, onBack }: { skill: Skill | null; onBack: () => void }) {
  const createSkill = useCreateSkill();
  const updateSkill = useUpdateSkill();
  const [draft, setDraft] = React.useState<SkillDraft>(() => toDraft(skill));

  React.useEffect(() => {
    setDraft(toDraft(skill));
  }, [skill]);

  const isEditing = !!skill;
  const isSaving = createSkill.isPending || updateSkill.isPending;
  const canSave =
    draft.name.trim().length > 0 &&
    draft.description.trim().length > 0 &&
    draft.content.trim().length > 0;

  async function handleSave() {
    const input = {
      name: draft.name.trim(),
      description: draft.description.trim(),
      content: draft.content.trim(),
    };

    if (skill) {
      await updateSkill.mutateAsync({ id: skill.id, input });
    } else {
      await createSkill.mutateAsync(input);
    }

    onBack();
  }

  return (
    <SettingSubPage
      title={isEditing ? 'Edit Skill' : 'Add Skill'}
      description="Markdown instructions the agent can load when a task matches the description."
      onBack={onBack}
      backLabel="Back to skills"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-5">
        <div className="grid gap-2">
          <Label htmlFor="skill-name">Name</Label>
          <Input
            id="skill-name"
            value={draft.name}
            placeholder="example-skill"
            onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
          />
          <p className="text-xs text-muted-foreground">
            Lowercase letters, numbers, and single hyphens only. Names must be unique.
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="skill-description">Description</Label>
          <Textarea
            id="skill-description"
            value={draft.description}
            rows={3}
            placeholder="What this skill does and when the agent should use it."
            onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
          />
        </div>

        <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-2">
          <Label htmlFor="skill-content">Markdown instructions</Label>
          <Textarea
            id="skill-content"
            value={draft.content}
            placeholder="# Skill Instructions\n\nDescribe the workflow, constraints, examples, and expected behavior."
            className="thin-scrollbar min-h-0 resize-none overflow-auto font-mono text-xs"
            onChange={(event) => setDraft((prev) => ({ ...prev, content: event.target.value }))}
          />
        </div>

        <div className="mt-auto flex justify-end gap-2 border-t border-border/50 pt-4">
          <Button variant="outline" onClick={onBack} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={!canSave || isSaving}>
            {isSaving ? 'Saving...' : 'Save skill'}
          </Button>
        </div>
      </div>
    </SettingSubPage>
  );
}

export function SkillsSettings() {
  const { data: skills } = useSuspenseQuery(skillsQueryOptions);
  const deleteSkill = useDeleteSkill();
  const [view, setView] = React.useState<SkillView>({ type: 'list' });

  function handleAdd() {
    setView({ type: 'editor', skill: null });
  }

  function handleEdit(skill: Skill) {
    setView({ type: 'editor', skill });
  }

  function handleDelete(skill: Skill) {
    const confirmed = window.confirm(`Delete skill "${skill.name}"?`);
    if (!confirmed) return;
    deleteSkill.mutate(skill.id);
  }

  if (view.type === 'editor') {
    return <SkillEditor skill={view.skill} onBack={() => setView({ type: 'list' })} />;
  }

  if (view.type === 'import') {
    return <ImportSkillView onBack={() => setView({ type: 'list' })} />;
  }

  return (
    <SettingPage
      title="Skills"
      description="Add reusable Markdown instructions the agent can load as a default tool."
      icon={<WandSparklesIcon className="size-5" />}
      actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setView({ type: 'import' })}>
            <DownloadIcon className="size-4" />
            Import
          </Button>
          <Button onClick={handleAdd}>
            <PlusIcon className="size-4" />
            Add Skill
          </Button>
        </div>
      }
    >
      <div className="overflow-hidden rounded-xl border border-border/60 bg-card/40">
        {skills.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <p className="text-sm font-medium">No skills yet</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Create a skill with a trigger-focused description and Markdown instructions.
            </p>
          </div>
        ) : (
          skills.map((skill) => (
            <div
              key={skill.id}
              className="flex items-center justify-between gap-4 border-b border-border/50 px-4 py-3 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{skill.name}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {skill.description}
                </p>
              </div>
              <ButtonGroup>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleEdit(skill)}
                  aria-label={`View ${skill.name}`}
                >
                  <EyeIcon className="size-4" />
                </Button>
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={() => handleDelete(skill)}
                  disabled={deleteSkill.isPending}
                  aria-label={`Delete ${skill.name}`}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </ButtonGroup>
            </div>
          ))
        )}
      </div>
    </SettingPage>
  );
}
