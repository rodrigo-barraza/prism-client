/**
 * Calendar day-matching for cron tasks.
 *
 * The scheduled-task calendar puts a cron task on a day when
 * `doesCronMatchDate` says it runs that day. The scheduler that actually runs
 * it is prism-service's `matchCron` (`src/services/ScheduledTaskService.ts`),
 * which follows crontab(5); these cases mirror its table
 * (`src/services/__tests__/cronMatcher.test.ts`) at day granularity, so the
 * calendar shows a task on exactly the days it fires.
 *
 * Dates are local calendar days, as the calendar grid builds them.
 */
import { describe, expect, it } from "vitest";
import { doesCronMatchDate, parseCronExpression } from "../cronMatcher";

/** Local midnight of a `YYYY-MM-DD` day. */
function localDay(isoDate: string): Date {
  const [year, month, dayOfMonth] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, dayOfMonth);
}

interface DayCase {
  name: string;
  expression: string;
  /** Days the task runs on. */
  runs: string[];
  /** Days it does not. */
  skips: string[];
}

function runTable(cases: DayCase[]): void {
  for (const testCase of cases) {
    it(`${testCase.expression} — ${testCase.name}`, () => {
      const candidates = [...testCase.runs, ...testCase.skips];
      const matching = candidates.filter((isoDate) =>
        doesCronMatchDate(testCase.expression, localDay(isoDate)),
      );
      expect(matching).toEqual(testCase.runs);
    });
  }
}

