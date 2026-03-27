import type { ToolCallStatus } from '@stitch/shared/chat/realtime';
import { parseMcpToolName } from '@stitch/shared/mcp/types';

import { BashToolBlock } from '@/components/chat/message-bubble/tool-call/bash-tool-block';
import { BrowserToolBlock } from '@/components/chat/message-bubble/tool-call/browser-tool-block';
import { FileToolBlock } from '@/components/chat/message-bubble/tool-call/file-tool-block';
import { GenericToolBlock } from '@/components/chat/message-bubble/tool-call/generic-tool-block';
import { McpToolBlock } from '@/components/chat/message-bubble/tool-call/mcp-tool-block';
import { QuestionToolBlock } from '@/components/chat/message-bubble/tool-call/question-tool-block';
import { SubAgentToolBlock } from '@/components/chat/message-bubble/tool-call/sub-agent-tool-block';
import { WebfetchToolBlock } from '@/components/chat/message-bubble/tool-call/webfetch-tool-block';

type ToolCallBlockProps = {
  toolName: string;
  status: ToolCallStatus;
  args?: unknown;
  result?: unknown;
  error?: string;
  onAbort?: () => void;
};

export function ToolCallBlock({
  toolName,
  status,
  args,
  result,
  error,
  onAbort,
}: ToolCallBlockProps) {
  const hasArgs = args !== undefined && args !== null;
  const isMcp = parseMcpToolName(toolName) !== null;
  const isSubAgent = toolName.startsWith('subagent_');

  if (isSubAgent) {
    return (
      <SubAgentToolBlock
        toolName={toolName}
        status={status}
        args={args}
        result={result}
        error={error}
      />
    );
  }

  if (isMcp) {
    return <McpToolBlock toolName={toolName} status={status} error={error} />;
  }

  if (toolName === 'question' && hasArgs) {
    return <QuestionToolBlock toolName={toolName} status={status} args={args} result={result} />;
  }

  if (toolName === 'webfetch' && hasArgs) {
    return (
      <WebfetchToolBlock
        toolName={toolName}
        status={status}
        args={args}
        error={error}
        onAbort={onAbort}
      />
    );
  }

  if (toolName === 'bash' && hasArgs) {
    return <BashToolBlock toolName={toolName} status={status} args={args} onAbort={onAbort} />;
  }

  if ((toolName === 'write' || toolName === 'edit' || toolName === 'read') && hasArgs) {
    return <FileToolBlock toolName={toolName} status={status} args={args} error={error} />;
  }

  if (toolName === 'browser' && hasArgs) {
    return (
      <BrowserToolBlock
        toolName={toolName}
        status={status}
        args={args}
        result={result}
        error={error}
      />
    );
  }

  return <GenericToolBlock toolName={toolName} status={status} error={error} />;
}
