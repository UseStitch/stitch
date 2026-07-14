import { CheckIcon, XIcon } from 'lucide-react';
import * as React from 'react';

import type { QuestionRequest } from '@stitch/shared/questions/types';

import { Dock } from '@/components/chat/docks/dock';
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

  React.useEffect(() => {
    setTab(0);
    setAnswers(emptyAnswers(items));
    setCustomAnswers(emptyText(items));
  }, [request.id, items]);

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
    const hasCustom = (customAnswers[idx]?.trim()?.length ?? 0) > 0;
    return hasOption || hasCustom;
  };

  const allAnswered = items.every((_, idx) => isAnswered(idx));

  return (
    <form className="flex flex-col gap-2" onSubmit={handleSubmit}>
      <Tabs value={String(tab)} onValueChange={(v) => setTab(Number(v))}>
        {total > 1 && (
          <TabsList variant="line" className="w-full justify-start">
            {items.map((item, idx) => (
              <TabsTrigger key={idx} value={String(idx)} className="gap-1.5 text-xs">
                {item.header}
                {isAnswered(idx) && <CheckIcon className="size-3 text-primary" />}
              </TabsTrigger>
            ))}
          </TabsList>
        )}

        {items.map((item, idx) => {
          const isMultiQ = item.multiple ?? false;
          const isTabSelected = (label: string) => answers[idx]?.includes(label) ?? false;

          return (
            <TabsContent key={idx} value={String(idx)} className="mt-0">
              <div className="mb-1 text-sm text-foreground">{item.question}</div>
              <div className="mb-2 text-2xs text-muted-foreground">
                {isMultiQ ? 'Select all that apply' : 'Select one option'}
              </div>

              <div className="space-y-1.5">
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
                  className="h-auto w-full p-2 text-foreground placeholder:text-muted-foreground"
                />
              </div>
            </TabsContent>
          );
        })}
      </Tabs>

      <div className="flex items-center justify-between gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={() => onReject(request.id)} className="h-7 px-2">
          <XIcon className="mr-1 size-3" />
          Dismiss
        </Button>
        <Button variant="default" size="sm" type="submit" disabled={!allAnswered} className="h-7">
          Submit
        </Button>
      </div>
    </form>
  );
}
