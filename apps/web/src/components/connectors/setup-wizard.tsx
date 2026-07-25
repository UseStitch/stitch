import { ExternalLinkIcon, CheckIcon, ArrowRightIcon, ArrowLeftIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { useForm, useStore } from '@tanstack/react-form';

import type {
  ConnectorDefinition,
  OAuthConfig,
  ApiKeyConfig,
  ConnectorSafe,
  ConnectorSetupInstruction,
} from '@stitch/shared/connectors/types';

import { ConnectorIcon } from '@/components/connectors/connector-icon';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { FieldError, fieldErrorMessage } from '@/components/ui/field-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { getErrorMessage } from '@/lib/errors';
import {
  useCreateOAuthConnectorCredentials,
  useCreateOAuthConnectorAccount,
  useCreateApiKeyConnector,
  useAuthorizeConnector,
} from '@/lib/queries/connectors';

type Props = { definition: ConnectorDefinition; connectors: ConnectorSafe[]; onClose: () => void };

type WizardStep = 'instructions' | 'connector' | 'account' | 'scopes' | 'authorizing' | 'done';

type CredentialValues = { selectedConnectorRefId: string; clientId: string; clientSecret: string; apiKey: string };

type ScopeValues = { selectedScopes: string[]; serviceAccess: Record<string, 'none' | 'read' | 'write'> };

type OAuthProgress = { credentials: CredentialValues; connectorRefId?: string; instanceId?: string };

function credentialsSchema(isOAuth: boolean, keyLabel: string) {
  return z
    .object({ selectedConnectorRefId: z.string(), clientId: z.string(), clientSecret: z.string(), apiKey: z.string() })
    .superRefine((value, context) => {
      if (!isOAuth) {
        if (!value.apiKey.trim())
          context.addIssue({ code: 'custom', message: `${keyLabel} is required`, path: ['apiKey'] });
        return;
      }
      if (value.selectedConnectorRefId !== 'new') return;
      if (!value.clientId.trim()) {
        context.addIssue({ code: 'custom', message: 'Client ID is required', path: ['clientId'] });
      }
      if (!value.clientSecret.trim()) {
        context.addIssue({ code: 'custom', message: 'Client Secret is required', path: ['clientSecret'] });
      }
    });
}

function getInitialServiceAccess(
  options: OAuthConfig['serviceAccessOptions'],
  selectedScopes: string[],
): Record<string, 'none' | 'read' | 'write'> {
  if (!options) return {};
  return Object.fromEntries(
    options.map((option) => {
      const hasWrite = (option.writeScopes ?? []).some((scope) => selectedScopes.includes(scope));
      const hasRead = option.readScopes.some((scope) => selectedScopes.includes(scope));
      return [option.id, hasWrite ? 'write' : hasRead ? 'read' : 'none'];
    }),
  ) as Record<string, 'none' | 'read' | 'write'>;
}

export function SetupWizard({ definition, connectors, onClose }: Props) {
  const [step, setStep] = useState<WizardStep>('instructions');
  const [label, setLabel] = useState('');
  const [setupError, setSetupError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<CredentialValues>({
    selectedConnectorRefId: connectors[0]?.id ?? 'new',
    clientId: '',
    clientSecret: '',
    apiKey: '',
  });

  const createOAuthCredentials = useCreateOAuthConnectorCredentials();
  const createOAuthAccount = useCreateOAuthConnectorAccount();
  const createApiKey = useCreateApiKeyConnector();
  const authorize = useAuthorizeConnector();

  const isOAuth = definition.authType === 'oauth2';
  const oauthConfig = isOAuth ? (definition.authConfig as OAuthConfig) : null;
  const apiKeyConfig = !isOAuth ? (definition.authConfig as ApiKeyConfig) : null;
  const defaultScopes = oauthConfig?.defaultScopes ?? [];
  const [scopeValues, setScopeValues] = useState<ScopeValues>(() => ({
    selectedScopes: defaultScopes,
    serviceAccess: getInitialServiceAccess(oauthConfig?.serviceAccessOptions, defaultScopes),
  }));
  const oauthProgressRef = useRef<OAuthProgress | null>(null);

  async function handleCreateAndAuthorize(values: CredentialValues, accountLabel: string, scopes: string[] = []) {
    if (isOAuth) {
      const progress = oauthProgressRef.current ?? { credentials: values };
      oauthProgressRef.current = progress;
      setSetupError(null);
      setStep('authorizing');

      try {
        if (!progress.connectorRefId && values.selectedConnectorRefId === 'new') {
          const connector = await createOAuthCredentials.mutateAsync({
            connectorId: definition.id,
            label: accountLabel.trim() || definition.name,
            clientId: values.clientId.trim(),
            clientSecret: values.clientSecret.trim(),
          });
          progress.connectorRefId = connector.id;
        }
        progress.connectorRefId ??= values.selectedConnectorRefId;

        if (!progress.instanceId) {
          const instance = await createOAuthAccount.mutateAsync({
            connectorRefId: progress.connectorRefId,
            label: accountLabel.trim() || definition.name,
            scopes,
          });
          progress.instanceId = instance.id;
        }

        const { authUrl } = await authorize.mutateAsync(progress.instanceId);
        void (window.api?.shell?.openExternal(authUrl) ?? window.open(authUrl, '_blank'));
        setStep('done');
      } catch (e) {
        const fallback = !progress.connectorRefId
          ? 'Failed to create connector credentials'
          : !progress.instanceId
            ? 'Failed to create connector account'
            : 'Failed to start authorization';
        const message = getErrorMessage(e, fallback);
        toast.error(message, { id: 'connector-setup-create' });

        if (!progress.connectorRefId) setStep('connector');
        else if (!progress.instanceId) setStep('scopes');
        else setSetupError(message);
      }
    } else {
      setStep('authorizing');

      try {
        await createApiKey.mutateAsync({
          connectorId: definition.id,
          label: accountLabel.trim() || definition.name,
          apiKey: values.apiKey.trim(),
        });

        setStep('done');
        toast.success('Connector created successfully', { id: 'connector-setup-create' });
      } catch (e) {
        toast.error(getErrorMessage(e, 'Failed to create connector'), { id: 'connector-setup-create' });
        setStep('connector');
      }
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90vh] min-h-0 w-[min(56rem,calc(100vw-2rem))] flex-col overflow-hidden sm:max-w-4xl">
        <DialogHeader className="shrink-0">
          <div className="flex items-center gap-2">
            <ConnectorIcon icon={definition.icon} className="size-7 rounded-md" />
            <DialogTitle>Connect {definition.name}</DialogTitle>
          </div>
          <WizardProgress step={step} isOAuth={isOAuth} />
          <DialogDescription>
            {step === 'instructions' && 'Follow these steps to set up your credentials.'}
            {step === 'connector' && 'Choose or create connector credentials.'}
            {step === 'account' && 'Name the account connection.'}
            {step === 'scopes' && 'Choose which permissions to grant.'}
            {step === 'authorizing' && 'Setting up your connection...'}
            {step === 'done' &&
              (isOAuth ? 'Complete the authorization in your browser.' : 'Your connector is now connected.')}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1">
          {step === 'instructions' && (
            <InstructionsStep instructions={definition.setupInstructions} onNext={() => setStep('connector')} />
          )}

          {step === 'connector' && (
            <ConnectorCredentialsStep
              isOAuth={isOAuth}
              connectors={connectors}
              initialValues={credentials}
              apiKeyConfig={apiKeyConfig}
              onBack={(values) => {
                setCredentials(values);
                setStep('instructions');
              }}
              onNext={(values) => {
                setCredentials(values);
                if (isOAuth && oauthConfig) {
                  const previousValues = oauthProgressRef.current?.credentials;
                  if (
                    !previousValues ||
                    previousValues.selectedConnectorRefId !== values.selectedConnectorRefId ||
                    previousValues.clientId !== values.clientId ||
                    previousValues.clientSecret !== values.clientSecret
                  ) {
                    oauthProgressRef.current = { credentials: values };
                  }
                  setStep('account');
                } else {
                  void handleCreateAndAuthorize(values, label);
                }
              }}
            />
          )}

          {step === 'account' && (
            <ConnectorAccountStep
              label={label}
              definitionName={definition.name}
              onBack={(value) => {
                setLabel(value);
                setStep('connector');
              }}
              onNext={(value) => {
                setLabel(value);
                setStep('scopes');
              }}
            />
          )}

          {step === 'scopes' && oauthConfig && (
            <ScopesStep
              config={oauthConfig}
              initialValues={scopeValues}
              onBack={(values) => {
                setScopeValues(values);
                setStep('account');
              }}
              onNext={(values) => {
                setScopeValues(values);
                void handleCreateAndAuthorize(credentials, label, values.selectedScopes);
              }}
            />
          )}

          {step === 'authorizing' && (
            <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 py-6">
              {setupError ? (
                <>
                  <p className="text-sm font-medium text-destructive">Authorization could not be started</p>
                  <p className="max-w-md text-center text-xs text-muted-foreground">{setupError}</p>
                  <Button
                    type="button"
                    onClick={() => void handleCreateAndAuthorize(credentials, label, scopeValues.selectedScopes)}>
                    Retry Authorization
                  </Button>
                </>
              ) : (
                <>
                  <Spinner size="lg" className="text-primary" />
                  <p className="text-sm text-muted-foreground">Setting up connection...</p>
                </>
              )}
            </div>
          )}

          {step === 'done' && (
            <div className="flex h-full min-h-0 flex-col items-center gap-3 overflow-y-auto py-6">
              <div className="flex size-12 items-center justify-center rounded-full bg-success/10 text-success">
                <CheckIcon className="size-6" />
              </div>
              {isOAuth ? (
                <>
                  <p className="text-sm font-medium">Authorization started</p>
                  <p className="text-center text-xs text-muted-foreground">
                    A browser window has opened for you to authorize access. Once you approve, the connector will be
                    ready to use. You can close this dialog.
                  </p>
                </>
              ) : (
                <p className="text-sm font-medium">Connector connected</p>
              )}
              <DialogFooter className="w-full shrink-0">
                <Button onClick={onClose}>Done</Button>
              </DialogFooter>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InstructionsStep({ instructions, onNext }: { instructions: ConnectorSetupInstruction[]; onNext: () => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <ScrollArea className="max-h-[45vh] min-h-0 flex-1 rounded-lg border border-border/60 bg-muted/30 p-3">
        <ol className="list-inside list-decimal space-y-2 text-sm text-foreground/85">
          {instructions.map((instruction) => {
            const href = instruction.href;
            return (
              <li key={instruction.text} className="leading-relaxed">
                <span>{instruction.text}</span>
                {href ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="ml-1 h-auto gap-1 p-0 font-normal text-primary hover:bg-transparent hover:underline"
                    onClick={() => {
                      void (window.api?.shell?.openExternal(href) ?? window.open(href, '_blank'));
                    }}>
                    {instruction.hrefLabel ?? 'Open'}
                    <ExternalLinkIcon className="size-3" />
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ol>
      </ScrollArea>
      <DialogFooter className="shrink-0">
        <Button onClick={onNext}>
          I have my credentials
          <ArrowRightIcon className="size-3.5" />
        </Button>
      </DialogFooter>
    </div>
  );
}

function ConnectorCredentialsStep({
  isOAuth,
  connectors,
  initialValues,
  apiKeyConfig,
  onBack,
  onNext,
}: {
  isOAuth: boolean;
  connectors: ConnectorSafe[];
  initialValues: CredentialValues;
  apiKeyConfig: ApiKeyConfig | null;
  onBack: (values: CredentialValues) => void;
  onNext: (values: CredentialValues) => void;
}) {
  const helpUrl = apiKeyConfig?.helpUrl;
  const form = useForm({
    defaultValues: initialValues,
    validators: {
      onMount: credentialsSchema(isOAuth, apiKeyConfig?.keyLabel ?? 'API Key'),
      onChange: credentialsSchema(isOAuth, apiKeyConfig?.keyLabel ?? 'API Key'),
    },
    onSubmit: ({ value }) => onNext(value),
  });
  const values = useStore(form.store, (state) => state.values);
  const isCreatingConnector = values.selectedConnectorRefId === 'new';

  return (
    <form
      className="flex h-full min-h-0 flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {isOAuth ? (
          <>
            <form.Field name="selectedConnectorRefId">
              {(field) => (
                <div className="space-y-1.5">
                  <Label>Connector Credentials</Label>
                  <Select value={field.state.value} onValueChange={(value) => field.handleChange(value ?? 'new')}>
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {isCreatingConnector
                          ? 'Create new connector credentials'
                          : connectors.find((connector) => connector.id === field.state.value)?.label}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {connectors.map((connector) => (
                        <SelectItem key={connector.id} value={connector.id}>
                          {connector.label}
                        </SelectItem>
                      ))}
                      <SelectItem value="new">Create new connector credentials</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </form.Field>
            {isCreatingConnector ? (
              <>
                <form.Field name="clientId">
                  {(field) => (
                    <div className="space-y-1.5">
                      <Label htmlFor="clientId">Client ID</Label>
                      <Input
                        id="clientId"
                        placeholder="Your OAuth Client ID"
                        value={field.state.value}
                        aria-invalid={!!fieldErrorMessage(field.state.meta)}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                      />
                      <FieldError meta={field.state.meta} />
                    </div>
                  )}
                </form.Field>
                <form.Field name="clientSecret">
                  {(field) => (
                    <div className="space-y-1.5">
                      <Label htmlFor="clientSecret">Client Secret</Label>
                      <Input
                        id="clientSecret"
                        type="password"
                        placeholder="Your OAuth Client Secret"
                        value={field.state.value}
                        aria-invalid={!!fieldErrorMessage(field.state.meta)}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                      />
                      <FieldError meta={field.state.meta} />
                    </div>
                  )}
                </form.Field>
              </>
            ) : null}
          </>
        ) : (
          <form.Field name="apiKey">
            {(field) => (
              <div className="space-y-1.5">
                <Label htmlFor="apiKey">{apiKeyConfig?.keyLabel ?? 'API Key'}</Label>
                <Input
                  id="apiKey"
                  type="password"
                  placeholder={apiKeyConfig?.placeholder ?? 'Your API Key'}
                  value={field.state.value}
                  aria-invalid={!!fieldErrorMessage(field.state.meta)}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
                <FieldError meta={field.state.meta} />
                {helpUrl && (
                  <a
                    href={helpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    onClick={(event) => {
                      event.preventDefault();
                      void (window.api?.shell?.openExternal(helpUrl) ?? window.open(helpUrl, '_blank'));
                    }}>
                    <ExternalLinkIcon className="size-3" />
                    Get your API key
                  </a>
                )}
              </div>
            )}
          </form.Field>
        )}
      </div>
      <DialogFooter className="shrink-0">
        <Button type="button" variant="outline" onClick={() => onBack(values)}>
          <ArrowLeftIcon className="size-3.5" />
          Back
        </Button>
        <Button type="submit">
          {isOAuth ? 'Continue' : 'Connect'}
          <ArrowRightIcon className="size-3.5" />
        </Button>
      </DialogFooter>
    </form>
  );
}

function ConnectorAccountStep({
  label,
  definitionName,
  onBack,
  onNext,
}: {
  label: string;
  definitionName: string;
  onBack: (label: string) => void;
  onNext: (label: string) => void;
}) {
  const [value, setValue] = useState(label);

  return (
    <form
      className="flex h-full min-h-0 flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onNext(value);
      }}>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        <div className="space-y-1.5">
          <Label htmlFor="label">Account Label</Label>
          <Input
            id="label"
            placeholder={`e.g. Work ${definitionName}, Personal ${definitionName}`}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </div>
      </div>
      <DialogFooter className="shrink-0">
        <Button type="button" variant="outline" onClick={() => onBack(value)}>
          <ArrowLeftIcon className="size-3.5" />
          Back
        </Button>
        <Button type="submit">
          Choose Scopes
          <ArrowRightIcon className="size-3.5" />
        </Button>
      </DialogFooter>
    </form>
  );
}

function buildEnableApisUrl(scopeApiMap: Record<string, string> | undefined, selectedScopes: string[]): string | null {
  if (!scopeApiMap) return null;
  const apiIds = [...new Set(selectedScopes.map((s) => scopeApiMap[s]).filter(Boolean))];
  if (apiIds.length === 0) return null;
  return `https://console.cloud.google.com/flows/enableapi?apiid=${apiIds.join(',')}`;
}

function getComputedScopes(config: OAuthConfig, values: ScopeValues): string[] {
  const options = config.serviceAccessOptions;
  if (!options || options.length === 0) return values.selectedScopes;

  const serviceScopeSet = new Set<string>();
  for (const option of options) {
    for (const scope of option.readScopes) serviceScopeSet.add(scope);
    for (const scope of option.writeScopes ?? []) serviceScopeSet.add(scope);
  }

  const scopes = config.defaultScopes.filter((scope) => !serviceScopeSet.has(scope));
  for (const option of options) {
    const access = values.serviceAccess[option.id] ?? 'none';
    if (access === 'read' || access === 'write') scopes.push(...option.readScopes);
    if (access === 'write') scopes.push(...(option.writeScopes ?? []));
  }
  return [...new Set(scopes)];
}

function scopesSchema(config: OAuthConfig) {
  return z
    .object({
      selectedScopes: z.array(z.string()),
      serviceAccess: z.record(z.string(), z.enum(['none', 'read', 'write'])),
    })
    .refine((values) => getComputedScopes(config, values).length > 0, {
      message: 'Select at least one scope',
      path: ['selectedScopes'],
    });
}

function ScopesStep({
  config,
  initialValues,
  onBack,
  onNext,
}: {
  config: OAuthConfig;
  initialValues: ScopeValues;
  onBack: (values: ScopeValues) => void;
  onNext: (values: ScopeValues) => void;
}) {
  const form = useForm({
    defaultValues: initialValues,
    validators: { onMount: scopesSchema(config), onChange: scopesSchema(config) },
    onSubmit: ({ value }) => onNext({ ...value, selectedScopes: getComputedScopes(config, value) }),
  });
  const values = useStore(form.store, (state) => state.values);
  const { selectedScopes, serviceAccess } = values;
  const computedScopes = getComputedScopes(config, values);

  const enableApisUrl = buildEnableApisUrl(config.scopeApiMap, computedScopes);

  return (
    <form
      className="flex h-full min-h-0 flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {enableApisUrl && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p className="mb-1.5 text-xs font-medium text-foreground">
              Before connecting, enable the APIs for the services you select below:
            </p>
            <Button
              type="button"
              variant="ghost"
              className="h-auto gap-1.5 p-0 text-primary hover:bg-transparent hover:underline"
              onClick={() => {
                void (window.api?.shell?.openExternal(enableApisUrl) ?? window.open(enableApisUrl, '_blank'));
              }}>
              <ExternalLinkIcon className="size-3.5" />
              Enable required Google APIs in Cloud Console
            </Button>
          </div>
        )}
        {config.serviceAccessOptions && config.serviceAccessOptions.length > 0 ? (
          <div className="space-y-3">
            {config.serviceAccessOptions.map((option) => {
              const value = serviceAccess[option.id] ?? 'none';
              return (
                <div key={option.id} className="rounded-lg border border-border/60 p-3">
                  <p className="text-sm font-medium">{option.label}</p>
                  {option.description ? <p className="text-xs text-muted-foreground">{option.description}</p> : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={value === 'none' ? 'default' : 'outline'}
                      onClick={() => form.setFieldValue('serviceAccess', { ...serviceAccess, [option.id]: 'none' })}>
                      Off
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={value === 'read' ? 'default' : 'outline'}
                      onClick={() => form.setFieldValue('serviceAccess', { ...serviceAccess, [option.id]: 'read' })}>
                      Read
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={value === 'write' ? 'default' : 'outline'}
                      onClick={() => form.setFieldValue('serviceAccess', { ...serviceAccess, [option.id]: 'write' })}>
                      Read + Write
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <ScrollArea className="max-h-[42vh] min-h-0">
            <div className="space-y-1.5">
              {Object.entries(config.scopeDescriptions).map(([scope, description]) => (
                <label
                  key={scope}
                  htmlFor={scope}
                  className="flex cursor-pointer items-start gap-2.5 rounded-lg p-2 text-sm hover:bg-muted/50">
                  <Checkbox
                    id={scope}
                    checked={selectedScopes.includes(scope)}
                    onCheckedChange={() =>
                      form.setFieldValue(
                        'selectedScopes',
                        selectedScopes.includes(scope)
                          ? selectedScopes.filter((selectedScope) => selectedScope !== scope)
                          : [...selectedScopes, scope],
                      )
                    }
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium">{description}</p>
                    <p className="truncate text-2xs text-muted-foreground">{scope}</p>
                  </div>
                </label>
              ))}
            </div>
          </ScrollArea>
        )}
        <form.Field name="selectedScopes">{(field) => <FieldError meta={field.state.meta} />}</form.Field>
      </div>
      <DialogFooter className="shrink-0">
        <Button type="button" variant="outline" onClick={() => onBack(values)}>
          <ArrowLeftIcon className="size-3.5" />
          Back
        </Button>
        <Button type="submit">
          Connect & Authorize
          <ExternalLinkIcon className="size-3.5" />
        </Button>
      </DialogFooter>
    </form>
  );
}

function WizardProgress({ step, isOAuth }: { step: WizardStep; isOAuth: boolean }) {
  const steps: Array<{ id: WizardStep; label: string }> = isOAuth
    ? [
        { id: 'instructions', label: 'Instructions' },
        { id: 'connector', label: 'Connector' },
        { id: 'account', label: 'Account' },
        { id: 'scopes', label: 'Access' },
        { id: 'authorizing', label: 'Authorize' },
        { id: 'done', label: 'Done' },
      ]
    : [
        { id: 'instructions', label: 'Instructions' },
        { id: 'connector', label: 'Connector' },
        { id: 'authorizing', label: 'Connect' },
        { id: 'done', label: 'Done' },
      ];

  const activeIndex = steps.findIndex((item) => item.id === step);

  return (
    <div className={`mt-2 grid gap-2 ${isOAuth ? 'grid-cols-2 sm:grid-cols-6' : 'grid-cols-2 sm:grid-cols-4'}`}>
      {steps.map((item, index) => (
        <div
          key={item.id}
          className={[
            'rounded-md border px-2 py-1 text-center text-2xs',
            index <= activeIndex
              ? 'border-primary/30 bg-primary/10 text-foreground'
              : 'border-border/60 bg-muted/20 text-muted-foreground',
          ].join(' ')}>
          {item.label}
        </div>
      ))}
    </div>
  );
}
