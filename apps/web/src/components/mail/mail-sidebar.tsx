import {
  ArchiveIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  InboxIcon,
  MailIcon,
  SendIcon,
  StarIcon,
  TagIcon,
  TrashIcon,
} from 'lucide-react';
import * as React from 'react';

import { useQuery } from '@tanstack/react-query';

import type { MailAccountId, MailLabelView } from '@stitch/shared/mail/types';

import {
  getLabelDisplayName,
  getLabelParts,
  readCollapsedLabelState,
  SYSTEM_LABEL_ORDER,
  titleCase,
  writeCollapsedLabelState,
  type LabelSection,
} from '@/components/mail/mail-label-utils';
import { useMailStore } from '@/components/mail/mail-store';
import { InternalSidebar } from '@/components/navigation/internal-sidebar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { SidebarMenuAction, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { getDefaultMailLabel, mailAccountsQueryOptions, mailLabelsQueryOptions } from '@/lib/queries/mail';
import { cn } from '@/lib/utils';

type UserLabelNode = { key: string; name: string; label: MailLabelView | null; children: UserLabelNode[] };

function getSystemLabelGroup(label: MailLabelView): 'primary' | 'category' | 'marker' | null {
  const normalized = label.providerLabelId.toUpperCase();
  if (['INBOX', 'SENT', 'DRAFT', 'DRAFTS', 'TRASH'].includes(normalized)) return 'primary';
  if (normalized.startsWith('CATEGORY_')) return 'category';
  if (label.kind === 'system') return 'marker';
  return null;
}

function getSystemIcon(label: MailLabelView) {
  const normalized = label.providerLabelId.toUpperCase();
  if (normalized === 'INBOX') return InboxIcon;
  if (normalized === 'SENT') return SendIcon;
  if (normalized === 'TRASH') return TrashIcon;
  if (normalized.startsWith('CATEGORY_')) return ArchiveIcon;
  if (normalized === 'IMPORTANT' || normalized === 'YELLOW_STAR' || normalized === 'STARRED') return StarIcon;
  return MailIcon;
}

function getLabelIconClassName(label: MailLabelView): string {
  const normalized = label.providerLabelId.toUpperCase();
  if (normalized === 'IMPORTANT' || normalized === 'YELLOW_STAR' || normalized === 'STARRED') {
    return 'size-3.5 text-warning fill-warning';
  }
  return 'size-3.5 text-muted-foreground';
}

function getLabelDepthClassName(depth: number): string | undefined {
  if (depth === 1) return 'pl-6';
  if (depth === 2) return 'pl-10';
  if (depth >= 3) return 'pl-14';
  return undefined;
}

function buildUserLabelTree(labels: MailLabelView[]): UserLabelNode[] {
  const roots: UserLabelNode[] = [];
  const nodes = new Map<string, UserLabelNode>();
  const labelNames = new Set(labels.map((label) => label.name));

  for (const label of labels) {
    const parts = getLabelParts(label);
    const hasParentPath = parts.length > 1 && labelNames.has(parts.slice(0, -1).join('/'));
    const pathParts = hasParentPath ? parts : [label.name];
    let siblings = roots;
    let path = '';

    for (const [index, part] of pathParts.entries()) {
      path = path ? `${path}/${part}` : part;
      let node = nodes.get(path);
      if (!node) {
        node = { key: path, name: part, label: null, children: [] };
        nodes.set(path, node);
        siblings.push(node);
      }

      if (index === pathParts.length - 1) node.label = label;
      siblings = node.children;
    }
  }

  const sortNodes = (items: UserLabelNode[]) => {
    items.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    for (const item of items) sortNodes(item.children);
  };
  sortNodes(roots);
  return roots;
}

