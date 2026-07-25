import { DownloadIcon, EyeIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import * as React from 'react';

import { useForm } from '@tanstack/react-form';
import { useSuspenseQuery } from '@tanstack/react-query';

import { createSkillSchema, type Skill } from '@stitch/shared/skills/types';

import { SETTINGS_PAGE_BY_ID } from '@/components/settings/settings-metadata';
import {
  SettingPage,
  SettingSection,
  SettingSubPage,
  SettingRows,
  SettingsIconButtonTooltip,
} from '@/components/settings/settings-ui';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty';
import { FieldError, fieldErrorMessage } from '@/components/ui/field-error';
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

type SkillDraft = { name: string; description: string; content: string };

const EMPTY_DRAFT: SkillDraft = { name: '', description: '', content: '' };

function toDraft(skill: Skill | null): SkillDraft {
  if (!skill) return EMPTY_DRAFT;
  return { name: skill.name, description: skill.description, content: skill.content };
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
      backLabel="Back to skills">
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <Input
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
                className="flex items-center justify-between gap-4 border-b border-border/50 px-4 py-3 last:border-b-0">
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
                  onClick={() => handleImport(skill)}>
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

  const form = useForm({
    defaultValues: toDraft(skill),
    validators: { onMount: createSkillSchema, onChange: createSkillSchema },
    onSubmit: async ({ value }) => {
      const input = { name: value.name.trim(), description: value.description.trim(), content: value.content.trim() };

      if (skill) {
        await updateSkill.mutateAsync({ name: skill.name, input });
      } else {
        await createSkill.mutateAsync(input);
      }

      onBack();
    },
  });

  const isEditing = !!skill;

  return (
    <SettingSubPage
      title={isEditing ? 'Edit Skill' : 'Add Skill'}
      description="Markdown instructions the agent can load when a task matches the description."
      onBack={onBack}
      backLabel="Back to skills">
      <form
        className="flex min-h-0 flex-1 flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}>
        <form.Field name="name">
          {(field) => (
            <div className="grid gap-2">
              <Label htmlFor="skill-name">Name</Label>
              <Input
                id="skill-name"
                value={field.state.value}
                placeholder="example-skill"
                aria-invalid={!!fieldErrorMessage(field.state.meta)}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
              <FieldError meta={field.state.meta} />
              <p className="text-xs text-muted-foreground">
                Lowercase letters, numbers, and single hyphens only. Names must be unique.
              </p>
            </div>
          )}
        </form.Field>

        <form.Field name="description">
          {(field) => (
            <div className="grid gap-2">
              <Label htmlFor="skill-description">Description</Label>
              <Textarea
                id="skill-description"
                value={field.state.value}
                rows={3}
                placeholder="What this skill does and when the agent should use it."
                aria-invalid={!!fieldErrorMessage(field.state.meta)}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
              <FieldError meta={field.state.meta} />
            </div>
          )}
        </form.Field>

        <form.Field name="content">
          {(field) => (
            <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-2">
              <Label htmlFor="skill-content">Markdown instructions</Label>
              <Textarea
                id="skill-content"
                value={field.state.value}
                placeholder="# Skill Instructions\n\nDescribe the workflow, constraints, examples, and expected behavior."
                className="thin-scrollbar min-h-0 resize-none overflow-auto font-mono text-xs"
                aria-invalid={!!fieldErrorMessage(field.state.meta)}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
              <FieldError meta={field.state.meta} />
            </div>
          )}
        </form.Field>

        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <div className="mt-auto flex justify-end gap-2 border-t border-border/50 pt-4">
              <Button type="button" variant="outline" onClick={onBack} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save skill'}
              </Button>
            </div>
          )}
        </form.Subscribe>
      </form>
    </SettingSubPage>
  );
}

export function SkillsSettings() {
  const page = SETTINGS_PAGE_BY_ID.skills;
  const Icon = page.icon;
  const { data: skills } = useSuspenseQuery(skillsQueryOptions);
  const deleteSkill = useDeleteSkill();
  const [view, setView] = React.useState<SkillView>({ type: 'list' });
  const [pendingDelete, setPendingDelete] = React.useState<Skill | null>(null);

  function handleAdd() {
    setView({ type: 'editor', skill: null });
  }

  function handleEdit(skill: Skill) {
    setView({ type: 'editor', skill });
  }

  function handleDelete(skill: Skill) {
    setPendingDelete(skill);
  }

  function handleConfirmDelete() {
    if (!pendingDelete) return;
    deleteSkill.mutate(pendingDelete.name);
    setPendingDelete(null);
  }

  if (view.type === 'editor') {
    return <SkillEditor skill={view.skill} onBack={() => setView({ type: 'list' })} />;
  }

  if (view.type === 'import') {
    return <ImportSkillView onBack={() => setView({ type: 'list' })} />;
  }

  return (
    <SettingPage
      title={page.title}
      description={page.description}
      icon={<Icon className="size-5" />}
      actions={
        <ButtonGroup>
          <Button variant="outline" onClick={() => setView({ type: 'import' })}>
            <DownloadIcon className="size-4" />
            Import
          </Button>
          <Button onClick={handleAdd}>
            <PlusIcon className="size-4" />
            Add Skill
          </Button>
        </ButtonGroup>
      }>
      {skills.length === 0 ? (
        <Empty surface="muted">
          <EmptyTitle>No skills yet</EmptyTitle>
          <EmptyDescription>
            Create a skill with a trigger-focused description and Markdown instructions.
          </EmptyDescription>
        </Empty>
      ) : (
        <SettingSection title="My Skills">
          <SettingRows>
            {skills.map((skill) => (
              <div key={skill.name} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{skill.name}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{skill.description}</p>
                </div>
                <ButtonGroup>
                  <SettingsIconButtonTooltip label={`View Skill`}>
                    <Button variant="outline" size="icon" onClick={() => handleEdit(skill)} aria-label={`View Skill`}>
                      <EyeIcon className="size-4" />
                    </Button>
                  </SettingsIconButtonTooltip>
                  <SettingsIconButtonTooltip label={`Delete Skill`}>
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={() => handleDelete(skill)}
                      disabled={deleteSkill.isPending}
                      aria-label={`Delete Skill`}>
                      <Trash2Icon className="size-4" />
                    </Button>
                  </SettingsIconButtonTooltip>
                </ButtonGroup>
              </div>
            ))}
          </SettingRows>
        </SettingSection>
      )}
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete skill?"
        description={`Delete skill "${pendingDelete?.name}"? This action cannot be undone.`}
        onConfirm={handleConfirmDelete}
        isPending={deleteSkill.isPending}
      />
    </SettingPage>
  );
}
