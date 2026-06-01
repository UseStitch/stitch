import type { RecordingAnalysisTopicSection } from '@stitch/shared/recordings/types';

import { TopicCard } from './topic-card';

interface TopicListProps {
  sections: RecordingAnalysisTopicSection[] | undefined;
  isRunning: boolean;
}

function occurrenceKey(value: string, counts: Map<string, number>): string {
  const count = counts.get(value) ?? 0;
  counts.set(value, count + 1);
  return count === 0 ? value : `${value}-${count}`;
}

export function TopicList({ sections, isRunning }: TopicListProps) {
  if (!sections?.length) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/10 text-sm text-muted-foreground">
        {isRunning
          ? 'Analyzing recording to extract topics...'
          : 'No topic breakdown yet. Run analysis to extract topic-level details.'}
      </div>
    );
  }

  const keyCounts = new Map<string, number>();

  return (
    <div className="space-y-6">
      <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">
        Topic Analysis
      </h2>
      <div className="flex flex-col gap-6">
        {sections.map((section) => (
          <TopicCard key={occurrenceKey(section.name, keyCounts)} section={section} />
        ))}
      </div>
    </div>
  );
}
