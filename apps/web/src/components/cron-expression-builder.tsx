import * as React from 'react';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Calendar, Info } from 'lucide-react';
import { CronExpressionParser } from 'cron-parser';
import { format } from 'date-fns';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

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

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5); // 0, 5, 10...
const DAYS_OF_MONTH = Array.from({ length: 31 }, (_, i) => i + 1);

export function CronExpressionBuilder({
  value,
  onChange,
  timezone = 'UTC',
  className,
}: CronExpressionBuilderProps) {
  // State
  const [frequency, setFrequency] = React.useState<Frequency>('daily');
  const [minutes, setMinutes] = React.useState<number[]>([0]); // Single minute for > hourly
  const [hours, setHours] = React.useState<number[]>([9]);
  const [daysOfMonth, setDaysOfMonth] = React.useState<number[]>([1]);
  const [months, setMonths] = React.useState<number[]>([]); // Empty means *
  const [daysOfWeek, setDaysOfWeek] = React.useState<number[]>([1]); // Default Mon

  // Parse incoming cron expression
  React.useEffect(() => {
    if (!value) return;

    const parts = value.trim().split(' ');
    if (parts.length < 5) return;

    const [m, h, dom, mon, dow] = parts;

    const parsePart = (part: string, _max: number): number[] => {
      if (part === '*' || part === '?') return [];
      return part
        .split(',')
        .map((v) => Number.parseInt(v, 10))
        .filter((v) => !Number.isNaN(v));
    };

    // Minutes
    const parsedMinutes = parsePart(m, 59);
    if (parsedMinutes.length > 0) setMinutes([parsedMinutes[0]]); // Enforce single minute

    // Hours
    const parsedHours = parsePart(h, 23);
    setHours(parsedHours.length > 0 ? parsedHours : []);

    // Days of Month
    const parsedDom = parsePart(dom, 31);
    setDaysOfMonth(parsedDom.length > 0 ? parsedDom : []);

    // Months
    const parsedMon = parsePart(mon, 12);
    setMonths(parsedMon.length > 0 ? parsedMon : []);

    // Days of Week
    // Handle MON-FRI etc if necessary, but we mostly write numbers
    // This is a simple parser, might need more robust parsing for complex expressions
    // For now assuming the builder generates standard numeric lists
    const parsedDow = parsePart(dow, 7);
    setDaysOfWeek(parsedDow.length > 0 ? parsedDow : []);

    // Determine Frequency
    if (h === '*' && dom === '*' && mon === '*' && dow === '*') {
      setFrequency('hourly');
    } else if (dom === '*' && mon === '*' && dow === '*') {
      setFrequency('daily');
    } else if (dom === '*' && mon === '*' && dow !== '*') {
      setFrequency('weekly');
    } else if (dom !== '*' && mon === '*' && dow === '*') {
      setFrequency('monthly');
    } else {
      // Default to daily if it doesn't match perfectly or custom
      // If it's a specific day of month AND day of week, it's complex, maybe monthly?
      if (dom !== '*' && dow === '*') setFrequency('monthly');
      else if (dow !== '*') setFrequency('weekly');
      else setFrequency('daily');
    }
  }, [value]);

  // Construct cron expression
  const constructCron = React.useCallback(() => {
    // Helper to format part
    const formatPart = (vals: number[], allChar = '*') => {
      if (vals.length === 0) return allChar;
      return vals.join(',');
    };

    const mStr = minutes.length > 0 ? minutes[0].toString() : '0';

    let cron = '';
    switch (frequency) {
      case 'hourly':
        cron = `${mStr} * * * *`;
        break;
      case 'daily': {
        const hStr = formatPart(hours);
        cron = `${mStr} ${hStr} * * *`;
        break;
      }
      case 'weekly': {
        const hStr = formatPart(hours);
        const dowStr = formatPart(daysOfWeek);
        cron = `${mStr} ${hStr} * * ${dowStr}`;
        break;
      }
      case 'monthly': {
        const hStr = formatPart(hours);
        const domStr = formatPart(daysOfMonth);
        const monStr = formatPart(months);
        cron = `${mStr} ${hStr} ${domStr} ${monStr} *`;
        break;
      }
      default:
        cron = value; // Fallback
    }

    // Only update if changed
    if (cron !== value) {
      onChange(cron);
    }
  }, [
    frequency,
    minutes,
    hours,
    daysOfWeek,
    daysOfMonth,
    months,
    onChange,
    value,
  ]);

  // Update on state change
  React.useEffect(() => {
    // We don't want to trigger this immediately on mount/parse, but parsing sets state which triggers this.
    // However, if parsing sets state to exactly what matches value, constructCron won't call onChange due to check.
    constructCron();
  }, [constructCron]);

  // Calculate upcoming executions
  const upcomingExecutions = React.useMemo(() => {
    const options = { tz: timezone };
    try {
      const interval = CronExpressionParser.parse(value, options);
      const runs: { date: string; time: string; key: string }[] = [];
      for (let i = 0; i < 5; i++) {
        const date = interval.next().toDate();
        runs.push({
          date: format(date, 'MMM d, yyyy'),
          time: format(date, 'h:mm a'),
          key: date.toISOString(),
        });
      }
      return runs;
    } catch {
      return [];
    }
  }, [value, timezone]);

  // Renderers for grid sections
  const renderMinutes = () => (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label className="text-xs font-semibold uppercase text-muted-foreground">
          Minute
        </Label>
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
          if (val) setMinutes([Number.parseInt(val)]);
        }}
        className="flex flex-wrap justify-start gap-1"
      >
        {MINUTES.map((m) => (
          <ToggleGroupItem
            key={m}
            value={m.toString()}
            className="h-8 w-9 p-0 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            {m.toString().padStart(2, '0')}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );

  const renderHours = () => (
    <div className="space-y-2">
      <Label className="text-xs font-semibold uppercase text-muted-foreground">
        Hours
      </Label>
      <ToggleGroup
        value={hours.map((h) => h.toString())}
        onValueChange={(vals) => {
          if (vals.length > 0)
            setHours(vals.map((v) => Number.parseInt(v)).sort((a, b) => a - b));
        }}
        className="flex flex-wrap justify-start gap-1"
      >
        {HOURS.map((h) => (
          <ToggleGroupItem
            key={h}
            value={h.toString()}
            className="h-8 w-9 p-0 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            {h.toString().padStart(2, '0')}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );

  const renderWeekdays = () => (
    <div className="space-y-2">
      <Label className="text-xs font-semibold uppercase text-muted-foreground">
        Days of Week
      </Label>
      <ToggleGroup
        value={daysOfWeek.map((d) => d.toString())}
        onValueChange={(vals) => {
          if (vals.length > 0)
            setDaysOfWeek(vals.map((v) => Number.parseInt(v)));
        }}
        className="flex flex-wrap justify-start gap-1"
      >
        {DAYS_OF_WEEK.map((day) => (
          <ToggleGroupItem
            key={day.value}
            value={day.value}
            className="h-8 min-w-12 px-2 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            {day.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );

  const renderDaysOfMonth = () => (
    <div className="space-y-2">
      <Label className="text-xs font-semibold uppercase text-muted-foreground">
        Days of Month
      </Label>
      <ToggleGroup
        value={daysOfMonth.map((d) => d.toString())}
        onValueChange={(vals) => {
          if (vals.length > 0)
            setDaysOfMonth(
              vals.map((v) => Number.parseInt(v)).sort((a, b) => a - b),
            );
        }}
        className="flex flex-wrap justify-start gap-1"
      >
        {DAYS_OF_MONTH.map((d) => (
          <ToggleGroupItem
            key={d}
            value={d.toString()}
            className="h-8 w-9 p-0 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            {d}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );

  const renderMonths = () => (
    <div className="space-y-2">
      <Label className="text-xs font-semibold uppercase text-muted-foreground">
        Months
      </Label>
      <ToggleGroup
        value={months.map((m) => m.toString())}
        onValueChange={(vals) => {
          // If empty, it means all months (cron *)
          setMonths(vals.map((v) => Number.parseInt(v)).sort((a, b) => a - b));
        }}
        className="flex flex-wrap justify-start gap-1"
      >
        {MONTHS_SHORT.map((m, i) => (
          <ToggleGroupItem
            key={m}
            value={(i + 1).toString()}
            className="h-8 w-10 p-0 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
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
              if (newFreq === 'monthly' && daysOfMonth.length === 0) {
                setDaysOfMonth([1]);
              }
              if (newFreq === 'weekly' && daysOfWeek.length === 0) {
                setDaysOfWeek([1]); // Monday
              }
            }
          }}
          className="justify-start border rounded-md p-1 w-fit"
        >
          {FREQUENCIES.map((f) => (
            <ToggleGroupItem
              key={f.value}
              value={f.value}
              className="h-8 px-3 text-xs data-[state=on]:bg-muted data-[state=on]:text-foreground"
            >
              {f.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 h-full min-h-0">
        {/* Main Builder Area */}
        <ScrollArea className="flex-1 h-100 pr-4">
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
        <div className="lg:w-64 shrink-0 flex flex-col gap-3 border-l lg:pl-6 border-border/50">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <h3 className="text-xs font-semibold uppercase tracking-wider">
              Upcoming Runs
            </h3>
          </div>

          <div className="space-y-2">
            {upcomingExecutions.length > 0 ? (
              upcomingExecutions.map((execution) => (
                <div
                  key={execution.key}
                  className="flex flex-col gap-0.5 rounded-md border bg-card/50 p-2.5 text-sm shadow-sm"
                >
                  <span className="font-medium text-foreground">
                    {execution.date}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    at {execution.time}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No upcoming runs scheduled
              </p>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground text-right">
            Timezone: {timezone}
          </div>
        </div>
      </div>
    </div>
  );
}
