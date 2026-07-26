import { toast } from 'sonner';

import { useForm, useStore } from '@tanstack/react-form';

import { MCP_AUTH_TYPES } from '@stitch/shared/mcp/types';

import { HeaderRows } from './header-rows';
import { OAuthFields } from './oauth-fields';
import { AUTH_TYPE_LABELS, type AddFormState, EMPTY_ADD_FORM, addMcpServerSchema, buildAuthConfig } from './shared';

import { SettingSubPage } from '@/components/settings/settings-ui';
import { Button } from '@/components/ui/button';
import { FieldError, fieldErrorMessage } from '@/components/ui/field-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getErrorMessage } from '@/lib/errors';
import { useAddMcpServer, useStartMcpAuth } from '@/lib/queries/mcp';

export function AddCustomMcpServer({ onBack }: { onBack: () => void }) {
  const addServer = useAddMcpServer();
  const startAuth = useStartMcpAuth();

  const form = useForm({
    defaultValues: EMPTY_ADD_FORM,
    validators: { onMount: addMcpServerSchema, onChange: addMcpServerSchema },
    onSubmit: async ({ value }) => {
      let id: string;
      try {
        ({ id } = await addServer.mutateAsync({
          name: value.name.trim(),
          transport: value.transport,
          url: value.url.trim(),
          authConfig: buildAuthConfig(value),
        }));
      } catch (error) {
        toast.error(getErrorMessage(error, 'Failed to add MCP server'), { id: 'mcp-add-error' });
        return;
      }

      toast.success('MCP server added', { id: 'mcp-add-success' });
      onBack();

      if (value.authType === 'oauth') {
        try {
          await startAuth.mutateAsync(id);
          toast.success('Authorization started - complete it in your browser', { id: 'mcp-add-auth' });
        } catch (error) {
          toast.error(getErrorMessage(error, 'MCP server added, but authorization failed to start'), {
            id: 'mcp-add-auth',
          });
        }
      }
    },
  });

  const values = useStore(form.store, (state) => state.values);
  const set = (key: 'oauthScopes' | 'oauthClientId' | 'oauthClientSecret', value: string) => {
    form.setFieldValue(key, value);
  };

  const isBusy = addServer.isPending || startAuth.isPending;

  return (
    <SettingSubPage
      title="Add Custom MCP Server"
      description="Connect a remote MCP server manually."
      onBack={onBack}
      backLabel="Back to MCP servers">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}>
        <div className="grid grid-cols-2 gap-4">
          <form.Field name="name">
            {(field) => (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Name</Label>
                <Input
                  value={field.state.value}
                  placeholder="e.g. GitHub MCP"
                  aria-invalid={!!fieldErrorMessage(field.state.meta)}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
                <FieldError meta={field.state.meta} />
              </div>
            )}
          </form.Field>

          <form.Field name="authType">
            {(field) => (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Authentication</Label>
                <Select
                  value={field.state.value}
                  onValueChange={(value) => field.handleChange(value as AddFormState['authType'])}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{AUTH_TYPE_LABELS[field.state.value].label}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {MCP_AUTH_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {AUTH_TYPE_LABELS[type].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </form.Field>
        </div>

        <form.Field name="url">
          {(field) => (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">URL</Label>
              <Input
                value={field.state.value}
                placeholder="https://mcp.example.com"
                type="url"
                aria-invalid={!!fieldErrorMessage(field.state.meta)}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
              <FieldError meta={field.state.meta} />
            </div>
          )}
        </form.Field>

        {values.authType === 'api_key' && (
          <form.Field name="apiKey">
            {(field) => (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">API Key</Label>
                <Input
                  value={field.state.value}
                  placeholder="sk-..."
                  type="password"
                  aria-invalid={!!fieldErrorMessage(field.state.meta)}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
                <FieldError meta={field.state.meta} />
              </div>
            )}
          </form.Field>
        )}

        {values.authType === 'headers' && (
          <form.Field name="headers">
            {(field) => (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Headers</Label>
                <HeaderRows rows={field.state.value} onChange={field.handleChange} />
                <FieldError meta={field.state.meta} />
              </div>
            )}
          </form.Field>
        )}

        {values.authType === 'oauth' && <OAuthFields form={values} set={set} />}

        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onBack} disabled={isBusy || isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isBusy || isSubmitting}>
                {isBusy ? 'Adding...' : 'Add server'}
              </Button>
            </div>
          )}
        </form.Subscribe>
      </form>
    </SettingSubPage>
  );
}
