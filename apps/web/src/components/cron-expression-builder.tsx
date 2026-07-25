import { format } from 'date-fns';
import { Calendar, Info } from 'lucide-react';
import * as React from 'react';

import { getUpcomingCronRuns } from '@stitch/scheduler';

import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface CronExpressionBuilderProps {
  value: string;
  onChange: (value: string) => void;
  timezone?: string;
  className?: string;
}

type Frequency = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';

const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  // { value: 'custom', label: 'Custom' }, // Custom can be tricky to map back to UI, sticking to standard for now or treating as advanced
];

const DAYS_OF_WEEK = [
  { value: '1', label: 'Mon' },
  { value: '2', label: 'Tue' },
  { value: '3', label: 'Wed' },
  { value: '4', label: 'Thu' },
  { value: '5', label: 'Fri' },
  { value: '6', label: 'Sat' },
  { value: '0', label: 'Sun' },
];

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5); // 0, 5, 10...
const DAYS_OF_MONTH = Array.from({ length: 31 }, (_, i) => i + 1);

type CronConfig = {
  frequency: Frequency;
  minutes: number[];
  hours: number[];
  daysOfMonth: number[];
  months: number[];
  daysOfWeek: number[];
};

const DEFAULT_CONFIG: CronConfig = {
  frequency: 'daily',
  minutes: [0],
  hours: [9],
  daysOfMonth: [1],
  months: [],
  daysOfWeek: [1],
};

function parsePart(part: string): number[] {
  if (part === '*' || part === '?') return [];
  return part
    .split(',')
    .map((v) => Number.parseInt(v, 10))
    .filter((v) => !Number.isNaN(v));
}

