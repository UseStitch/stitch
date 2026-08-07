import { CheckIcon, XIcon } from 'lucide-react';
import * as React from 'react';

import type { QuestionRequest } from '@stitch/shared/questions/types';

import { Dock } from '@/components/chat/docks/dock';
import { Icon } from '@/components/primitives/icon.js';
import { Stack } from '@/components/primitives/stack.js';
import { Text } from '@/components/primitives/text.js';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

type QuestionDockProps = {
  request: QuestionRequest;
  onReply: (questionId: string, answers: string[][]) => void;
  onReject: (questionId: string) => void;
};

function emptyAnswers(items: QuestionRequest['questions']) {
  return items.map(() => [] as string[]);
}

function emptyText(items: QuestionRequest['questions']) {
  return items.map(() => '');
}

export function QuestionDock({ request, onReply, onReject }: QuestionDockProps) {
  const items = request.questions;
  const total = items.length;

  const [tab, setTab] = React.useState(0);
  const [answers, setAnswers] = React.useState<string[][]>(() => emptyAnswers(items));
  const [customAnswers, setCustomAnswers] = React.useState<string[]>(() => emptyText(items));
  const [answeredRequest, setAnsweredRequest] = React.useState({ id: request.id, items });

  if (answeredRequest.id !== request.id || answeredRequest.items !== items) {
    setAnsweredRequest({ id: request.id, items });
    setTab(0);
    setAnswers(emptyAnswers(items));
    setCustomAnswers(emptyText(items));
  }

  function handleSelect(idx: number, optionLabel: string) {
    const newAnswers = [...answers];
    const isMulti = items[idx]?.multiple ?? false;

    if (isMulti) {
      const current = newAnswers[idx] ?? [];
      if (current.includes(optionLabel)) {
        newAnswers[idx] = current.filter((a) => a !== optionLabel);
      } else {
        newAnswers[idx] = [...current, optionLabel];
      }
    } else {
      newAnswers[idx] = [optionLabel];
    }
    setAnswers(newAnswers);
  }

  function handleCustomChange(idx: number, value: string) {
    const newCustomAnswers = [...customAnswers];
    newCustomAnswers[idx] = value;
    setCustomAnswers(newCustomAnswers);
  }

  function handleSubmit(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const finalAnswers = answers.map((a, i) => {
      const customAnswer = customAnswers[i]?.trim();
      if (customAnswer) {
        return items[i]?.multiple ? [...a, customAnswer] : [customAnswer];
      }
      return a;
    });
    onReply(request.id, finalAnswers);
  }

  const isAnswered = (idx: number): boolean => {
    const hasOption = (answers[idx]?.length ?? 0) > 0;
    const hasCustom = customAnswers[idx].trim().length > 0;
    return hasOption || hasCustom;
  };

  const allAnswered = items.every((_, idx) => isAnswered(idx));

  return (
    <Stack as="form" gap="m" onSubmit={handleSubmit}>
      <Tabs value={String(tab)} onValueChange={(v) => setTab(Number(v))}>
        {total > 1 && (
          <TabsList variant="line" className="w-full justify-start">
            {items.map((item, idx) => (
              <TabsTrigger key={item.question} value={String(idx)} className="gap-space-s text-xs">
                {item.header}
                {isAnswered(idx) && <Icon as={CheckIcon} size="xs" color="var(--primary)" />}
              </TabsTrigger>
            ))}
          </TabsList>
        )}

        {items.map((item, idx) => {
          const isMultiQ = item.multiple ?? false;
          const isTabSelected = (label: string) => answers[idx]?.includes(label) ?? false;

          return (
            <TabsContent key={item.question} value={String(idx)} className="mt-space-none">
              <div className="mb-space-xs">
                <Text as="div" variant="body">
                  {item.question}
                </Text>
              </div>
              <div className="mb-space-m">
                <Text as="div" variant="micro" tone="muted">
                  {isMultiQ ? 'Select all that apply' : 'Select one option'}
                </Text>
              </div>

              <div className="space-y-space-s">
                {item.options.map((option) => (
                  <Dock.Selectable
                    key={option.label}
                    onClick={() => handleSelect(idx, option.label)}
                    selected={isTabSelected(option.label)}
                    description={option.description}>
                    {option.label}
                  </Dock.Selectable>
                ))}

                <Dock.Input
                  type="text"
                  value={customAnswers[idx] ?? ''}
                  onChange={(e) => handleCustomChange(idx, e.target.value)}
                  placeholder="Type a custom answer..."
                  className="h-auto w-full p-space-m text-foreground placeholder:text-muted-foreground"
                />
              </div>
            </TabsContent>
          );
        })}
      </Tabs>

      <div className="flex items-center justify-between gap-space-m pt-space-xs">
        <Button variant="ghost" size="sm" onClick={() => onReject(request.id)}>
          <span className="mr-space-xs">
            <Icon as={XIcon} size="xs" />
          </span>
          Dismiss
        </Button>
        <Button variant="default" size="sm" type="submit" disabled={!allAnswered}>
          Submit
        </Button>
      </div>
    </Stack>
  );
}
