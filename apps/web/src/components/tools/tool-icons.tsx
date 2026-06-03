import {
  BrainIcon,
  CalendarCheckIcon,
  CheckIcon,
  FilePenIcon,
  FilePlusIcon,
  FileTextIcon,
  GlobeIcon,
  HelpCircleIcon,
  HistoryIcon,
  ImageIcon,
  ListTodoIcon,
  MicIcon,
  PanelTopIcon,
  PencilIcon,
  SearchIcon,
  ServerIcon,
  TerminalIcon,
  WrenchIcon,
} from 'lucide-react';

export type ToolIconKind =
  | 'bash'
  | 'read'
  | 'edit'
  | 'write'
  | 'search'
  | 'web'
  | 'task'
  | 'question'
  | 'skill'
  | 'memory'
  | 'todo'
  | 'agenda'
  | 'browser'
  | 'recordings'
  | 'session-history'
  | 'inspect-image'
  | 'mcp'
  | 'generic';

const SEARCH_TOOLS = new Set(['gmail_search', 'drive_search', 'grep', 'glob']);

export function getToolIconKind(toolName: string): ToolIconKind {
  if (toolName === 'bash' || toolName === 'execute_typescript') return 'bash';
  if (toolName === 'read') return 'read';
  if (toolName === 'edit') return 'edit';
  if (toolName === 'write') return 'write';
  if (SEARCH_TOOLS.has(toolName)) return 'search';
  if (toolName === 'webfetch') return 'web';
  if (toolName === 'task') return 'task';
  if (toolName === 'question') return 'question';
  if (toolName === 'skill') return 'skill';
  if (toolName === 'memory') return 'memory';
  if (toolName === 'todo') return 'todo';
  if (toolName === 'inspect_image') return 'inspect-image';
  if (toolName.startsWith('agenda_')) return 'agenda';
  if (toolName === 'browser' || toolName.startsWith('browser_')) return 'browser';
  if (toolName.startsWith('recordings_')) return 'recordings';
  if (toolName.startsWith('session_history_')) return 'session-history';
  return 'generic';
}

export function ToolKindIcon({ kind, className }: { kind: ToolIconKind; className?: string }) {
  switch (kind) {
    case 'bash':
      return <TerminalIcon className={className} />;
    case 'read':
      return <FileTextIcon className={className} />;
    case 'edit':
      return <PencilIcon className={className} />;
    case 'write':
      return <FilePlusIcon className={className} />;
    case 'search':
      return <SearchIcon className={className} />;
    case 'web':
      return <GlobeIcon className={className} />;
    case 'task':
      return <WrenchIcon className={className} />;
    case 'question':
      return <HelpCircleIcon className={className} />;
    case 'skill':
      return <CheckIcon className={className} />;
    case 'memory':
      return <BrainIcon className={className} />;
    case 'todo':
      return <ListTodoIcon className={className} />;
    case 'agenda':
      return <CalendarCheckIcon className={className} />;
    case 'browser':
      return <PanelTopIcon className={className} />;
    case 'recordings':
      return <MicIcon className={className} />;
    case 'inspect-image':
      return <ImageIcon className={className} />;
    case 'session-history':
      return <HistoryIcon className={className} />;
    case 'mcp':
      return <WrenchIcon className={className} />;
    case 'generic':
      return <FilePenIcon className={className} />;
  }
}

export function ToolNameIcon({ toolName, className }: { toolName: string; className?: string }) {
  return <ToolKindIcon kind={getToolIconKind(toolName)} className={className} />;
}

export function NativeToolsetIcon({
  toolsetId,
  className,
}: {
  toolsetId: string;
  className?: string;
}) {
  if (toolsetId === 'agenda') return <CalendarCheckIcon className={className} />;
  if (toolsetId === 'browser') return <PanelTopIcon className={className} />;
  if (toolsetId === 'recordings') return <MicIcon className={className} />;
  if (toolsetId === 'session-history') return <HistoryIcon className={className} />;

  return <ServerIcon className={className} />;
}
