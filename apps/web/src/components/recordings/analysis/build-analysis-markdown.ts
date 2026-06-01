import type { Recording, RecordingAnalysis } from '@stitch/shared/recordings/types';

function pushList(lines: string[], title: string, items: string[]): void {
  if (!items.length) return;
  lines.push(`**${title}**`);
  lines.push(...items.map((item) => `- ${item}`));
  lines.push('');
}

export function buildAnalysisMarkdown(
  analysis: RecordingAnalysis | null | undefined,
  recording: Recording | undefined,
): string | null {
  if (!analysis || analysis.status !== 'completed') return null;

  const lines: string[] = [];
  const title = analysis.title || recording?.title || 'Recording analysis';

  lines.push(`# ${title}`);
  lines.push('');

  if (analysis.summary.trim()) {
    lines.push('## Executive Summary');
    lines.push('');
    lines.push(analysis.summary.trim());
    lines.push('');
  }

  if (analysis.topicSections.length) {
    lines.push('## Topic Analysis');
    lines.push('');

    analysis.topicSections.forEach((section, index) => {
      lines.push(`### ${index + 1}. ${section.name}`);
      lines.push('');

      if (section.analysis.trim()) {
        lines.push(section.analysis.trim());
        lines.push('');
      }

      pushList(lines, 'Decisions', section.decisions);

      if (section.actionItems.length) {
        const actionItems = section.actionItems.map((item) => {
          const metadata = [item.dueDate ? `due: ${item.dueDate}` : null].filter(Boolean);

          return metadata.length > 0 ? `${item.task} (${metadata.join('; ')})` : item.task;
        });

        pushList(lines, 'Action Items', actionItems);
      }

      if (section.blockers.length) {
        const blockers = section.blockers.map((blocker) => {
          const metadata = [
            `assignee: ${blocker.assignee ?? 'Unassigned'}`,
            `impact: ${blocker.impact ?? 'Unknown'}`,
          ];
          return `${blocker.description} (${metadata.join('; ')})`;
        });

        pushList(lines, 'Risks & Blockers', blockers);
      }

      pushList(lines, 'Open Questions', section.openQuestions);
      pushList(lines, 'Next Steps', section.nextSteps);
    });
  }

  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
