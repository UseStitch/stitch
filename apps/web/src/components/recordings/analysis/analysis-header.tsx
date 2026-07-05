import { FileTextIcon, Loader2Icon, SparklesIcon, SquareIcon, Trash2Icon } from 'lucide-react';

import type { MeetingNoteTemplate, RecordingAnalysis, Recording } from '@stitch/shared/recordings/types';

import { Button } from '@/components/ui/button';
import { ButtonGroup, ButtonGroupSeparator } from '@/components/ui/button-group';
import { CopyButton } from '@/components/ui/copy-button';
import { PageDescription, PageHeader, PageHeaderContent, PageIcon, PageTitle } from '@/components/ui/page';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatUsdCost } from '@/lib/format-cost';

function formatCost(costUsd: number | null | undefined): string | null {
  if (costUsd === null || costUsd === undefined) return null;
  return formatUsdCost(costUsd);
}

interface AnalysisHeaderProps {
  analysis: RecordingAnalysis | null | undefined;
  analysisMarkdown: string | null;
  recording: Recording | undefined;
  templates: MeetingNoteTemplate[];
  selectedTemplateId: string;
  isRunning: boolean;
  isStarting: boolean;
  isCancelling: boolean;
  isDeleting: boolean;
  isRecording?: boolean;
  isStopping?: boolean;
  onStartAnalysis: () => void;
  onTemplateChange: (templateId: string) => void;
  onCancelAnalysis: () => void;
  onDelete: () => void;
  onStopRecording?: () => void;
}

export function AnalysisHeader({
  analysis,
  analysisMarkdown,
  recording,
  templates,
  selectedTemplateId,
  isRunning,
  isStarting,
  isCancelling,
  isDeleting,
  isRecording,
  isStopping,
  onStartAnalysis,
  onTemplateChange,
  onCancelAnalysis,
  onDelete,
  onStopRecording,
}: AnalysisHeaderProps) {
  const showRecordingControls = isRecording && onStopRecording;
  const hasCompletedAnalysis = analysis?.status === 'completed';
  const costLabel = formatCost(analysis?.costUsd ?? recording?.costUsd);
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);
  const analysisDisabled = isStarting || isRunning || templates.length === 0;

  return (
    <PageHeader className="shrink-0">
      <PageHeaderContent>
        <PageIcon>
          <FileTextIcon className="size-5" />
        </PageIcon>
        <div>
          <PageTitle>{analysis?.title || recording?.title || 'Recording analysis'}</PageTitle>
          {costLabel ? (
            <PageDescription className="text-xs tabular-nums">Recording cost {costLabel}</PageDescription>
          ) : null}
        </div>
      </PageHeaderContent>
      <div className="flex items-center gap-3">
        {showRecordingControls ? (
          <Button onClick={onStopRecording} disabled={isStopping} variant="destructive" className="shadow-sm">
            <SquareIcon data-icon="inline-start" className="size-4" />
            Stop
          </Button>
        ) : null}
        {!showRecordingControls && analysisMarkdown ? (
          <CopyButton
            value={analysisMarkdown}
            copyLabel="Copy analysis markdown"
            copiedLabel="Copied analysis"
            className="shadow-sm"
          />
        ) : null}
        {!showRecordingControls ? (
          <ButtonGroup className="overflow-hidden rounded-lg shadow-sm">
            <Button
              onClick={onStartAnalysis}
              disabled={analysisDisabled}
              variant={hasCompletedAnalysis ? 'outline' : 'default'}
              className="rounded-none"
              aria-label={hasCompletedAnalysis ? 'Re-run analysis' : 'Analyze recording'}
              title={hasCompletedAnalysis ? 'Re-run analysis' : 'Analyze recording'}>
              {isStarting || isRunning ? (
                <Loader2Icon data-icon="inline-start" className="size-4 animate-spin" />
              ) : (
                <SparklesIcon data-icon="inline-start" className="size-4" />
              )}
            </Button>
            <ButtonGroupSeparator />
            <Select
              value={selectedTemplateId}
              onValueChange={(value) => value && onTemplateChange(value)}
              disabled={analysisDisabled}>
              <SelectTrigger className="h-9 w-44 rounded-none border-0 bg-background px-2 text-xs shadow-none">
                <SelectValue>{selectedTemplate?.name ?? 'Template'}</SelectValue>
              </SelectTrigger>
              <SelectContent align="end">
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </ButtonGroup>
        ) : null}
        {!showRecordingControls ? (
          <Button
            variant="outline"
            size="icon"
            onClick={onDelete}
            disabled={isDeleting || isRunning || isRecording}
            aria-label="Delete recording"
            className="text-destructive shadow-sm hover:text-destructive">
            {isDeleting ? <Loader2Icon className="size-4 animate-spin" /> : <Trash2Icon className="size-4" />}
          </Button>
        ) : null}
        {!showRecordingControls && isRunning ? (
          <Button variant="destructive" onClick={onCancelAnalysis} disabled={isCancelling} className="shadow-sm">
            {isCancelling ? <Loader2Icon data-icon="inline-start" className="size-4 animate-spin" /> : null}
            Cancel
          </Button>
        ) : null}
      </div>
    </PageHeader>
  );
}