// Simple parser: the builder only ever writes numeric lists, so ranges/steps fall back to the closest match
function parseFrequency(hour: string, dayOfMonth: string, month: string, dayOfWeek: string): Frequency {
  if (hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') return 'hourly';
  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') return 'daily';
  if (dayOfMonth === '*' && month === '*') return 'weekly';
  if (dayOfMonth !== '*' && dayOfWeek === '*') return 'monthly';
  if (dayOfWeek !== '*') return 'weekly';
  return 'daily';
}

function parseCron(value: string): CronConfig {
  const parts = value.trim().split(' ');
  if (!value || parts.length < 5) return DEFAULT_CONFIG;

  const [m, h, dom, mon, dow] = parts;
  const parsedMinutes = parsePart(m);

  return {
    frequency: parseFrequency(h, dom, mon, dow),
    minutes: parsedMinutes.length > 0 ? [parsedMinutes[0]] : DEFAULT_CONFIG.minutes,
    hours: parsePart(h),
    daysOfMonth: parsePart(dom),
    months: parsePart(mon),
    daysOfWeek: parsePart(dow),
  };
}

function formatPart(values: number[]): string {
  if (values.length === 0) return '*';
  return values.join(',');
}

function buildCron(config: CronConfig): string {
  const minute = config.minutes.length > 0 ? config.minutes[0].toString() : '0';
  const hour = formatPart(config.hours);

  switch (config.frequency) {
    case 'hourly':
      return `${minute} * * * *`;
    case 'weekly':
      return `${minute} ${hour} * * ${formatPart(config.daysOfWeek)}`;
    case 'monthly':
      return `${minute} ${hour} ${formatPart(config.daysOfMonth)} ${formatPart(config.months)} *`;
    default:
      return `${minute} ${hour} * * *`;
  }
}

export function CronExpressionBuilder({ value, onChange, timezone = 'UTC', className }: CronExpressionBuilderProps) {
  // The cron parts are derived from `value`; only the frequency is a user choice that `value` cannot always express
  const parsed = parseCron(value);
  const [frequency, setFrequency] = React.useState(parsed.frequency);
  const { minutes, hours, daysOfMonth, months, daysOfWeek } = parsed;

  function emit(changes: Partial<CronConfig>) {
    const next = buildCron({ ...parsed, frequency, ...changes });
    if (next !== value) onChange(next);
  }

  // Calculate upcoming executions
  const upcomingExecutions = React.useMemo(() => {
    const options = { tz: timezone };
    try {
      return getUpcomingCronRuns(value, 5, options.tz).map((date) => ({
        date: format(date, 'MMM d, yyyy'),
        time: format(date, 'h:mm a'),
        key: date.toISOString(),
      }));
    } catch {
      return [];
    }
  }, [value, timezone]);

  // Renderers for grid sections
  const renderMinutes = () => (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label className="text-xs font-semibold text-muted-foreground uppercase">Minute</Label>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Info className="h-3 w-3 text-muted-foreground/70" />
            </TooltipTrigger>
            <TooltipContent>
              <p>Select which minute past the hour the workflow should run.</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <ToggleGroup
        value={[minutes[0]?.toString() ?? '0']}
        onValueChange={(vals) => {
          const val = vals[0];
          if (val) emit({ minutes: [Number.parseInt(val)] });
        }}
        className="flex flex-wrap justify-start gap-1">
        {MINUTES.map((m) => (
          <ToggleGroupItem
            key={m}
            value={m.toString()}
            className="h-8 w-9 p-0 text-xs hover:bg-accent hover:text-accent-foreground aria-pressed:bg-primary! aria-pressed:text-primary-foreground! aria-pressed:shadow-sm">
            {m.toString().padStart(2, '0')}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );

  const renderHours = () => (
    <div className="space-y-2">
      <Label className="text-xs font-semibold text-muted-foreground uppercase">Hours</Label>
      <ToggleGroup
        multiple
        value={hours.map((h) => h.toString())}
        onValueChange={(vals) => {
          if (vals.length > 0) emit({ hours: vals.map((v) => Number.parseInt(v)).toSorted((a, b) => a - b) });
        }}
        className="flex flex-wrap justify-start gap-1">
        {HOURS.map((h) => (
          <ToggleGroupItem
            key={h}
            value={h.toString()}
            className="h-8 w-9 p-0 text-xs hover:bg-accent hover:text-accent-foreground aria-pressed:bg-primary! aria-pressed:text-primary-foreground! aria-pressed:shadow-sm">
            {h.toString().padStart(2, '0')}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );

  const renderWeekdays = () => (
    <div className="space-y-2">
      <Label className="text-xs font-semibold text-muted-foreground uppercase">Days of Week</Label>
      <ToggleGroup
        multiple
        value={daysOfWeek.map((d) => d.toString())}
        onValueChange={(vals) => {
          if (vals.length > 0) emit({ daysOfWeek: vals.map((v) => Number.parseInt(v)) });
        }}
        className="flex flex-wrap justify-start gap-1">
        {DAYS_OF_WEEK.map((day) => (
          <ToggleGroupItem
            key={day.value}
            value={day.value}
            className="h-8 min-w-12 px-2 text-xs hover:bg-accent hover:text-accent-foreground aria-pressed:bg-primary! aria-pressed:text-primary-foreground! aria-pressed:shadow-sm">
            {day.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );

  const renderDaysOfMonth = () => (
    <div className="space-y-2">
      <Label className="text-xs font-semibold text-muted-foreground uppercase">Days of Month</Label>
      <ToggleGroup
        multiple
        value={daysOfMonth.map((d) => d.toString())}
        onValueChange={(vals) => {
          if (vals.length > 0) emit({ daysOfMonth: vals.map((v) => Number.parseInt(v)).toSorted((a, b) => a - b) });
        }}
        className="flex flex-wrap justify-start gap-1">
        {DAYS_OF_MONTH.map((d) => (
          <ToggleGroupItem
            key={d}
            value={d.toString()}
            className="h-8 w-9 p-0 text-xs hover:bg-accent hover:text-accent-foreground aria-pressed:bg-primary! aria-pressed:text-primary-foreground! aria-pressed:shadow-sm">
            {d}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );

  const renderMonths = () => (
    <div className="space-y-2">
      <Label className="text-xs font-semibold text-muted-foreground uppercase">Months</Label>
      <ToggleGroup
        multiple
        value={months.map((m) => m.toString())}
        onValueChange={(vals) => {
          // If empty, it means all months (cron *)
          emit({ months: vals.map((v) => Number.parseInt(v)).toSorted((a, b) => a - b) });
        }}
        className="flex flex-wrap justify-start gap-1">
        {MONTHS_SHORT.map((m, i) => (
          <ToggleGroupItem
            key={m}
            value={(i + 1).toString()}
            className="h-8 w-10 p-0 text-xs hover:bg-accent hover:text-accent-foreground aria-pressed:bg-primary! aria-pressed:text-primary-foreground! aria-pressed:shadow-sm">
            {m}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Frequency Selector */}
      <div className="flex flex-col gap-2">
        <Label>Frequency</Label>
        <ToggleGroup
          value={[frequency]}
          onValueChange={(vals) => {
            const val = vals[0];
            if (val) {
              const newFreq = val as Frequency;
              setFrequency(newFreq);

              // Ensure required fields are populated when switching
              emit({
                frequency: newFreq,
                daysOfMonth: newFreq === 'monthly' && daysOfMonth.length === 0 ? [1] : daysOfMonth,
                daysOfWeek: newFreq === 'weekly' && daysOfWeek.length === 0 ? [1] : daysOfWeek, // Monday
              });
            }
          }}
          className="w-fit justify-start rounded-md border bg-muted/30 p-1">
          {FREQUENCIES.map((f) => (
            <ToggleGroupItem
              key={f.value}
              value={f.value}
              className="h-8 rounded-sm px-3 text-xs hover:bg-accent hover:text-accent-foreground aria-pressed:bg-background! aria-pressed:text-foreground! aria-pressed:shadow-sm">
              {f.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="flex h-full min-h-0 flex-col gap-6 lg:flex-row">
        {/* Main Builder Area */}
        <ScrollArea className="h-100 flex-1 pr-4">
          <div className="flex flex-col gap-6 pb-4">
            {frequency === 'hourly' && <>{renderMinutes()}</>}

            {frequency === 'daily' && (
              <>
                {renderHours()}
                {renderMinutes()}
              </>
            )}

            {frequency === 'weekly' && (
              <>
                {renderWeekdays()}
                {renderHours()}
                {renderMinutes()}
              </>
            )}

            {frequency === 'monthly' && (
              <>
                {renderMonths()}
                {renderDaysOfMonth()}
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  {renderHours()}
                  {renderMinutes()}
                </div>
              </>
            )}

            {/* <div className="bg-muted/50 rounded-md p-3 font-mono text-sm border">
              {value}
            </div> */}
          </div>
        </ScrollArea>

        {/* Upcoming Executions Sidebar */}
        <div className="flex shrink-0 flex-col gap-3 border-l border-border/50 lg:w-64 lg:pl-6">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <h3 className="text-xs font-semibold tracking-wider uppercase">Upcoming Runs</h3>
          </div>

          <div className="space-y-2">
            {upcomingExecutions.length > 0 ? (
              upcomingExecutions.map((execution) => (
                <div
                  key={execution.key}
                  className="flex flex-col gap-0.5 rounded-md border bg-card/50 p-2.5 text-sm shadow-sm">
                  <span className="font-medium text-foreground">{execution.date}</span>
                  <span className="text-xs text-muted-foreground">at {execution.time}</span>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground italic">No upcoming runs scheduled</p>
            )}
          </div>
          <div className="text-right text-2xs text-muted-foreground">Timezone: {timezone}</div>
        </div>
      </div>
    </div>
  );
}
