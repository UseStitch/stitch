import {
  ExternalLinkIcon,
  CheckIcon,
  Loader2Icon,
  ArrowRightIcon,
  ArrowLeftIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import type {
  ConnectorDefinition,
  OAuthConfig,
  ApiKeyConfig,
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useCreateOAuthConnector,
  useCreateApiKeyConnector,
  useAuthorizeConnector,
} from '@/lib/queries/connectors';

type Props = {
  definition: ConnectorDefinition;
  onClose: () => void;
};

type WizardStep = 'instructions' | 'credentials' | 'scopes' | 'authorizing' | 'done';

export function SetupWizard({ definition, onClose }: Props) {
  const [step, setStep] = useState<WizardStep>('instructions');
  const [label, setLabel] = useState('');

  // OAuth fields
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>(
    definition.authType === 'oauth2' ? (definition.authConfig as OAuthConfig).defaultScopes : [],
  );

  // API key fields
  const [apiKey, setApiKey] = useState('');

  const createOAuth = useCreateOAuthConnector();
  const createApiKey = useCreateApiKeyConnector();
  const authorize = useAuthorizeConnector();

  const isOAuth = definition.authType === 'oauth2';
  const oauthConfig = isOAuth ? (definition.authConfig as OAuthConfig) : null;
  const apiKeyConfig = !isOAuth ? (definition.authConfig as ApiKeyConfig) : null;

  const initialServiceAccess = useMemo(() => {
    if (!oauthConfig?.serviceAccessOptions) return {} as Record<string, 'none' | 'read' | 'write'>;
    return Object.fromEntries(
      oauthConfig.serviceAccessOptions.map((option) => {
        const hasWrite = (option.writeScopes ?? []).some((scope) => selectedScopes.includes(scope));
        const hasRead = option.readScopes.some((scope) => selectedScopes.includes(scope));
        return [option.id, hasWrite ? 'write' : hasRead ? 'read' : 'none'];
      }),
    ) as Record<string, 'none' | 'read' | 'write'>;
  }, [oauthConfig?.serviceAccessOptions, selectedScopes]);
  const [serviceAccess, setServiceAccess] =
    useState<Record<string, 'none' | 'read' | 'write'>>(initialServiceAccess);

  function toggleScope(scope: string) {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  }

  async function handleCreateAndAuthorize(scopesOverride?: string[]) {
    if (isOAuth) {
      const scopesToUse = scopesOverride ?? selectedScopes;
      if (scopesToUse.length === 0) {
        toast.error('Select at least one scope');
        return;
      }

      setStep('authorizing');

      try {
        if (!clientId.trim() || !clientSecret.trim()) {
          toast.error('Client ID and Client Secret are required');
          setStep('credentials');
          return;
        }

        const instance = await createOAuth.mutateAsync({
          connectorId: definition.id,
          label: label.trim() || definition.name,
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
          scopes: scopesToUse,
        });

        const { authUrl } = await authorize.mutateAsync(instance.id);
        void (window.api?.shell?.openExternal(authUrl) ?? window.open(authUrl, '_blank'));
        setStep('done');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to create connector');
        setStep('scopes');
      }
    } else {
      if (!apiKey.trim()) {
        toast.error(`${apiKeyConfig?.keyLabel ?? 'API Key'} is required`);
        return;
      }

      setStep('authorizing');

      try {
        await createApiKey.mutateAsync({
          connectorId: definition.id,
          label: label.trim() || definition.name,
          apiKey: apiKey.trim(),
        });

        setStep('done');
        toast.success('Connector created successfully');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to create connector');
        setStep('credentials');
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
            {step === 'credentials' && 'Enter your credentials below.'}
            {step === 'scopes' && 'Choose which permissions to grant.'}
            {step === 'authorizing' && 'Setting up your connection...'}
            {step === 'done' &&
              (isOAuth
                ? 'Complete the authorization in your browser.'
                : 'Your connector is now connected.')}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1">
          {step === 'instructions' && (
            <InstructionsStep
              instructions={definition.setupInstructions}
              onNext={() => setStep('credentials')}
            />
          )}

          {step === 'credentials' && (
            <CredentialsStep
              isOAuth={isOAuth}
              label={label}
              setLabel={setLabel}
              clientId={clientId}
              setClientId={setClientId}
              clientSecret={clientSecret}
              setClientSecret={setClientSecret}
              apiKey={apiKey}
              setApiKey={setApiKey}
              apiKeyConfig={apiKeyConfig}
              definitionName={definition.name}
              onBack={() => setStep('instructions')}
              onNext={() => {
                if (isOAuth && oauthConfig) {
                  setStep('scopes');
                } else {
                  void handleCreateAndAuthorize();
                }
              }}
            />
          )}

          {step === 'scopes' && oauthConfig && (
            <ScopesStep
              config={oauthConfig}
              selectedScopes={selectedScopes}
              toggleScope={toggleScope}
              serviceAccess={serviceAccess}
              setServiceAccess={setServiceAccess}
              onBack={() => setStep('credentials')}
              onNext={(scopes) => {
                setSelectedScopes(scopes);
                void handleCreateAndAuthorize(scopes);
              }}
            />
          )}

          {step === 'authorizing' && (
            <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 py-6">
              <Loader2Icon className="size-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Setting up connection...</p>
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
                    A browser window has opened for you to authorize access. Once you approve, the
                    connector will be ready to use. You can close this dialog.
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

function InstructionsStep({
  instructions,
  onNext,
}: {
  instructions: ConnectorSetupInstruction[];
  onNext: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <ScrollArea className="max-h-[45vh] min-h-0 flex-1 rounded-lg border border-border/60 bg-muted/30 p-3">
        <ol className="list-inside list-decimal space-y-2 text-sm text-foreground/85">
          {instructions.map((instruction, i) => (
            <li key={i} className="leading-relaxed">
              <span>{instruction.text}</span>
              {instruction.href ? (
                <button
                  type="button"
                  className="ml-1 inline-flex items-center gap-1 text-primary hover:underline"
                  onClick={() => {
                    void (
                      window.api?.shell?.openExternal(instruction.href!) ??
                      window.open(instruction.href, '_blank')
                    );
                  }}
                >
                  {instruction.hrefLabel ?? 'Open'}
                  <ExternalLinkIcon className="size-3" />
                </button>
              ) : null}
            </li>
          ))}
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

function CredentialsStep({
  isOAuth,
  label,
  setLabel,
  clientId,
  setClientId,
  clientSecret,
  setClientSecret,
  apiKey,
  setApiKey,
  apiKeyConfig,
  definitionName,
  onBack,
  onNext,
}: {
  isOAuth: boolean;
  label: string;
  setLabel: (v: string) => void;
  clientId: string;
  setClientId: (v: string) => void;
  clientSecret: string;
  setClientSecret: (v: string) => void;
  apiKey: string;
  setApiKey: (v: string) => void;
  apiKeyConfig: ApiKeyConfig | null;
  definitionName: string;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        <div className="space-y-1.5">
          <Label htmlFor="label">Label</Label>
          <Input
            id="label"
            placeholder={`e.g. Work ${definitionName}, Personal ${definitionName}`}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>

        {isOAuth ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="clientId">Client ID</Label>
              <Input
                id="clientId"
                placeholder="Your OAuth Client ID"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clientSecret">Client Secret</Label>
              <Input
                id="clientSecret"
                type="password"
                placeholder="Your OAuth Client Secret"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
              />
            </div>
          </>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="apiKey">{apiKeyConfig?.keyLabel ?? 'API Key'}</Label>
            <Input
              id="apiKey"
              type="password"
              placeholder={apiKeyConfig?.placeholder ?? 'Your API Key'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            {apiKeyConfig?.helpUrl && (
              <a
                href={apiKeyConfig.helpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                onClick={(e) => {
                  e.preventDefault();
                  void (
                    window.api?.shell?.openExternal(apiKeyConfig.helpUrl!) ??
                    window.open(apiKeyConfig.helpUrl, '_blank')
                  );
                }}
              >
                <ExternalLinkIcon className="size-3" />
                Get your API key
              </a>
            )}
          </div>
        )}
      </div>
      <DialogFooter className="shrink-0">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeftIcon className="size-3.5" />
          Back
        </Button>
        <Button onClick={onNext}>
          {isOAuth ? 'Choose Scopes' : 'Connect'}
          <ArrowRightIcon className="size-3.5" />
        </Button>
      </DialogFooter>
    </div>
  );
}

function buildEnableApisUrl(
  scopeApiMap: Record<string, string> | undefined,
  selectedScopes: string[],
): string | null {
  if (!scopeApiMap) return null;
  const apiIds = [...new Set(selectedScopes.map((s) => scopeApiMap[s]).filter(Boolean))];
  if (apiIds.length === 0) return null;
  return `https://console.cloud.google.com/flows/enableapi?apiid=${apiIds.join(',')}`;
}

function ScopesStep({
  config,
  selectedScopes,
  toggleScope,
  serviceAccess,
  setServiceAccess,
  onBack,
  onNext,
}: {
  config: OAuthConfig;
  selectedScopes: string[];
  toggleScope: (scope: string) => void;
  serviceAccess: Record<string, 'none' | 'read' | 'write'>;
  setServiceAccess: (v: Record<string, 'none' | 'read' | 'write'>) => void;
  onBack: () => void;
  onNext: (scopes: string[]) => void;
}) {
  const computedScopes = useMemo(() => {
    const options = config.serviceAccessOptions;
    if (!options || options.length === 0) return selectedScopes;

    const serviceScopeSet = new Set<string>();
    for (const option of options) {
      for (const scope of option.readScopes) serviceScopeSet.add(scope);
      for (const scope of option.writeScopes ?? []) serviceScopeSet.add(scope);
    }

    const baseScopes = config.defaultScopes.filter((scope) => !serviceScopeSet.has(scope));
    const scopes = [...baseScopes];

    for (const option of options) {
      const access = serviceAccess[option.id] ?? 'none';
      if (access === 'read' || access === 'write') {
        scopes.push(...option.readScopes);
      }
      if (access === 'write') {
        scopes.push(...(option.writeScopes ?? []));
      }
    }

    return [...new Set(scopes)];
  }, [config.defaultScopes, config.serviceAccessOptions, selectedScopes, serviceAccess]);

  const enableApisUrl = buildEnableApisUrl(config.scopeApiMap, computedScopes);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {config.serviceAccessOptions && config.serviceAccessOptions.length > 0 ? (
          <div className="space-y-3">
            {config.serviceAccessOptions.map((option) => {
              const value = serviceAccess[option.id] ?? 'none';
              return (
                <div key={option.id} className="rounded-lg border border-border/60 p-3">
                  <p className="text-sm font-medium">{option.label}</p>
                  {option.description ? (
                    <p className="text-xs text-muted-foreground">{option.description}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={value === 'none' ? 'secondary' : 'outline'}
                      onClick={() => setServiceAccess({ ...serviceAccess, [option.id]: 'none' })}
                    >
                      Off
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={value === 'read' ? 'secondary' : 'outline'}
                      onClick={() => setServiceAccess({ ...serviceAccess, [option.id]: 'read' })}
                    >
                      Read
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={value === 'write' ? 'secondary' : 'outline'}
                      onClick={() => setServiceAccess({ ...serviceAccess, [option.id]: 'write' })}
                    >
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
                  className="flex cursor-pointer items-start gap-2.5 rounded-lg p-2 text-sm hover:bg-muted/50"
                >
                  <Checkbox
                    checked={selectedScopes.includes(scope)}
                    onCheckedChange={() => toggleScope(scope)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium">{description}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{scope}</p>
                  </div>
                </label>
              ))}
            </div>
          </ScrollArea>
        )}
        {enableApisUrl && (
          <a
            href={enableApisUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md bg-muted/50 px-3 py-2 text-xs text-primary hover:bg-muted"
            onClick={(e) => {
              e.preventDefault();
              void (
                window.api?.shell?.openExternal(enableApisUrl) ??
                window.open(enableApisUrl, '_blank')
              );
            }}
          >
            <ExternalLinkIcon className="size-3" />
            Enable required Google APIs in Cloud Console
          </a>
        )}
      </div>
      <DialogFooter className="shrink-0">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeftIcon className="size-3.5" />
          Back
        </Button>
        <Button onClick={() => onNext(computedScopes)} disabled={computedScopes.length === 0}>
          Connect & Authorize
          <ExternalLinkIcon className="size-3.5" />
        </Button>
      </DialogFooter>
    </div>
  );
}

function WizardProgress({ step, isOAuth }: { step: WizardStep; isOAuth: boolean }) {
  const steps: Array<{ id: WizardStep; label: string }> = isOAuth
    ? [
        { id: 'instructions', label: 'Instructions' },
        { id: 'credentials', label: 'Credentials' },
        { id: 'scopes', label: 'Access' },
        { id: 'authorizing', label: 'Authorize' },
        { id: 'done', label: 'Done' },
      ]
    : [
        { id: 'instructions', label: 'Instructions' },
        { id: 'credentials', label: 'Credentials' },
        { id: 'authorizing', label: 'Connect' },
        { id: 'done', label: 'Done' },
      ];

  const activeIndex = steps.findIndex((item) => item.id === step);

  return (
    <div
      className={`mt-2 grid gap-2 ${isOAuth ? 'grid-cols-2 sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-4'}`}
    >
      {steps.map((item, index) => (
        <div
          key={item.id}
          className={[
            'rounded-md border px-2 py-1 text-center text-[11px]',
            index <= activeIndex
              ? 'border-primary/30 bg-primary/10 text-foreground'
              : 'border-border/60 bg-muted/20 text-muted-foreground',
          ].join(' ')}
        >
          {item.label}
        </div>
      ))}
    </div>
  );
}
