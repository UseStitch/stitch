import { 
  AlertCircleIcon, 
  CheckCircle2Icon, 
  HelpCircleIcon, 
  ArrowRightCircleIcon,
  ListTodoIcon,
  UserCircleIcon,
  ClockIcon
} from 'lucide-react';
import type { RecordingAnalysisTopicSection } from '@stitch/shared/recordings/types';
import { actionStatusColor, actionStatusLabel } from './utils';

export function TopicCard({ section }: { section: RecordingAnalysisTopicSection }) {
  return (
    <article className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm transition-all hover:shadow-md">
      {/* Header */}
      <div className="border-b border-border/40 bg-muted/20 px-6 py-4">
        <h3 className="text-lg font-semibold tracking-tight text-foreground">{section.name}</h3>
        <p className="mt-1 flex items-center text-xs text-muted-foreground">
          <ClockIcon className="mr-1.5 size-3" />
          Turns {section.startTurn + 1}–{section.endTurn + 1}
        </p>
      </div>

      {/* Body */}
      <div className="space-y-6 p-6">
        {/* Analysis Text */}
        <p className="text-sm leading-relaxed text-foreground/85">
          {section.analysis}
        </p>

        {/* Decisions */}
        {section.decisions.length > 0 && (
          <div className="rounded-lg border border-border/40 bg-muted/10 p-4">
            <h4 className="mb-3 flex items-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <CheckCircle2Icon className="mr-2 size-4 text-primary/70" />
              Decisions
            </h4>
            <ul className="space-y-2">
              {section.decisions.map((decision, i) => (
                <li key={`${i}-${decision}`} className="flex items-start text-sm text-foreground/80">
                  <span className="mr-2 mt-2 size-1.5 shrink-0 rounded-full bg-primary/60" />
                  <span>{decision}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Action Items */}
        {section.actionItems.length > 0 && (
          <div>
            <h4 className="mb-3 flex items-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <ListTodoIcon className="mr-2 size-4 text-foreground/60" />
              Action Items
            </h4>
            <ul className="space-y-3">
              {section.actionItems.map((item, i) => (
                <li key={`${i}-${item.task}`} className="flex flex-col gap-2 rounded-lg border border-border/50 bg-background px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-medium text-foreground">{item.task}</p>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1">
                      <UserCircleIcon className="size-3.5" />
                      <span className="font-medium text-foreground/80">{item.assignee ?? 'Unassigned'}</span>
                    </div>
                    {item.dueDate && (
                      <div className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1">
                         <span className="font-medium text-foreground/80">Due: {item.dueDate}</span>
                      </div>
                    )}
                    <span className={`ml-auto font-medium sm:ml-0 ${actionStatusColor(item.status)}`}>
                      {actionStatusLabel(item.status)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Risks & Blockers */}
        {section.blockers.length > 0 && (
          <div>
            <h4 className="mb-3 flex items-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <AlertCircleIcon className="mr-2 size-4 text-destructive/70" />
              Risks & Blockers
            </h4>
            <ul className="space-y-3">
              {section.blockers.map((blocker, i) => (
                <li key={`${i}-${blocker.description}`} className="flex flex-col gap-2 rounded-lg border border-border/50 border-l-4 border-l-destructive bg-background px-4 py-3 shadow-sm">
                  <p className="text-sm font-medium text-foreground">{blocker.description}</p>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      Assignee: <span className="font-medium text-foreground/80">{blocker.assignee ?? 'Unassigned'}</span>
                    </span>
                    <span className="size-1 rounded-full bg-border" />
                    <span className="flex items-center gap-1.5">
                      Impact: <span className="font-medium text-foreground/80">{blocker.impact ?? 'Unknown'}</span>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Open Questions */}
        {section.openQuestions.length > 0 && (
          <div className="rounded-lg border border-border/40 bg-muted/10 p-4">
            <h4 className="mb-3 flex items-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <HelpCircleIcon className="mr-2 size-4 text-warning/70" />
              Open Questions
            </h4>
            <ul className="space-y-2">
              {section.openQuestions.map((question, i) => (
                <li key={`${i}-${question}`} className="flex items-start text-sm text-foreground/80">
                  <span className="mr-2 mt-2 size-1.5 shrink-0 rounded-full bg-warning/60" />
                  <span>{question}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Next Steps */}
        {section.nextSteps.length > 0 && (
          <div className="rounded-lg border border-border/40 bg-muted/10 p-4">
            <h4 className="mb-3 flex items-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <ArrowRightCircleIcon className="mr-2 size-4 text-primary/70" />
              Next Steps
            </h4>
            <ul className="space-y-2">
              {section.nextSteps.map((step, i) => (
                <li key={`${i}-${step}`} className="flex items-start text-sm text-foreground/80">
                  <span className="mr-2 mt-2 size-1.5 shrink-0 rounded-full bg-primary/60" />
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </article>
  );
}
