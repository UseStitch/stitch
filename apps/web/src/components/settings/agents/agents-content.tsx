import * as React from 'react';

import { AgentEditor } from './agent-editor';
import { AgentsList } from './agents-list';
import type { AgentEditorMode } from './types';

function AgentsContent() {
  const [mode, setMode] = React.useState<AgentEditorMode | null>(null);

  if (mode) {
    return <AgentEditor mode={mode} onBack={() => setMode(null)} />;
  }

  return (
    <AgentsList
      onCreate={(agentType) => setMode({ type: 'create', agentType })}
      onEdit={(agent) => setMode({ type: 'edit', agent })}
    />
  );
}

export function AgentsSettings() {
  return (
    <React.Suspense fallback={<div className="text-sm text-muted-foreground">Loading...</div>}>
      <AgentsContent />
    </React.Suspense>
  );
}
