import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

function getDetectedTimezone(): string {
  const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return typeof resolved === 'string' && resolved.trim().length > 0 ? resolved.trim() : 'UTC';
}

function getTimezoneOptions(initialTimezone: string): string[] {
  const intlWithSupportedValues = Intl as typeof Intl & {
    supportedValuesOf?: (key: string) => string[];
  };
  const listed = intlWithSupportedValues.supportedValuesOf?.('timeZone') ?? [];
  const preferred = [initialTimezone].filter((value) => value.length > 0);

  if (listed.length === 0) {
    return preferred;
  }

  return Array.from(new Set([...preferred, ...listed]));
}

type Props = {
  initialName: string;
  initialTimezone: string;
  isSaving: boolean;
  onContinue: (name: string, timezone: string) => void;
};

export function ProfileStep({ initialName, initialTimezone, isSaving, onContinue }: Props) {
  const detectedTimezone = React.useMemo(() => getDetectedTimezone(), []);
  const [name, setName] = React.useState(initialName);
  const [timezone, setTimezone] = React.useState(initialTimezone || detectedTimezone);
  const [touched, setTouched] = React.useState(false);
  const timezoneOptions = React.useMemo(
    () => getTimezoneOptions(initialTimezone || detectedTimezone),
    [detectedTimezone, initialTimezone],
  );

  const trimmed = name.trim();
  const trimmedTimezone = timezone.trim();
  const hasError = touched && trimmed.length === 0;
  const hasTimezoneError = touched && trimmedTimezone.length === 0;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (trimmed.length === 0 || trimmedTimezone.length === 0) return;
    onContinue(trimmed, trimmedTimezone);
  }

  return (
    <form
      className="mx-auto flex h-full w-full max-w-md flex-col justify-center gap-6"
      onSubmit={handleSubmit}
    >
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">Tell us your name</h2>
        <p className="text-sm text-muted-foreground">
          We&apos;ll use it to personalize responses and transcription speaker labels.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="onboarding-name">Name</Label>
        <Input
          id="onboarding-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="Jane"
          maxLength={80}
          autoFocus
        />
        {hasError && <p className="text-xs text-destructive">Please enter your name.</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="onboarding-timezone">Timezone</Label>
        <Select value={timezone} onValueChange={(value) => setTimezone(value ?? '')}>
          <SelectTrigger id="onboarding-timezone" className="w-full">
            <SelectValue placeholder="Select your timezone" />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            {timezoneOptions.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasTimezoneError && <p className="text-xs text-destructive">Please select a timezone.</p>}
      </div>

      <Button
        size="lg"
        type="submit"
        disabled={isSaving || trimmed.length === 0 || trimmedTimezone.length === 0}
      >
        {isSaving ? 'Saving...' : 'Continue'}
      </Button>
    </form>
  );
}
