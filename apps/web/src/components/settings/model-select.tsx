import { useMutation, useQueryClient } from '@tanstack/react-query';

import { ModelCombobox, type ModelSelection } from '@/components/model-selectors/model-combobox';
import type { ProviderModels } from '@/lib/queries/providers';
import { deleteSettingMutationOptions, saveSettingMutationOptions } from '@/lib/queries/settings';

type SettingsModelSelectProps = {
  providerIdKey: string;
  modelIdKey: string;
  currentProviderId: string | undefined;
  currentModelId: string | undefined;
  providerModels: ProviderModels[];
  placeholder?: string;
  showClear?: boolean;
};

export function SettingsModelSelect({
  providerIdKey,
  modelIdKey,
  currentProviderId,
  currentModelId,
  providerModels,
  placeholder,
  showClear,
}: SettingsModelSelectProps) {
  const queryClient = useQueryClient();

  const saveProviderMutation = useMutation(
    saveSettingMutationOptions(providerIdKey, queryClient, { successMessage: 'Model preference saved' }),
  );
  const saveModelMutation = useMutation(saveSettingMutationOptions(modelIdKey, queryClient, { silent: true }));
  const deleteProviderMutation = useMutation(
    deleteSettingMutationOptions(providerIdKey, queryClient, { successMessage: 'Model preference reset' }),
  );
  const deleteModelMutation = useMutation(deleteSettingMutationOptions(modelIdKey, queryClient, { silent: true }));

  const value: ModelSelection | null =
    currentProviderId && currentModelId ? { providerId: currentProviderId, modelId: currentModelId } : null;

  function handleValueChange(selection: ModelSelection | null) {
    if (!selection) {
      if (currentProviderId) deleteProviderMutation.mutate();
      if (currentModelId) deleteModelMutation.mutate();
      return;
    }
    saveProviderMutation.mutate(selection.providerId);
    saveModelMutation.mutate(selection.modelId);
  }

  return (
    <ModelCombobox
      providerModels={providerModels}
      value={value}
      onValueChange={handleValueChange}
      placeholder={placeholder}
      showClear={showClear}
    />
  );
}