function sortLabels(labels: MailLabelView[]): MailLabelView[] {
  return [...labels].sort((a, b) => {
    const aIndex = SYSTEM_LABEL_ORDER.findIndex((id) => id === a.providerLabelId.toUpperCase());
    const bIndex = SYSTEM_LABEL_ORDER.findIndex((id) => id === b.providerLabelId.toUpperCase());
    if (aIndex !== -1 || bIndex !== -1) return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
    if (a.kind !== b.kind) return a.kind === 'system' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

function LabelDivider({
  children,
  collapsed,
  onToggle,
}: {
  children: React.ReactNode;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="py-1">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-2 py-1 text-2xs font-medium tracking-wide text-muted-foreground uppercase transition-colors hover:text-sidebar-foreground">
        {collapsed ? <ChevronRightIcon className="size-3" /> : <ChevronDownIcon className="size-3" />}
        <span>{children}</span>
        <span className="h-px flex-1 bg-sidebar-border" />
      </button>
    </li>
  );
}

function LabelBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <Badge variant="secondary" size="xs" className="ml-auto">
      {count}
    </Badge>
  );
}

function LabelItem({
  label,
  active,
  depth = 0,
  childrenExpanded,
  hasChildren = false,
  onSelect,
  onToggle,
}: {
  label: MailLabelView;
  active: boolean;
  depth?: number;
  childrenExpanded?: boolean;
  hasChildren?: boolean;
  onSelect: () => void;
  onToggle?: () => void;
}) {
  const Icon = label.kind === 'system' ? getSystemIcon(label) : TagIcon;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        onClick={onSelect}
        className={cn(
          'justify-start gap-2',
          getLabelDepthClassName(depth),
          depth > 0 && 'text-muted-foreground',
          label.unreadCount > 0 && 'font-medium',
        )}>
        <Icon className={getLabelIconClassName(label)} />
        <span className="min-w-0 flex-1 truncate">{getLabelDisplayName(label)}</span>
        {!hasChildren ? <LabelBadge count={label.unreadCount} /> : null}
      </SidebarMenuButton>
      {hasChildren && onToggle ? (
        <SidebarMenuAction
          aria-label={
            childrenExpanded ? `Collapse ${getLabelDisplayName(label)}` : `Expand ${getLabelDisplayName(label)}`
          }
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}>
          {childrenExpanded ? <ChevronDownIcon className="size-3.5" /> : <ChevronRightIcon className="size-3.5" />}
        </SidebarMenuAction>
      ) : null}
    </SidebarMenuItem>
  );
}

