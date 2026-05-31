import {
  AlertCircleIcon,
  ArrowRightCircleIcon,
  CheckCircle2Icon,
  ClockIcon,
  HelpCircleIcon,
  ListTodoIcon,
  UserCircleIcon,
} from 'lucide-react';

import type { RecordingAnalysisTopicSection } from '@stitch/shared/recordings/types';

import { actionStatusColor, actionStatusLabel } from './utils';

import type { ReactNode } from 'react';

type TopicActionItem = RecordingAnalysisTopicSection['actionItems'][number];
type TopicBlocker = RecordingAnalysisTopicSection['blockers'][number];

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

  return (
    <div className="rounded-lg border border-border/40 bg-muted/10 p-4">
      <h4 className="mb-3 flex items-center text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        {icon}
        {title}
      </h4>
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li key={`${index}-${item}`} className="flex items-start text-sm text-foreground/80">
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

  return (
    <div>
      <h4 className="mb-3 flex items-center text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        <ListTodoIcon className="mr-2 size-4 text-foreground/60" />
        Action Items
      </h4>
      <ul className="space-y-3">
        {items.map((item, index) => (
          <li
            key={`${index}-${item.task}`}
            className="flex flex-col gap-2 rounded-lg border border-border/50 bg-background px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="text-sm font-medium text-foreground">{item.task}</p>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1">
                <UserCircleIcon className="size-3.5" />
                <span className="font-medium text-foreground/80">
                  {item.assignee ?? 'Unassigned'}
                </span>
              </div>
              {item.dueDate ? (
                <div className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1">
                  <span className="font-medium text-foreground/80">Due: {item.dueDate}</span>
                </div>
              ) : null}
              <span className={`ml-auto font-medium sm:ml-0 ${actionStatusColor(item.status)}`}>
                {actionStatusLabel(item.status)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BlockersSection({ blockers }: { blockers: TopicBlocker[] }) {
  if (blockers.length === 0) return null;

  return (
    <div>
      <h4 className="mb-3 flex items-center text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        <AlertCircleIcon className="mr-2 size-4 text-destructive/70" />
        Risks & Blockers
      </h4>
      <ul className="space-y-3">
        {blockers.map((blocker, index) => (
          <li
            key={`${index}-${blocker.description}`}
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
        <p className="mt-1 flex items-center text-xs text-muted-foreground">
          <ClockIcon className="mr-1.5 size-3" />
          Turns {section.startTurn + 1}–{section.endTurn + 1}
        </p>
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
