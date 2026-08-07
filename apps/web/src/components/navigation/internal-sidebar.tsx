import * as React from 'react';

import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/search-input';
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { cn } from 'cnfast';


function Root({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function Header({ className, ...props }: React.ComponentProps<typeof SidebarHeader>) {
  return <SidebarHeader className={cn('pb-space-none', className)} {...props} />;
}

function Title({ className, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={cn('flex items-center gap-space-m px-space-m py-space-xs', className)} {...props}>
      {typeof children === 'string' ? <Text variant="body-strong">{children}</Text> : children}
    </div>
  );
}

function Top({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex h-8 items-center gap-space-m px-space-m', className)} {...props} />;
}

function TopTitle({ className, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={cn('flex min-w-0 flex-1 items-center gap-space-m', className)} {...props}>
      {typeof children === 'string' ? <Text variant="body-strong">{children}</Text> : children}
    </div>
  );
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
}: React.ComponentProps<typeof SearchInput> & { inputClassName?: string }) {
  return <SearchInput containerClassName={cn('bg-background', className)} className={inputClassName} {...props} />;
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
        <Stack direction="row" align="center" justify="between">
          {title ? <SidebarGroupLabel>{title}</SidebarGroupLabel> : <div />}
          {action}
        </Stack>
      ) : null}
      <SidebarGroupContent>{children}</SidebarGroupContent>
    </SidebarGroup>
  );
}

function List({ className, ...props }: React.ComponentProps<typeof SidebarMenu>) {
  return <SidebarMenu className={cn('px-space-xs', className)} {...props} />;
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
});
