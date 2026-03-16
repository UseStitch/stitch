import * as React from 'react';

import { useSuspenseQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { PrefixedString } from '@openwork/shared';

import { agentsQueryOptions } from '@/lib/queries/agents';
import { settingsQueryOptions, saveSettingMutationOptions } from '@/lib/queries/settings';

type UseChatAgentResult = {
  selectedAgent: PrefixedString<'agt'> | null;
  handleAgentChange: (agentId: PrefixedString<'agt'> | null) => void;
};

export function useChatAgent(): UseChatAgentResult {
  const queryClient = useQueryClient();
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);
  const { data: agents } = useSuspenseQuery(agentsQueryOptions);

  const [agentOverride, setAgentOverride] = React.useState<PrefixedString<'agt'> | null>(null);

  const firstPrimaryAgentId = React.useMemo(() => {
    return agents.find((a) => a.type === 'primary')?.id ?? null;
  }, [agents]);

  const savedPrimaryAgentId = React.useMemo(() => {
    const saved = settings['agent.default'];
    if (!saved) return null;
    const agent = agents.find((a) => a.id === saved);
    if (!agent || agent.type !== 'primary') return null;
    return agent.id;
  }, [agents, settings]);

  const selectedAgent = (agentOverride ??
    savedPrimaryAgentId ??
    firstPrimaryAgentId) as PrefixedString<'agt'> | null;

  const saveDefaultAgent = useMutation(
    saveSettingMutationOptions('agent.default', queryClient, { silent: true }),
  );

  const handleAgentChange = (agentId: PrefixedString<'agt'> | null) => {
    setAgentOverride(agentId);
    if (agentId) saveDefaultAgent.mutate(agentId);
  };

  return { selectedAgent, handleAgentChange };
}
