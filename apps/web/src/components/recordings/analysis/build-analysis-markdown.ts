import type { Recording, RecordingAnalysis } from '@stitch/shared/recordings/types';

const ACTION_STATUS_LABEL: Record<string, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
  unknown: 'Unknown',
};

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
      lines.push(`**Turns:** ${section.startTurn + 1}-${section.endTurn + 1}`);
      lines.push('');

      if (section.analysis.trim()) {
        lines.push(section.analysis.trim());
        lines.push('');
      }

      pushList(lines, 'Decisions', section.decisions);

      if (section.actionItems.length) {
        const actionItems = section.actionItems.map((item) => {
          const metadata = [
            `assignee: ${item.assignee ?? 'Unassigned'}`,
            item.dueDate ? `due: ${item.dueDate}` : null,
            `status: ${ACTION_STATUS_LABEL[item.status] ?? item.status}`,
          ].filter(Boolean);

          return `${item.task} (${metadata.join('; ')})`;
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

  if (analysis.blockers.length) {
    const blockers = analysis.blockers.map((blocker) => {
      const metadata = [
        `assignee: ${blocker.assignee ?? 'Unassigned'}`,
        `impact: ${blocker.impact ?? 'Unknown'}`,
      ];

      return `${blocker.description} (${metadata.join('; ')})`;
    });

    lines.push('## Overall Risks & Blockers');
    lines.push('');
    lines.push(...blockers.map((blocker) => `- ${blocker}`));
    lines.push('');
  }

  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
