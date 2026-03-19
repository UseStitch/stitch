import { CheckIcon, XIcon } from 'lucide-react';
import * as React from 'react';

import type { QuestionRequest, QuestionInfo } from '@openwork/shared/questions/types';

import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

type QuestionDockProps = {
  questions: QuestionRequest[];
  onReply: (questionId: string, answers: string[][]) => void;
  onReject: (questionId: string) => void;
};

export function QuestionDock({ questions, onReply, onReject }: QuestionDockProps) {
  const request = questions[0];
  const items = request.questions as QuestionInfo[];
  const total = items.length;

  const [tab, setTab] = React.useState(0);
  const [answers, setAnswers] = React.useState<string[][]>(() => items.map(() => []));
  const [customAnswers, setCustomAnswers] = React.useState<string[]>(() => items.map(() => ''));
  const [customOn, setCustomOn] = React.useState<boolean[]>(() => items.map(() => false));

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

  function handleCustomToggle(idx: number) {
    const newCustomOn = [...customOn];
    newCustomOn[idx] = !newCustomOn[idx];
    setCustomOn(newCustomOn);
  }

  function handleCustomChange(idx: number, value: string) {
    const newCustomAnswers = [...customAnswers];
    newCustomAnswers[idx] = value;
    setCustomAnswers(newCustomAnswers);
  }

  function handleSubmit() {
    const finalAnswers = answers.map((a, i) => {
      if (customOn[i] && customAnswers[i]?.trim()) {
        return [...a, customAnswers[i]!.trim()];
      }
      return a;
    });
    onReply(request.id, finalAnswers);
  }

  const isAnswered = (idx: number): boolean => {
    const hasOption = (answers[idx]?.length ?? 0) > 0;
    const hasCustom = customOn[idx] && (customAnswers[idx]?.trim()?.length ?? 0) > 0;
    return hasOption || hasCustom;
  };

  const allAnswered = items.every((_, idx) => isAnswered(idx));

  return (
    <div className="flex flex-col gap-2">
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
              <div className="text-sm text-foreground mb-1">{item.question}</div>
              <div className="text-[11px] text-muted-foreground mb-2">
                {isMultiQ ? 'Select all that apply' : 'Select one option'}
              </div>

              <div className="space-y-1.5">
                {item.options.map((option) => (
                  <button
                    key={option.label}
                    onClick={() => handleSelect(idx, option.label)}
                    className={cn(
                      'w-full flex items-start gap-2 p-2 rounded-md border text-sm text-left transition-colors',
                      isTabSelected(option.label)
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted/50',
                    )}
                  >
                    <div
                      className={cn(
                        'mt-0.5 size-3.5 rounded-full border flex items-center justify-center shrink-0',
                        isTabSelected(option.label)
                          ? 'border-primary bg-primary'
                          : 'border-muted-foreground',
                      )}
                    >
                      {isTabSelected(option.label) && (
                        <CheckIcon className="size-2 text-primary-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-foreground truncate">{option.label}</div>
                      {option.description && (
                        <div className="text-xs text-muted-foreground truncate">
                          {option.description}
                        </div>
                      )}
                    </div>
                  </button>
                ))}

                <button
                  onClick={() => handleCustomToggle(idx)}
                  className={cn(
                    'w-full flex items-center gap-2 p-2 rounded-md border text-sm text-left transition-colors',
                    customOn[idx]
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/50',
                  )}
                >
                  <div
                    className={cn(
                      'mt-0.5 size-3.5 rounded-full border flex items-center justify-center shrink-0',
                      customOn[idx] ? 'border-primary bg-primary' : 'border-muted-foreground',
                    )}
                  >
                    {customOn[idx] && <CheckIcon className="size-2 text-primary-foreground" />}
                  </div>
                  <span className="text-foreground">Custom answer</span>
                </button>

                {customOn[idx] && (
                  <input
                    type="text"
                    value={customAnswers[idx] ?? ''}
                    onChange={(e) => handleCustomChange(idx, e.target.value)}
                    placeholder="Type your answer..."
                    className="w-full p-2 rounded-md border border-primary bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    autoFocus
                  />
                )}
              </div>
            </TabsContent>
          );
        })}
      </Tabs>

      <div className="flex items-center justify-between gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={() => onReject(request.id)} className="h-7 px-2">
          <XIcon className="size-3 mr-1" />
          Dismiss
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={handleSubmit}
          disabled={!allAnswered}
          className="h-7"
        >
          Submit
        </Button>
      </div>
    </div>
  );
}
