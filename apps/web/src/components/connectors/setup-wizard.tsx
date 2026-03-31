import { useState } from 'react';
import { toast } from 'sonner';
import {
  ExternalLinkIcon,
  CheckIcon,
  Loader2Icon,
  ArrowRightIcon,
  ArrowLeftIcon,
} from 'lucide-react';

import type { ConnectorDefinition, OAuthConfig, ApiKeyConfig } from '@stitch/shared/connectors/types';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { ConnectorIcon } from '@/components/connectors/connector-icon';
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
    definition.authType === 'oauth2'
      ? (definition.authConfig as OAuthConfig).defaultScopes
      : [],
  );

  // API key fields
  const [apiKey, setApiKey] = useState('');

  const createOAuth = useCreateOAuthConnector();
  const createApiKey = useCreateApiKeyConnector();
  const authorize = useAuthorizeConnector();

  const isOAuth = definition.authType === 'oauth2';
  const oauthConfig = isOAuth ? (definition.authConfig as OAuthConfig) : null;
  const apiKeyConfig = !isOAuth ? (definition.authConfig as ApiKeyConfig) : null;

  function toggleScope(scope: string) {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  }

  async function handleCreateAndAuthorize() {
    if (isOAuth) {
      if (!clientId.trim() || !clientSecret.trim()) {
        toast.error('Client ID and Client Secret are required');
        return;
      }
      if (selectedScopes.length === 0) {
        toast.error('Select at least one scope');
        return;
      }

      setStep('authorizing');

      try {
        const instance = await createOAuth.mutateAsync({
          connectorId: definition.id,
          label: label.trim() || definition.name,
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
          scopes: selectedScopes,
        });

        const { authUrl } = await authorize.mutateAsync(instance.id);
        void (window.api?.shell?.openExternal(authUrl) ?? window.open(authUrl, '_blank'));
        setStep('done');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to create connector');
        setStep('credentials');
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ConnectorIcon icon={definition.icon} className="size-7 rounded-md" />
            <DialogTitle>Connect {definition.name}</DialogTitle>
          </div>
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
            onBack={() => setStep('credentials')}
            onNext={() => void handleCreateAndAuthorize()}
          />
        )}

        {step === 'authorizing' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2Icon className="size-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Setting up connection...</p>
          </div>
        )}

        {step === 'done' && (
          <div className="flex flex-col items-center gap-3 py-6">
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
            <DialogFooter className="w-full">
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InstructionsStep({
  instructions,
  onNext,
}: {
  instructions: string[];
  onNext: () => void;
}) {
  return (
    <>
      <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg bg-muted/50 p-3">
        <ol className="list-inside list-decimal space-y-2 text-xs text-foreground/80">
          {instructions.map((instruction, i) => (
            <li key={i} className="leading-relaxed">
              {instruction}
            </li>
          ))}
        </ol>
      </div>
      <DialogFooter>
        <Button onClick={onNext}>
          I have my credentials
          <ArrowRightIcon className="size-3.5" />
        </Button>
      </DialogFooter>
    </>
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
    <>
      <div className="space-y-3">
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
                  void (window.api?.shell?.openExternal(apiKeyConfig.helpUrl!) ??
                    window.open(apiKeyConfig.helpUrl, '_blank'));
                }}
              >
                <ExternalLinkIcon className="size-3" />
                Get your API key
              </a>
            )}
          </div>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onBack}>
          <ArrowLeftIcon className="size-3.5" />
          Back
        </Button>
        <Button onClick={onNext}>
          {isOAuth ? 'Choose Scopes' : 'Connect'}
          <ArrowRightIcon className="size-3.5" />
        </Button>
      </DialogFooter>
    </>
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
  onBack,
  onNext,
}: {
  config: OAuthConfig;
  selectedScopes: string[];
  toggleScope: (scope: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const enableApisUrl = buildEnableApisUrl(config.scopeApiMap, selectedScopes);

  return (
    <>
      <div className="max-h-64 space-y-1.5 overflow-y-auto">
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
      {enableApisUrl && (
        <a
          href={enableApisUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md bg-muted/50 px-3 py-2 text-xs text-primary hover:bg-muted"
          onClick={(e) => {
            e.preventDefault();
            void (window.api?.shell?.openExternal(enableApisUrl) ??
              window.open(enableApisUrl, '_blank'));
          }}
        >
          <ExternalLinkIcon className="size-3" />
          Enable required Google APIs in Cloud Console
        </a>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onBack}>
          <ArrowLeftIcon className="size-3.5" />
          Back
        </Button>
        <Button onClick={onNext} disabled={selectedScopes.length === 0}>
          Connect & Authorize
          <ExternalLinkIcon className="size-3.5" />
        </Button>
      </DialogFooter>
    </>
  );
}
