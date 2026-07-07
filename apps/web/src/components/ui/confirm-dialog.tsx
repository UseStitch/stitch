import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import type * as React from 'react';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description: React.ReactNode;
  onConfirm: () => void;
  onSecondaryAction?: () => void;
  confirmLabel?: string;
  secondaryActionLabel?: string;
  pendingLabel?: string;
  secondaryPendingLabel?: string;
  cancelLabel?: string;
  isPending?: boolean;
  isSecondaryPending?: boolean;
  variant?: 'destructive' | 'default';
  secondaryVariant?: 'destructive' | 'default';
  icon?: React.ReactNode;
  contentClassName?: string;
  children?: React.ReactNode;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  onSecondaryAction,
  confirmLabel = 'Delete',
  secondaryActionLabel,
  pendingLabel = 'Deleting...',
  secondaryPendingLabel = 'Archiving...',
  cancelLabel = 'Cancel',
  isPending = false,
  isSecondaryPending = false,
  variant = 'destructive',
  secondaryVariant = 'default',
  icon,
  contentClassName,
  children,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className={cn(contentClassName)}>
        <AlertDialogHeader>
          {icon && <AlertDialogMedia>{icon}</AlertDialogMedia>}
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending || isSecondaryPending}>{cancelLabel}</AlertDialogCancel>
          {onSecondaryAction && secondaryActionLabel ? (
            <AlertDialogAction
              variant={secondaryVariant}
              onClick={onSecondaryAction}
              disabled={isPending || isSecondaryPending}>
              {isSecondaryPending ? secondaryPendingLabel : secondaryActionLabel}
            </AlertDialogAction>
          ) : null}
          <AlertDialogAction variant={variant} onClick={onConfirm} disabled={isPending || isSecondaryPending}>
            {isPending ? pendingLabel : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
