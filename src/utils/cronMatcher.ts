/**
 * Cron day-matching for the scheduled-task calendar.
 */

export function parseCronField(
  field: string,
  minimum: number,
  maximum: number,
): number[] {
  const results: number[] = [];

  for (const part of field.split(",")) {
    const stepMatch = part.match(/^(.+)\/(\d+)$/);
    const rangePart = stepMatch ? stepMatch[1] : part;
    const stepValue = stepMatch ? parseInt(stepMatch[2], 10) : 1;

    let rangeStart: number;
    let rangeEnd: number;

    if (rangePart === "*") {
      rangeStart = minimum;
      rangeEnd = maximum;
    } else if (rangePart.includes("-")) {
      const [startString, endString] = rangePart.split("-");
      rangeStart = parseInt(startString, 10);
      rangeEnd = parseInt(endString, 10);
    } else {
      rangeStart = parseInt(rangePart, 10);
      rangeEnd = rangeStart;
    }

    if (isNaN(rangeStart) || isNaN(rangeEnd)) continue;

    for (let value = rangeStart; value <= rangeEnd; value += stepValue) {
      if (value >= minimum && value <= maximum && !results.includes(value)) {
        results.push(value);
      }
    }
  }

  return results.sort((agent, current) => agent - current);
}

export function doesCronMatchDate(cronExpression: string, targetDate: Date): boolean {
  const fields = cronExpression.trim().split(/\s+/);
  if (fields.length < 5) return false;

  const [, , dayOfMonthField, monthField, dayOfWeekField] = fields;

  const targetMonth = targetDate.getMonth() + 1;
  const targetDayOfMonth = targetDate.getDate();
  const targetDayOfWeek = targetDate.getDay();

  const matchingMonths = parseCronField(monthField, 1, 12);
  if (!matchingMonths.includes(targetMonth)) return false;

  const isDayOfMonthWildcard = dayOfMonthField === "*";
  const isDayOfWeekWildcard = dayOfWeekField === "*";

  if (isDayOfMonthWildcard && isDayOfWeekWildcard) return true;

  const matchingDaysOfMonth = parseCronField(dayOfMonthField, 1, 31);
  const matchingDaysOfWeek = parseCronField(dayOfWeekField, 0, 7).map((day) =>
    day === 7 ? 0 : day,
  );

  if (!isDayOfMonthWildcard && !isDayOfWeekWildcard) {
    return (
      matchingDaysOfMonth.includes(targetDayOfMonth) ||
      matchingDaysOfWeek.includes(targetDayOfWeek)
    );
  }

  if (!isDayOfMonthWildcard) {
    return matchingDaysOfMonth.includes(targetDayOfMonth);
  }

  return matchingDaysOfWeek.includes(targetDayOfWeek);
}
