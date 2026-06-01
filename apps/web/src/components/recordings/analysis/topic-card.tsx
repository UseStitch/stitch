import {
  AlertCircleIcon,
  ArrowRightCircleIcon,
  CheckCircle2Icon,
  HelpCircleIcon,
  ListTodoIcon,
} from 'lucide-react';

import type { RecordingAnalysisTopicSection } from '@stitch/shared/recordings/types';

import type { ReactNode } from 'react';

type TopicActionItem = RecordingAnalysisTopicSection['actionItems'][number];
type TopicBlocker = RecordingAnalysisTopicSection['blockers'][number];

function occurrenceKey(value: string, counts: Map<string, number>): string {
  const count = counts.get(value) ?? 0;
  counts.set(value, count + 1);
  return count === 0 ? value : `${value}-${count}`;
}

function BulletListSection({
  title,
  icon,
  items,
  bulletClassName,
}: {
  title: string;
  icon: ReactNode;
  items: string[];
  bulletClassName: string;
}) {
  if (items.length === 0) return null;

  const keyCounts = new Map<string, number>();

  return (
    <div className="rounded-lg border border-border/40 bg-muted/10 p-4">
      <h4 className="mb-3 flex items-center text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        {icon}
        {title}
      </h4>
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={occurrenceKey(item, keyCounts)}
            className="flex items-start text-sm text-foreground/80"
          >
            <span className={`mt-2 mr-2 size-1.5 shrink-0 rounded-full ${bulletClassName}`} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActionItemsSection({ items }: { items: TopicActionItem[] }) {
  if (items.length === 0) return null;

  const keyCounts = new Map<string, number>();

  return (
    <div>
      <h4 className="mb-3 flex items-center text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        <ListTodoIcon className="mr-2 size-4 text-foreground/60" />
        Action Items
      </h4>
      <ul className="space-y-3">
        {items.map((item) => (
          <li
            key={occurrenceKey(`${item.task}:${item.dueDate ?? ''}`, keyCounts)}
            className="flex flex-col gap-2 rounded-lg border border-border/50 bg-background px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="text-sm font-medium text-foreground">{item.task}</p>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {item.dueDate ? (
                <div className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1">
                  <span className="font-medium text-foreground/80">Due: {item.dueDate}</span>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BlockersSection({ blockers }: { blockers: TopicBlocker[] }) {
  if (blockers.length === 0) return null;

  const keyCounts = new Map<string, number>();

  return (
    <div>
      <h4 className="mb-3 flex items-center text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        <AlertCircleIcon className="mr-2 size-4 text-destructive/70" />
        Risks & Blockers
      </h4>
      <ul className="space-y-3">
        {blockers.map((blocker) => (
          <li
            key={occurrenceKey(
              `${blocker.description}:${blocker.assignee ?? ''}:${blocker.impact ?? ''}`,
              keyCounts,
            )}
            className="flex flex-col gap-2 rounded-lg border border-l-4 border-border/50 border-l-destructive bg-background px-4 py-3 shadow-sm"
          >
            <p className="text-sm font-medium text-foreground">{blocker.description}</p>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                Assignee:{' '}
                <span className="font-medium text-foreground/80">
                  {blocker.assignee ?? 'Unassigned'}
                </span>
              </span>
              <span className="size-1 rounded-full bg-border" />
              <span className="flex items-center gap-1.5">
                Impact:{' '}
                <span className="font-medium text-foreground/80">
                  {blocker.impact ?? 'Unknown'}
                </span>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TopicCard({ section }: { section: RecordingAnalysisTopicSection }) {
  return (
    <article className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm transition-all hover:shadow-md">
      <div className="border-b border-border/40 bg-muted/20 px-6 py-4">
        <h3 className="text-lg font-semibold tracking-tight text-foreground">{section.name}</h3>
      </div>

      <div className="space-y-6 p-6">
        <p className="text-sm leading-relaxed text-foreground/85">{section.analysis}</p>

        <BulletListSection
          title="Decisions"
          icon={<CheckCircle2Icon className="mr-2 size-4 text-primary/70" />}
          items={section.decisions}
          bulletClassName="bg-primary/60"
        />
        <ActionItemsSection items={section.actionItems} />
        <BlockersSection blockers={section.blockers} />
        <BulletListSection
          title="Open Questions"
          icon={<HelpCircleIcon className="mr-2 size-4 text-warning/70" />}
          items={section.openQuestions}
          bulletClassName="bg-warning/60"
        />
        <BulletListSection
          title="Next Steps"
          icon={<ArrowRightCircleIcon className="mr-2 size-4 text-primary/70" />}
          items={section.nextSteps}
          bulletClassName="bg-primary/60"
        />
      </div>
    </article>
  );
}
