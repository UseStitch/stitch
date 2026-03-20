import * as React from 'react';

import { useSuspenseQuery } from '@tanstack/react-query';

import { PrefixedString } from '@stitch/shared/id';

import { agentsQueryOptions } from '@/lib/queries/agents';
import { settingsQueryOptions } from '@/lib/queries/settings';

type UseChatAgentResult = {
  selectedAgent: PrefixedString<'agt'> | null;
  handleAgentChange: (agentId: PrefixedString<'agt'> | null) => void;
};

type UseChatAgentInput = {
  lastUsedAgentId?: PrefixedString<'agt'> | null;
};

function resolvePrimaryAgentId(
  agentId: PrefixedString<'agt'> | null | undefined,
  primaryAgents: Array<{ id: PrefixedString<'agt'> }>,
): PrefixedString<'agt'> | null {
  if (!agentId) return null;
  return primaryAgents.some((agent) => agent.id === agentId) ? agentId : null;
}

export function useChatAgent(input?: UseChatAgentInput): UseChatAgentResult {
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);
  const { data: agents } = useSuspenseQuery(agentsQueryOptions);
  const [agentOverride, setAgentOverride] = React.useState<PrefixedString<'agt'> | null>(null);

  const primaryAgents = React.useMemo(() => {
    return agents.filter((agent) => agent.type === 'primary');
  }, [agents]);

  const firstPrimaryAgentId = React.useMemo(() => {
    return primaryAgents[0]?.id ?? null;
  }, [primaryAgents]);

  const selectedOverrideAgentId = React.useMemo(() => {
    return resolvePrimaryAgentId(agentOverride, primaryAgents);
  }, [agentOverride, primaryAgents]);

  const lastUsedPrimaryAgentId = React.useMemo(() => {
    return resolvePrimaryAgentId(input?.lastUsedAgentId, primaryAgents);
  }, [input?.lastUsedAgentId, primaryAgents]);

  const savedPrimaryAgentId = React.useMemo(() => {
    return resolvePrimaryAgentId(
      settings['agent.default'] as PrefixedString<'agt'> | undefined,
      primaryAgents,
    );
  }, [primaryAgents, settings]);

  const selectedAgent =
    selectedOverrideAgentId ?? lastUsedPrimaryAgentId ?? savedPrimaryAgentId ?? firstPrimaryAgentId;

  const handleAgentChange = (agentId: PrefixedString<'agt'> | null) => {
    setAgentOverride(agentId);
  };

  return { selectedAgent, handleAgentChange };
}
