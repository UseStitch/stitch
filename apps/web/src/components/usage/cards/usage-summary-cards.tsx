import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type SummaryCard = {
  label: string;
  value: string;
  description: string;
};

type UsageSummaryCardsProps = {
  cards: [SummaryCard, SummaryCard];
};

export function UsageSummaryCards({ cards }: UsageSummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {cards.map((card) => (
        <Card key={card.label} className="shadow-sm">
          <CardHeader>
            <CardDescription>{card.label}</CardDescription>
            <CardTitle className="text-3xl font-bold tabular-nums">{card.value}</CardTitle>
            <p className="text-xs text-muted-foreground">{card.description}</p>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
