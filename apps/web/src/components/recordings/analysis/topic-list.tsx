import type { RecordingAnalysisTopicSection } from '@stitch/shared/recordings/types';
import { TopicCard } from './topic-card';

interface TopicListProps {
  sections: RecordingAnalysisTopicSection[] | undefined;
  isRunning: boolean;
}

export function TopicList({ sections, isRunning }: TopicListProps) {
  if (!sections?.length) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/10 text-sm text-muted-foreground">
        {isRunning ? 'Analyzing recording to extract topics...' : 'No topic breakdown yet. Run analysis to extract topic-level details.'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Topic Analysis</h2>
      <div className="flex flex-col gap-6">
        {sections.map((section, index) => (
          <TopicCard key={`${section.name}-${index}`} section={section} />
        ))}
      </div>
    </div>
  );
}
