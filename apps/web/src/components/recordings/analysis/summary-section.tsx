import { AlertTriangleIcon, CheckCircle2Icon, HelpCircleIcon, ListTodoIcon } from 'lucide-react';

import type { RecordingAnalysis } from '@stitch/shared/recordings/types';

import ChatMarkdown from '@/components/chat/chat-markdown';

interface SummarySectionProps {
  analysis: RecordingAnalysis | null | undefined;
  isRunning: boolean;
}

export function SummarySection({ analysis, isRunning }: SummarySectionProps) {
  const allDecisions = analysis?.topicSections.flatMap((s) => s.decisions) ?? [];
  const allBlockers = analysis?.blockers ?? [];
  const allActionItems = analysis?.topicSections.flatMap((s) => s.actionItems) ?? [];
  const allOpenQuestions = analysis?.topicSections.flatMap((s) => s.openQuestions) ?? [];

  const hasAnyMetrics =
    allDecisions.length > 0 ||
    allActionItems.length > 0 ||
    allBlockers.length > 0 ||
    allOpenQuestions.length > 0;

  return (
    <section className="flex flex-col gap-5">
      {/* Metric Cards Top Row - only show if any metric has a value */}
      {hasAnyMetrics ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {/* Decisions Metric */}
          <div className="flex flex-col justify-center rounded-xl border border-border/60 bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CheckCircle2Icon className="size-4" />
              <h3 className="text-sm font-medium">Decisions</h3>
            </div>
            <p className="mt-2 text-2xl font-bold text-foreground">{allDecisions.length}</p>
          </div>

          {/* Action Items Metric */}
          <div className="flex flex-col justify-center rounded-xl border border-border/60 bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <ListTodoIcon className="size-4" />
              <h3 className="text-sm font-medium">Action Items</h3>
            </div>
            <p className="mt-2 text-2xl font-bold text-foreground">{allActionItems.length}</p>
          </div>

          {/* Risks Metric */}
          <div className="flex flex-col justify-center rounded-xl border border-border/60 bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <AlertTriangleIcon className="size-4" />
              <h3 className="text-sm font-medium">Risks</h3>
            </div>
            <p
              className={`mt-2 text-2xl font-bold ${allBlockers.length > 0 ? 'text-destructive' : 'text-foreground'}`}
            >
              {allBlockers.length}
            </p>
          </div>

          {/* Open Questions Metric */}
          <div className="flex flex-col justify-center rounded-xl border border-border/60 bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <HelpCircleIcon className="size-4" />
              <h3 className="text-sm font-medium">Open Questions</h3>
            </div>
            <p className="mt-2 text-2xl font-bold text-foreground">{allOpenQuestions.length}</p>
          </div>
        </div>
      ) : null}

      {/* Main Summary Content */}
      <div className="rounded-xl border border-border/60 bg-card p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold tracking-wider text-muted-foreground uppercase">
          Executive Summary
        </h2>
        {analysis?.summary ? (
          <div className="prose prose-sm max-w-none text-foreground/90 dark:prose-invert">
            <ChatMarkdown text={analysis.summary} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {isRunning
              ? 'Analyzing recording to generate summary...'
              : 'No summary generated yet. Run the analysis to see the summary.'}
          </p>
        )}
      </div>
    </section>
  );
}
