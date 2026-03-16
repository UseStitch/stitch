import * as React from 'react';

import { useSuspenseQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { settingsQueryOptions, saveSettingMutationOptions } from '@/lib/queries/settings';
import { agentsQueryOptions } from '@/lib/queries/agents';
import { PrefixedString } from '@openwork/shared';

type UseChatAgentResult = {
  selectedAgent: PrefixedString<'agt'> | null;
  handleAgentChange: (agentId: PrefixedString<'agt'> | null) => void;
};

export function useChatAgent(): UseChatAgentResult {
  const queryClient = useQueryClient();
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);
  const { data: agents } = useSuspenseQuery(agentsQueryOptions);
  
  const [agentOverride, setAgentOverride] = React.useState<PrefixedString<'agt'> | null>(null);

  const defaultAgentId = React.useMemo(() => {
    return agents.find(a => a.isDefault)?.id ?? null;
  }, [agents]);

  const selectedAgent = (agentOverride ?? settings['agent.default'] ?? defaultAgentId) as PrefixedString<'agt'> | null;

  const saveDefaultAgent = useMutation(
    saveSettingMutationOptions('agent.default', queryClient, { silent: true }),
  );

  const handleAgentChange = (agentId: PrefixedString<'agt'> | null) => {
    setAgentOverride(agentId);
    if (agentId) saveDefaultAgent.mutate(agentId);
  };

  return { selectedAgent, handleAgentChange };
}