describe("doesCronMatchDate — crontab(5) day matching", () => {
  describe("steps on 1-based fields start at 1", () => {
    runTable([
      {
        name: "day-of-month */2 is the odd days: the 1st and 3rd, the 31st and the next 1st",
        expression: "0 0 */2 * *",
        runs: ["2026-06-01", "2026-06-03", "2026-01-31", "2026-02-01"],
        skips: ["2026-06-02", "2026-06-30"],
      },
      {
        name: "month */3 is January, April, July, October",
        expression: "0 0 1 */3 *",
        runs: ["2026-01-01", "2026-04-01", "2026-07-01", "2026-10-01"],
        skips: ["2026-03-01", "2026-02-01", "2026-12-01", "2026-04-02"],
      },
    ]);
  });

  describe("steps stop at the range's end; a bare start runs to the field's end", () => {
    runTable([
      {
        name: "days 1, 4, 7, 10 — not 13",
        expression: "0 0 1-10/3 * *",
        runs: ["2026-06-01", "2026-06-04", "2026-06-07", "2026-06-10"],
        skips: ["2026-06-02", "2026-06-11", "2026-06-13", "2026-06-16"],
      },
      {
        name: "10/5 is days 10, 15, 20, 25, 30",
        expression: "0 0 10/5 * *",
        runs: [
          "2026-06-10",
          "2026-06-15",
          "2026-06-20",
          "2026-06-25",
          "2026-06-30",
        ],
        skips: ["2026-06-05", "2026-06-11"],
      },
    ]);
  });

  describe("day-of-month and day-of-week", () => {
    runTable([
      {
        name: "both restricted: the 1st OR a Monday",
        expression: "0 9 1 * 1",
        // Mon 1 Jun; Mon 29 Jun; Tue 30 Jun; Wed 1 Jul; Thu 2 Jul.
        runs: ["2026-06-01", "2026-06-29", "2026-07-01"],
        skips: ["2026-06-30", "2026-07-02"],
      },
      {
        name: "a star-prefixed day field is unrestricted: odd days AND Mondays",
        expression: "0 9 */2 * 1",
        // Mondays 8 (even), 15, 29 Jun; Wed 3 Jun (odd, not a Monday).
        runs: ["2026-06-15", "2026-06-29"],
        skips: ["2026-06-08", "2026-06-03"],
      },
      {
        name: "7 is Sunday",
        expression: "0 0 * * 7",
        runs: ["2026-06-07", "2026-06-14"],
        skips: ["2026-06-06", "2026-06-08"],
      },
      {
        name: "a range ending in 7 includes Sunday",
        expression: "0 0 * * 5-7",
        runs: ["2026-06-05", "2026-06-06", "2026-06-07"],
        skips: ["2026-06-08", "2026-06-04"],
      },
    ]);
  });

  describe("month and weekday names", () => {
    runTable([
      {
        name: "weekday name range",
        expression: "0 9 * * MON-FRI",
        runs: [
          "2026-06-08",
          "2026-06-09",
          "2026-06-10",
          "2026-06-11",
          "2026-06-12",
        ],
        skips: ["2026-06-13", "2026-06-14"],
      },
      {
        name: "weekday names are case-insensitive",
        expression: "0 0 * * sun",
        runs: ["2026-06-07"],
        skips: ["2026-06-08"],
      },
      {
        name: "month names in a list",
        expression: "0 0 1 JAN,jul *",
        runs: ["2026-01-01", "2026-07-01"],
        skips: ["2026-02-01", "2026-07-02"],
      },
    ]);
  });

  // Every expression seeded, defaulted or documented for `cronExpression`
  // (the scheduled-tasks form default and placeholder, tools-service's
  // delayToCron, the create_cron_job example) — none may move.
  describe("stored and documented expressions keep their days", () => {
    runTable([
      {
        name: "form default — every day",
        expression: "0 9 * * *",
        runs: ["2026-06-01", "2026-06-02", "2026-06-07"],
        skips: [],
      },
      {
        name: "placeholder — every day",
        expression: "* * * * *",
        runs: ["2026-06-01", "2026-06-02"],
        skips: [],
      },
      {
        name: "every five minutes — every day",
        expression: "*/5 * * * *",
        runs: ["2026-06-01", "2026-06-02"],
        skips: [],
      },
      {
        name: "delayToCron('6h') — every day",
        expression: "0 */6 * * *",
        runs: ["2026-06-01", "2026-06-02"],
        skips: [],
      },
      {
        name: "delayToCron('90m') — every day",
        expression: "*/90 * * * *",
        runs: ["2026-06-01", "2026-06-02"],
        skips: [],
      },
      {
        name: "delayToCron('3d') — days 1, 4, 7",
        expression: "0 0 */3 * *",
        runs: ["2026-06-01", "2026-06-04", "2026-06-07"],
        skips: ["2026-06-02", "2026-06-03", "2026-06-06"],
      },
      {
        name: "the 1st of every month",
        expression: "0 9 1 * *",
        runs: ["2026-06-01", "2026-07-01"],
        skips: ["2026-06-02"],
      },
    ]);
  });

  describe("malformed expressions never match", () => {
    // Monday 1 Jun 2026 — every field below would otherwise match.
    const monday = localDay("2026-06-01");
    it.each([
      "61 * * * *",
      "* 24 * * *",
      "* * 0 * *",
      "* * * 13 *",
      "* * * * 8",
      "*/0 * * * *",
      "5-1 * * * *",
      "1-2-3 * * * *",
      "1/2/3 * * * *",
      "1x * * * *",
      "* * 1x * *",
      "* * * * * *",
      "@daily",
    ])("%s is rejected", (expression) => {
      expect(doesCronMatchDate(expression, monday)).toBe(false);
    });
  });
});

// The calendar's time label and hour grid read the minute and hour fields
// through the same parser.
describe("parseCronExpression", () => {
  it("lists each field's values ascending, Sunday folded to 0", () => {
    expect(parseCronExpression("30,0 18,6 1-10/3 */3 5-7")).toEqual({
      minutes: [0, 30],
      hours: [6, 18],
      daysOfMonth: [1, 4, 7, 10],
      months: [1, 4, 7, 10],
      daysOfWeek: [0, 5, 6],
      isEitherDayEnough: true,
    });
  });

  it("runs a bare start with a step to the field's end", () => {
    expect(parseCronExpression("0 5/6 * * *")?.hours).toEqual([5, 11, 17, 23]);
  });

  it("marks a star-prefixed day field as unrestricted", () => {
    expect(parseCronExpression("0 9 */2 * 1")?.isEitherDayEnough).toBe(false);
  });

  // A zero step looped forever in the calendar's old field parser, freezing
  // the page on any task whose expression carried one.
  it.each(["*/0 * * * *", "* */0 * * *", "* * */0 * *"])(
    "%s is rejected, not looped on",
    (expression) => {
      expect(parseCronExpression(expression)).toBeNull();
      expect(doesCronMatchDate(expression, localDay("2026-06-01"))).toBe(false);
    },
  );
});
