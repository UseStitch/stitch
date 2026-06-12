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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmbeddingUsageCostChart } from '@/components/usage/embedding-usage-cost-chart';
import { EmbeddingUsageSummaryCards } from '@/components/usage/embedding-usage-summary-cards';
import { SttUsageCostChart } from '@/components/usage/stt-usage-cost-chart';
import { SttUsageSummaryCards } from '@/components/usage/stt-usage-summary-cards';
import { UsageDashboardCostChart } from '@/components/usage/usage-dashboard-cost-chart';
import { UsageDashboardFilters } from '@/components/usage/usage-dashboard-filters';
import { UsageDashboardSummaryCards } from '@/components/usage/usage-dashboard-summary-cards';
import { useEmbeddingUsageDashboardData } from '@/components/usage/use-embedding-usage-dashboard-data';
import { useSttUsageDashboardData } from '@/components/usage/use-stt-usage-dashboard-data';
import { useUsageDashboardData } from '@/components/usage/use-usage-dashboard-data';

export function UsageDashboardPage() {
  const llm = useUsageDashboardData();
  const stt = useSttUsageDashboardData(llm.filters.range);
  const embedding = useEmbeddingUsageDashboardData(llm.filters.range);

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

        <Tabs defaultValue="llm">
          <TabsList variant="line">
            <TabsTrigger value="llm">LLM</TabsTrigger>
            <TabsTrigger value="stt">Speech-to-Text</TabsTrigger>
            <TabsTrigger value="embedding">Embedding</TabsTrigger>
          </TabsList>

          <TabsContent value="llm" className="mt-4 flex flex-col gap-4">
            <UsageDashboardFilters
              availableModels={llm.availableModels}
              availableProviders={llm.availableProviders}
              filters={llm.filters}
              labels={llm.labels}
              isFetching={llm.isFetching}
              onModelChange={llm.setModelFilter}
              onProviderChange={llm.setProviderFilter}
              onRangeChange={llm.setRangeFilter}
            />
            <UsageDashboardSummaryCards rangeLabel={llm.labels.range} usageData={llm.usageData} />
            <UsageDashboardCostChart usageData={llm.usageData} />
          </TabsContent>

          <TabsContent value="stt" className="mt-4 flex flex-col gap-4">
            <UsageDashboardFilters
              availableModels={stt.availableModels}
              availableProviders={stt.availableProviders}
              filters={stt.filters}
              labels={stt.labels}
              isFetching={stt.isFetching}
              onModelChange={stt.setModelFilter}
              onProviderChange={stt.setProviderFilter}
              onRangeChange={llm.setRangeFilter}
            />
            <SttUsageSummaryCards rangeLabel={stt.labels.range} usageData={stt.usageData} />
            <SttUsageCostChart usageData={stt.usageData} />
          </TabsContent>

          <TabsContent value="embedding" className="mt-4 flex flex-col gap-4">
            <UsageDashboardFilters
              availableModels={embedding.availableModels}
              availableProviders={embedding.availableProviders}
              filters={embedding.filters}
              labels={embedding.labels}
              isFetching={embedding.isFetching}
              onModelChange={embedding.setModelFilter}
              onProviderChange={embedding.setProviderFilter}
              onRangeChange={llm.setRangeFilter}
            />
            <EmbeddingUsageSummaryCards
              rangeLabel={embedding.labels.range}
              usageData={embedding.usageData}
            />
            <EmbeddingUsageCostChart usageData={embedding.usageData} />
          </TabsContent>
        </Tabs>
      </PageContent>
    </Page>
  );
}
