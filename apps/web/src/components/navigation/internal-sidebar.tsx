import { SearchIcon } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

function Root({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function Header({ className, ...props }: React.ComponentProps<typeof SidebarHeader>) {
  return <SidebarHeader className={cn('pb-0', className)} {...props} />;
}

function Title({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex items-center gap-2 px-2 py-1 text-sm font-medium', className)} {...props} />;
}

function Top({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex h-8 items-center gap-2 px-2', className)} {...props} />;
}

function TopTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex min-w-0 flex-1 items-center gap-2 text-sm font-medium', className)} {...props} />;
}

function TopAction({ className, nativeButton, render, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button
      size="icon-sm"
      className={cn('shrink-0', className)}
      nativeButton={nativeButton ?? (render ? false : undefined)}
      render={render}
      {...props}
    />
  );
}

function Action(props: React.ComponentProps<typeof SidebarMenuButton>) {
  return <SidebarMenuButton {...props} />;
}

function Search({
  className,
  inputClassName,
  ...props
}: React.ComponentProps<typeof SidebarInput> & { inputClassName?: string }) {
  return (
    <div className={cn('relative', className)}>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <SidebarInput className={cn('pl-8', inputClassName)} {...props} />
    </div>
  );
}

function Content(props: React.ComponentProps<typeof SidebarContent>) {
  return <SidebarContent {...props} />;
}

function Group({
  title,
  action,
  children,
  ...props
}: React.ComponentProps<typeof SidebarGroup> & { title?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <SidebarGroup {...props}>
      {title || action ? (
        <div className="flex items-center justify-between">
          {title ? <SidebarGroupLabel>{title}</SidebarGroupLabel> : <div />}
          {action}
        </div>
      ) : null}
      <SidebarGroupContent>{children}</SidebarGroupContent>
    </SidebarGroup>
  );
}

function List({ className, ...props }: React.ComponentProps<typeof SidebarMenu>) {
  return <SidebarMenu className={cn('px-1', className)} {...props} />;
}

function Item({
  itemProps,
  ...props
}: React.ComponentProps<typeof SidebarMenuButton> & { itemProps?: React.ComponentProps<typeof SidebarMenuItem> }) {
  return (
    <SidebarMenuItem {...itemProps}>
      <SidebarMenuButton {...props} />
    </SidebarMenuItem>
  );
}

function Section({
  title,
  children,
  ...props
}: React.ComponentProps<typeof SidebarGroup> & { title: React.ReactNode }) {
  return (
    <Group title={title} {...props}>
      <List>{children}</List>
    </Group>
  );
}

function SectionItem(props: React.ComponentProps<typeof Item>) {
  return <Item {...props} />;
}

function EmptyState({
  icon: Icon,
  title,
  description,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-4 py-12 text-center', className)}>
      <Icon className="size-8 text-muted-foreground/40" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        {description ? <p className="text-xs text-muted-foreground/70">{description}</p> : null}
      </div>
    </div>
  );
}

export const InternalSidebar = Object.assign(Root, {
  Header,
  Title,
  Top,
  TopTitle,
  TopAction,
  Action,
  Search,
  Content,
  Group,
  List,
  Item,
  Section,
  SectionItem,
  EmptyState,
});
