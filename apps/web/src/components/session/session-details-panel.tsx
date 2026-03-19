import { SessionDetailsSheet } from '@/components/session/session-details-sheet';
import { useSessionDetailsStats } from '@/hooks/session/use-session-details-stats';

type SessionDetailsPanelProps = {
  className?: string;
};

export function SessionDetailsPanel({ className }: SessionDetailsPanelProps) {
  const details = useSessionDetailsStats();

  return <SessionDetailsSheet {...details} className={className} />;
}
