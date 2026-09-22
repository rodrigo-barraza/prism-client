/**
 * Cron expressions for the scheduled-task calendar (5-field, crontab(5)).
 *
 * Mirrors prism-service's scheduler — `parseCronValue`, `expandCronField` and
 * `matchCron` in `src/services/ScheduledTaskService.ts`. The calendar must put
 * a cron task on exactly the days that function runs it, so keep the two in
 * step: a change to one side's field grammar is a change to both.
 *
 * - `a-b/n` stops at `b`; `a/n` runs from `a` to the field's end.
 * - `*` (and `*` + `/n`) starts at the field's minimum, so on the 1-based
 *   fields every 2nd day of the month is 1, 3, 5, … and every 3rd month is
 *   January, April, July, October.
 * - Day of month and day of week are ORed when both are restricted (neither
 *   starts with `*`); otherwise both must match.
 * - Day of week `7` is Sunday; JAN–DEC and SUN–SAT are accepted in any case.
 * - A malformed field makes the whole expression never match.
 */

interface CronFieldBounds {
  min: number;
  max: number;
  /** Three-letter names the field accepts (case-insensitive). */
  names?: ReadonlyMap<string, number>;
}

const CRON_MONTH_NAMES: ReadonlyMap<string, number> = new Map(
  "jan feb mar apr may jun jul aug sep oct nov dec"
    .split(" ")
    .map((name, index) => [name, index + 1]),
);

const CRON_WEEKDAY_NAMES: ReadonlyMap<string, number> = new Map(
  "sun mon tue wed thu fri sat".split(" ").map((name, index) => [name, index]),
);

/** minute, hour, day of month, month, day of week (0 and 7 are Sunday). */
const CRON_FIELD_BOUNDS: readonly CronFieldBounds[] = [
  { min: 0, max: 59 },
  { min: 0, max: 23 },
  { min: 1, max: 31 },
  { min: 1, max: 12, names: CRON_MONTH_NAMES },
  { min: 0, max: 7, names: CRON_WEEKDAY_NAMES },
];

const CRON_NUMBER = /^\d+$/;

function parseCronValue(token: string, bounds: CronFieldBounds): number | null {
  const named = bounds.names?.get(token.toLowerCase());
  if (named !== undefined) return named;
  if (!CRON_NUMBER.test(token)) return null;
  const value = Number(token);
  return value >= bounds.min && value <= bounds.max ? value : null;
}

/**
 * Expands one field (`*`, `a`, `a-b`, any of those `/n`, comma lists) into the
 * values it allows, or null when it is malformed.
 */
function expandCronField(
  field: string,
  bounds: CronFieldBounds,
): Set<number> | null {
  const values = new Set<number>();
  for (const item of field.split(",")) {
    const [range, stepToken, ...extraSteps] = item.split("/");
    if (extraSteps.length > 0) return null;

    let step = 1;
    if (stepToken !== undefined) {
      if (!CRON_NUMBER.test(stepToken)) return null;
      step = Number(stepToken);
      if (step === 0) return null;
    }

    let start: number;
    let end: number;
    if (range === "*") {
      start = bounds.min;
      end = bounds.max;
    } else {
      const [startToken, endToken, ...extraBounds] = range.split("-");
      if (extraBounds.length > 0) return null;
      const parsedStart = parseCronValue(startToken, bounds);
      if (parsedStart === null) return null;
      start = parsedStart;
      if (endToken !== undefined) {
        const parsedEnd = parseCronValue(endToken, bounds);
        if (parsedEnd === null || parsedEnd < start) return null;
        end = parsedEnd;
      } else {
        end = stepToken !== undefined ? bounds.max : start;
      }
    }

    for (let value = start; value <= end; value += step) values.add(value);
  }
  return values;
}

/** The values each field of a valid expression allows, ascending. */
export interface CronSchedule {
  minutes: number[];
  hours: number[];
  daysOfMonth: number[];
  months: number[];
  /** 0–6 with Sunday as 0 (a `7` in the expression is folded in). */
  daysOfWeek: number[];
  /** Both day fields restricted: a day matching EITHER one runs. */
  isEitherDayEnough: boolean;
}

function sortedValues(values: Set<number>): number[] {
  return [...values].sort((left, right) => left - right);
}

/** Parses a 5-field cron expression, or null when it is malformed. */
export function parseCronExpression(expression: string): CronSchedule | null {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== CRON_FIELD_BOUNDS.length) return null;

  const allowed: Set<number>[] = [];
  for (const [index, field] of fields.entries()) {
    const values = expandCronField(field, CRON_FIELD_BOUNDS[index]);
    if (!values) return null;
    allowed.push(values);
  }
  const [minutes, hours, daysOfMonth, months, daysOfWeek] = allowed;
  if (daysOfWeek.delete(7)) daysOfWeek.add(0);

  return {
    minutes: sortedValues(minutes),
    hours: sortedValues(hours),
    daysOfMonth: sortedValues(daysOfMonth),
    months: sortedValues(months),
    daysOfWeek: sortedValues(daysOfWeek),
    isEitherDayEnough: !fields[2].startsWith("*") && !fields[4].startsWith("*"),
  };
}

/**
 * Whether a cron task runs at some minute of `targetDate`'s local calendar
 * day — `matchCron`'s day, month and day-of-week test. A valid minute and hour
 * field always allows at least one time, so only validity is checked there.
 */
export function doesCronMatchDate(
  cronExpression: string,
  targetDate: Date,
): boolean {
  const schedule = parseCronExpression(cronExpression);
  if (!schedule) return false;
  if (!schedule.months.includes(targetDate.getMonth() + 1)) return false;

  const dayOfMonthMatches = schedule.daysOfMonth.includes(targetDate.getDate());
  const dayOfWeekMatches = schedule.daysOfWeek.includes(targetDate.getDay());
  return schedule.isEitherDayEnough
    ? dayOfMonthMatches || dayOfWeekMatches
    : dayOfMonthMatches && dayOfWeekMatches;
}
