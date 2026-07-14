import { MetricCard } from '@/components/ui/metric-card';

type SummaryCard = { label: string; value: string; description: string };

type UsageSummaryCardsProps = { cards: [SummaryCard, SummaryCard] };

export function UsageSummaryCards({ cards }: UsageSummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {cards.map((card) => (
        <MetricCard key={card.label} label={card.label} value={card.value} description={card.description} />
      ))}
    </div>
  );
}
