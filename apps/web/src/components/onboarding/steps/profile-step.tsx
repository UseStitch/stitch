import * as React from 'react';

import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function getDetectedTimezone(): string {
  const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return typeof resolved === 'string' && resolved.trim().length > 0 ? resolved.trim() : 'UTC';
}

function getTimezoneOptions(initialTimezone: string): string[] {
  const intlWithSupportedValues = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
  const listed = intlWithSupportedValues.supportedValuesOf('timeZone');
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
  const detectedTimezone = getDetectedTimezone();
  const [name, setName] = React.useState(initialName);
  const [timezone, setTimezone] = React.useState(initialTimezone || detectedTimezone);
  const [touched, setTouched] = React.useState(false);
  const timezoneOptions = getTimezoneOptions(initialTimezone || detectedTimezone);

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
    <div className="mx-auto h-full w-full max-w-md">
      <Stack as="form" height="full" justify="center" gap="2xl" onSubmit={handleSubmit}>
        <div className="space-y-space-m text-center">
          <Text variant="heading-l">Tell us your name</Text>
          <Text variant="body" tone="muted">
            We&apos;ll use it to personalize responses and transcription speaker labels.
          </Text>
        </div>

        <div className="space-y-space-m">
          <Label htmlFor="onboarding-name">Name</Label>
          <Input
            id="onboarding-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="Jane"
            maxLength={80}
          />
          {hasError && (
            <Text variant="caption" tone="destructive">
              Please enter your name.
            </Text>
          )}
        </div>

        <div className="space-y-space-m">
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
          {hasTimezoneError && (
            <Text variant="caption" tone="destructive">
              Please select a timezone.
            </Text>
          )}
        </div>

        <Button size="lg" type="submit" disabled={isSaving || trimmed.length === 0 || trimmedTimezone.length === 0}>
          {isSaving ? 'Saving...' : 'Continue'}
        </Button>
      </Stack>
    </div>
  );
}
