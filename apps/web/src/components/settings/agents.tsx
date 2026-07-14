import * as React from 'react';

import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';

import { SETTINGS_PAGE_BY_ID } from '@/components/settings/settings-metadata';
import { SettingPage, SettingSection } from '@/components/settings/settings-ui';
import { Textarea } from '@/components/ui/textarea';
import { saveSettingMutationOptions, settingsQueryOptions } from '@/lib/queries/settings';

const SETTING_KEY = 'agents.customInstructions';

export function AgentsSettings() {
  const page = SETTINGS_PAGE_BY_ID.agents;
  const Icon = page.icon;
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);
  const queryClient = useQueryClient();
  const saveMutation = useMutation(
    saveSettingMutationOptions(SETTING_KEY, queryClient, { successMessage: 'Custom instructions saved' }),
  );
  const savedInstructions = settings[SETTING_KEY] ?? '';
  const [instructions, setInstructions] = React.useState(savedInstructions);

  React.useEffect(() => {
    setInstructions(savedInstructions);
  }, [savedInstructions]);

  const saveInstructions = () => {
    if (instructions !== savedInstructions) {
      saveMutation.mutate(instructions);
    }
  };

  return (
    <SettingPage title={page.title} description={page.description} icon={<Icon className="size-5" />}>
      <SettingSection
        title="Custom instructions"
        description="Write Markdown instructions that Stitch should follow in chat and agent sessions. Click outside textarea to save."
        className="flex min-h-0 flex-1 flex-col">
        <Textarea
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          onBlur={saveInstructions}
          placeholder="Example: Prefer concise answers. Ask one focused question when requirements are unclear."
          className="min-h-90 resize-y font-mono text-sm"
        />
      </SettingSection>
    </SettingPage>
  );
}
