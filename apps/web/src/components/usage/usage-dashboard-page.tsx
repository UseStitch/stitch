import { BarChart3Icon } from 'lucide-react';

import {
  Page,
  PageContent,
  PageDescription,
  PageHeader,
  PageHeaderContent,
  PageIcon,
  PageTitle,
} from '@/components/ui/page';
import { UsageDashboardCostChart } from '@/components/usage/usage-dashboard-cost-chart';
import { UsageDashboardFilters } from '@/components/usage/usage-dashboard-filters';
import { UsageDashboardSummaryCards } from '@/components/usage/usage-dashboard-summary-cards';
import { useUsageDashboardData } from '@/components/usage/use-usage-dashboard-data';

export function UsageDashboardPage() {
  const dashboard = useUsageDashboardData();

  return (
    <Page className="thin-scrollbar">
      <PageContent className="pb-10">
        <PageHeader>
          <PageHeaderContent>
            <PageIcon>
              <BarChart3Icon className="size-5" />
            </PageIcon>
            <div>
              <PageTitle>Usage</PageTitle>
              <PageDescription>
                Cost and token analytics across providers, models, and sources.
              </PageDescription>
            </div>
          </PageHeaderContent>
        </PageHeader>

        <UsageDashboardFilters
          availableModels={dashboard.availableModels}
          availableProviders={dashboard.availableProviders}
          filters={dashboard.filters}
          labels={dashboard.labels}
          isFetching={dashboard.isFetching}
          onModelChange={dashboard.setModelFilter}
          onProviderChange={dashboard.setProviderFilter}
          onRangeChange={dashboard.setRangeFilter}
        />

        <UsageDashboardSummaryCards
          rangeLabel={dashboard.labels.range}
          usageData={dashboard.usageData}
        />

        <UsageDashboardCostChart usageData={dashboard.usageData} />
      </PageContent>
    </Page>
  );
}
