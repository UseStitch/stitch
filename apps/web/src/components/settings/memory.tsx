import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';

import { SETTINGS_PAGE_BY_ID } from '@/components/settings/settings-metadata';
import {
  NumberSettingRow,
  SettingPage,
  SettingRow,
  SettingRows,
  SettingSection,
  SwitchSettingRow,
} from '@/components/settings/settings-ui';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { saveSettingMutationOptions, settingsQueryOptions } from '@/lib/queries/settings';

function MemoryToggles() {
  const queryClient = useQueryClient();
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);
  const saveEnabled = useMutation(saveSettingMutationOptions('memory.enabled', queryClient, { silent: true }));
  const saveAutoExtract = useMutation(saveSettingMutationOptions('memory.autoExtract', queryClient, { silent: true }));
  const enabled = settings['memory.enabled'] !== 'false';

  return (
    <SettingRows>
      <SettingRow
        label="Enable Memory"
        description="Load curated local Markdown into conversations and make memory tools available"
        htmlFor="memory-enabled-toggle">
        <Switch
          id="memory-enabled-toggle"
          checked={enabled}
          onCheckedChange={(checked) => saveEnabled.mutate(checked ? 'true' : 'false')}
        />
      </SettingRow>
      <SettingRow
        label="Auto-capture candidates"
        description="Extract explicit durable user claims into dated daily notes after responses"
        htmlFor="memory-auto-extract-toggle">
        <Switch
          id="memory-auto-extract-toggle"
          checked={settings['memory.autoExtract'] !== 'false'}
          disabled={!enabled}
          onCheckedChange={(checked) => saveAutoExtract.mutate(checked ? 'true' : 'false')}
        />
      </SettingRow>
    </SettingRows>
  );
}

function CaptureSettings() {
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);
  return (
    <SettingRows>
      <NumberSettingRow
        settingKey="memory.extraction.maxFactsPerTurn"
        label="Candidates per turn"
        description="Maximum durable candidates captured from one response."
        currentValue={settings['memory.extraction.maxFactsPerTurn']}
        min={1}
        max={10}
      />
      <NumberSettingRow
        settingKey="memory.extraction.minMessageLength"
        label="Minimum message length"
        description="Skip automatic capture for shorter user messages."
        currentValue={settings['memory.extraction.minMessageLength']}
        min={0}
        max={500}
      />
      <NumberSettingRow
        settingKey="memory.extraction.maxFactsPerSession"
        label="Candidates per session"
        description="Maximum automatic candidates captured in one session."
        currentValue={settings['memory.extraction.maxFactsPerSession']}
        min={1}
        max={200}
      />
      <NumberSettingRow
        settingKey="memory.extraction.minTurnsBetweenWrites"
        label="Turns between writes"
        description="Minimum user turns between automatic daily-note writes."
        currentValue={settings['memory.extraction.minTurnsBetweenWrites']}
        min={0}
        max={20}
      />
      <SwitchSettingRow
        settingKey="memory.extraction.fromAutomations"
        label="Capture from automations"
        description="Allow automation sessions to write daily candidates. Automation candidates are not automatically promoted."
        checked={settings['memory.extraction.fromAutomations'] === 'true'}
      />
    </SettingRows>
  );
}

function CurationSettings() {
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);
  return (
    <SettingRows>
      <NumberSettingRow
        settingKey="memory.curated.memoryCharLimit"
        label="Long-term character limit"
        description="Maximum model-visible characters in MEMORY.md."
        currentValue={settings['memory.curated.memoryCharLimit']}
        min={1000}
        max={50000}
      />
      <NumberSettingRow
        settingKey="memory.curated.userCharLimit"
        label="Profile character limit"
        description="Maximum model-visible characters in USER.md."
        currentValue={settings['memory.curated.userCharLimit']}
        min={500}
        max={25000}
      />
      <SwitchSettingRow
        settingKey="memory.consolidation.enabled"
        label="Scheduled consolidation"
        description="Review changed daily notes every six hours and curate eligible candidates."
        checked={settings['memory.consolidation.enabled'] !== 'false'}
      />
      <NumberSettingRow
        settingKey="memory.consolidation.maxCandidatesPerRun"
        label="Candidates per consolidation"
        description="Maximum candidates reviewed in one bounded curation pass."
        currentValue={settings['memory.consolidation.maxCandidatesPerRun']}
        min={1}
        max={200}
      />
    </SettingRows>
  );
}

export function MemorySettings() {
  const page = SETTINGS_PAGE_BY_ID.memory;
  const Icon = page.icon;
  return (
    <SettingPage title={page.title} description={page.description} icon={<Icon className="size-5" />}>
      <Tabs defaultValue="general" className="space-y-space-xl">
        <TabsList variant="line">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="capture">Capture</TabsTrigger>
          <TabsTrigger value="curation">Curation</TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <SettingSection className="mt-space-none">
            <MemoryToggles />
          </SettingSection>
        </TabsContent>
        <TabsContent value="capture">
          <SettingSection className="mt-space-none">
            <CaptureSettings />
          </SettingSection>
        </TabsContent>
        <TabsContent value="curation">
          <SettingSection className="mt-space-none">
            <CurationSettings />
          </SettingSection>
        </TabsContent>
      </Tabs>
    </SettingPage>
  );
}
