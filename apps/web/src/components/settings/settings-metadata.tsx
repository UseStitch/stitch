import {
  BotIcon,
  BrainIcon,
  CpuIcon,
  GlobeIcon,
  KeyboardIcon,
  ListTodoIcon,
  MicIcon,
  MonitorIcon,
  NetworkIcon,
  PaletteIcon,
  ServerIcon,
  WandSparklesIcon,
  WrenchIcon,
  type LucideIcon,
} from 'lucide-react';

type SettingsSection = 'Desktop' | 'Apps' | 'AI';

type SettingsPageMetadata = {
  id: string;
  label: string;
  title: string;
  description: string;
  to: string;
  section: SettingsSection;
  icon: LucideIcon;
};

export const SETTINGS_PAGES = [
  {
    id: 'general',
    label: 'General',
    title: 'General',
    description: 'Configure models for different tasks',
    to: '/settings/general',
    section: 'Desktop',
    icon: MonitorIcon,
  },
  {
    id: 'connection',
    label: 'Connection',
    title: 'Connection',
    description: 'Configure how Stitch connects to its server.',
    to: '/settings/connection',
    section: 'Desktop',
    icon: ServerIcon,
  },
  {
    id: 'appearance',
    label: 'Appearance',
    title: 'Appearance',
    description: 'Customize how Stitch looks',
    to: '/settings/appearance',
    section: 'Desktop',
    icon: PaletteIcon,
  },
  {
    id: 'shortcuts',
    label: 'Shortcuts',
    title: 'Keyboard shortcuts',
    description: 'Customize keyboard shortcuts for quick actions',
    to: '/settings/shortcuts',
    section: 'Desktop',
    icon: KeyboardIcon,
  },
  {
    id: 'browser',
    label: 'Browser',
    title: 'Browser',
    description: 'Configure the browser used by Stitch',
    to: '/settings/browser',
    section: 'Apps',
    icon: GlobeIcon,
  },
  {
    id: 'recordings',
    label: 'Recordings',
    title: 'Recordings',
    description: 'Configure audio devices, capture settings, and analysis behavior for recordings.',
    to: '/settings/recordings',
    section: 'Apps',
    icon: MicIcon,
  },
  {
    id: 'agenda',
    label: 'Agenda',
    title: 'Agenda',
    description: 'Configure task tracking and agenda tools.',
    to: '/settings/agenda',
    section: 'Apps',
    icon: ListTodoIcon,
  },
  {
    id: 'agents',
    label: 'Agents',
    title: 'Agents',
    description: 'Customize the instructions Stitch follows in every conversation.',
    to: '/settings/agents',
    section: 'AI',
    icon: BotIcon,
  },
  {
    id: 'providers',
    label: 'Providers',
    title: 'Providers',
    description: 'Connect your AI providers and API keys',
    to: '/settings/providers',
    section: 'AI',
    icon: ServerIcon,
  },
  {
    id: 'models',
    label: 'Models',
    title: 'Models',
    description: 'Choose which models appear in the model selector',
    to: '/settings/models',
    section: 'AI',
    icon: CpuIcon,
  },
  {
    id: 'memory',
    label: 'Memory',
    title: 'Memory',
    description: 'Configure how Stitch remembers information across sessions',
    to: '/settings/memory',
    section: 'AI',
    icon: BrainIcon,
  },
  {
    id: 'skills',
    label: 'Skills',
    title: 'Skills',
    description: 'Add reusable Markdown instructions the agent can load as a default tool.',
    to: '/settings/skills',
    section: 'AI',
    icon: WandSparklesIcon,
  },
  {
    id: 'tools',
    label: 'Tools',
    title: 'Tools',
    description: 'Keep only the tools you need enabled, then open settings for permission behavior.',
    to: '/settings/tools',
    section: 'AI',
    icon: WrenchIcon,
  },
  {
    id: 'mcp-servers',
    label: 'MCP Servers',
    title: 'MCP Servers',
    description: 'Connect external tools and services via the Model Context Protocol.',
    to: '/settings/mcp-servers',
    section: 'AI',
    icon: NetworkIcon,
  },
] as const satisfies readonly SettingsPageMetadata[];

export const SETTINGS_SECTIONS = ['Desktop', 'Apps', 'AI'] as const satisfies readonly SettingsSection[];

export const SETTINGS_PAGE_BY_ID = Object.fromEntries(SETTINGS_PAGES.map((page) => [page.id, page])) as Record<
  (typeof SETTINGS_PAGES)[number]['id'],
  (typeof SETTINGS_PAGES)[number]
>;