function UserLabelTreeItem({
  node,
  depth,
  selectedLabelId,
  collapsedLabels,
  setSelectedLabelId,
  toggleCollapsedLabel,
}: {
  node: UserLabelNode;
  depth: number;
  selectedLabelId: MailLabelView['id'] | null;
  collapsedLabels: Set<string>;
  setSelectedLabelId: (labelId: MailLabelView['id']) => void;
  toggleCollapsedLabel: (key: string) => void;
}) {
  const expanded = !collapsedLabels.has(node.key);
  const hasChildren = node.children.length > 0;
  const label = node.label;

  return (
    <>
      {label ? (
        <LabelItem
          label={label}
          active={selectedLabelId === label.id}
          depth={depth}
          hasChildren={hasChildren}
          childrenExpanded={expanded}
          onSelect={() => setSelectedLabelId(label.id)}
          onToggle={() => toggleCollapsedLabel(node.key)}
        />
      ) : (
        <SidebarMenuItem>
          <SidebarMenuButton
            onClick={() => toggleCollapsedLabel(node.key)}
            className={cn('justify-start gap-2 text-muted-foreground', getLabelDepthClassName(depth))}>
            <TagIcon className="size-3.5 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{titleCase(node.name)}</span>
          </SidebarMenuButton>
          <SidebarMenuAction
            aria-label={expanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
            onClick={(event) => {
              event.stopPropagation();
              toggleCollapsedLabel(node.key);
            }}>
            {expanded ? <ChevronDownIcon className="size-3.5" /> : <ChevronRightIcon className="size-3.5" />}
          </SidebarMenuAction>
        </SidebarMenuItem>
      )}
      {expanded
        ? node.children.map((child) => (
            <UserLabelTreeItem
              key={child.key}
              node={child}
              depth={depth + 1}
              selectedLabelId={selectedLabelId}
              collapsedLabels={collapsedLabels}
              setSelectedLabelId={setSelectedLabelId}
              toggleCollapsedLabel={toggleCollapsedLabel}
            />
          ))
        : null}
    </>
  );
}

function MailLabelList({ accountId }: { accountId: MailAccountId }) {
  const { selectedLabelId, setSelectedLabelId } = useMailStore();
  const { data: labels = [] } = useQuery(mailLabelsQueryOptions(accountId));
  const sortedLabels = React.useMemo(() => sortLabels(labels), [labels]);
  const initialCollapsedState = React.useMemo(() => readCollapsedLabelState(accountId), [accountId]);
  const [collapsedLabels, setCollapsedLabels] = React.useState<Set<string>>(
    () => new Set(initialCollapsedState.labels),
  );
  const [collapsedSections, setCollapsedSections] = React.useState<Set<LabelSection>>(
    () => new Set(initialCollapsedState.sections),
  );
  const primaryLabels = sortedLabels.filter((label) => getSystemLabelGroup(label) === 'primary');
  const categoryLabels = sortedLabels.filter((label) => getSystemLabelGroup(label) === 'category');
  const markerLabels = sortedLabels.filter((label) => getSystemLabelGroup(label) === 'marker');
  const userLabelTree = React.useMemo(
    () => buildUserLabelTree(sortedLabels.filter((label) => label.kind === 'user')),
    [sortedLabels],
  );

  const toggleCollapsedLabel = React.useCallback(
    (key: string) => {
      setCollapsedLabels((currentLabels) => {
        const nextLabels = new Set(currentLabels);
        if (nextLabels.has(key)) nextLabels.delete(key);
        else nextLabels.add(key);
        writeCollapsedLabelState(accountId, nextLabels, collapsedSections);
        return nextLabels;
      });
    },
    [accountId, collapsedSections],
  );

  const toggleSection = React.useCallback(
    (section: LabelSection) => {
      setCollapsedSections((currentSections) => {
        const nextSections = new Set(currentSections);
        if (nextSections.has(section)) nextSections.delete(section);
        else nextSections.add(section);
        writeCollapsedLabelState(accountId, collapsedLabels, nextSections);
        return nextSections;
      });
    },
    [accountId, collapsedLabels],
  );

  React.useEffect(() => {
    if (!selectedLabelId && labels.length > 0) setSelectedLabelId(getDefaultMailLabel(labels)?.id ?? null);
  }, [labels, selectedLabelId, setSelectedLabelId]);

  return (
    <InternalSidebar.Section title="Labels">
      {primaryLabels.map((label) => (
        <LabelItem
          key={label.id}
          label={label}
          active={selectedLabelId === label.id}
          onSelect={() => setSelectedLabelId(label.id)}
        />
      ))}
      {categoryLabels.length > 0 ? (
        <LabelDivider collapsed={collapsedSections.has('categories')} onToggle={() => toggleSection('categories')}>
          Categories
        </LabelDivider>
      ) : null}
      {!collapsedSections.has('categories')
        ? categoryLabels.map((label) => (
            <LabelItem
              key={label.id}
              label={label}
              active={selectedLabelId === label.id}
              onSelect={() => setSelectedLabelId(label.id)}
            />
          ))
        : null}
      {markerLabels.length > 0 ? (
        <LabelDivider collapsed={collapsedSections.has('markers')} onToggle={() => toggleSection('markers')}>
          Markers
        </LabelDivider>
      ) : null}
      {!collapsedSections.has('markers')
        ? markerLabels.map((label) => (
            <LabelItem
              key={label.id}
              label={label}
              active={selectedLabelId === label.id}
              onSelect={() => setSelectedLabelId(label.id)}
            />
          ))
        : null}
      {userLabelTree.length > 0 ? (
        <LabelDivider collapsed={collapsedSections.has('custom')} onToggle={() => toggleSection('custom')}>
          Custom
        </LabelDivider>
      ) : null}
      {!collapsedSections.has('custom')
        ? userLabelTree.map((node) => (
            <UserLabelTreeItem
              key={node.key}
              node={node}
              depth={0}
              selectedLabelId={selectedLabelId}
              collapsedLabels={collapsedLabels}
              setSelectedLabelId={setSelectedLabelId}
              toggleCollapsedLabel={toggleCollapsedLabel}
            />
          ))
        : null}
    </InternalSidebar.Section>
  );
}

export function MailSidebarContent() {
  const { selectedAccountId, setSelectedAccountId } = useMailStore();
  const { data: accounts = [] } = useQuery(mailAccountsQueryOptions);
  const selectedAccount = accounts.find((account) => account.id === selectedAccountId) ?? accounts[0];

  React.useEffect(() => {
    if (!selectedAccountId && accounts[0]) setSelectedAccountId(accounts[0].id);
  }, [accounts, selectedAccountId, setSelectedAccountId]);

  return (
    <InternalSidebar>
      <InternalSidebar.Header>
        <InternalSidebar.Top>
          <InternalSidebar.TopTitle>
            <MailIcon className="size-4" />
            <span>Mail</span>
          </InternalSidebar.TopTitle>
        </InternalSidebar.Top>
        {selectedAccount ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  className="mx-2 mb-2 w-[calc(100%-1rem)] min-w-0 justify-between"
                  aria-label="Switch mail account"
                />
              }>
              <span className="truncate">{selectedAccount.email}</span>
              <ChevronDownIcon className="size-4 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {accounts.map((account) => (
                <DropdownMenuItem key={account.id} onClick={() => setSelectedAccountId(account.id)}>
                  <span className="truncate">{account.email}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </InternalSidebar.Header>
      <InternalSidebar.Content>
        {!selectedAccount ? (
          <Empty size="compact">
            <EmptyMedia>
              <MailIcon className="size-8 text-muted-foreground/40" />
            </EmptyMedia>
            <EmptyTitle>No mail accounts</EmptyTitle>
            <EmptyDescription>Enroll an account in Settings.</EmptyDescription>
          </Empty>
        ) : (
          <MailLabelList key={selectedAccount.id} accountId={selectedAccount.id} />
        )}
      </InternalSidebar.Content>
    </InternalSidebar>
  );
}
