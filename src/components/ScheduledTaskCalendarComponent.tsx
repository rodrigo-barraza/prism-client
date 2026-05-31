"use client";

import React, { useState, useMemo, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  X,
  CalendarDays,
} from "lucide-react";
import styles from "./ScheduledTaskCalendarComponent.module.css";

interface ScheduledTask {
  id: string;
  name: string;
  scheduleType: "hourly" | "daily" | "weekly" | "cron" | "trigger" | "once" | "custom";
  scheduleTime?: string;
  scheduleDay?: number;
  scheduleDate?: string;
  cronExpression?: string;
  recurrenceRule?: {
    frequency: "daily" | "weekly" | "monthly" | "yearly";
    interval: number;
    startDate?: string;
    weekdays?: number[];
    monthlyType?: "dayOfMonth" | "nthDayOfWeek";
    dayOfMonth?: number;
    nthDayOfWeek?: {
      occurrence: 1 | 2 | 3 | 4 | -1;
      dayOfWeek: number;
    };
    yearlyType?: "specificDate" | "nthDayOfWeek";
    months?: number[];
  };
  enabled: boolean;
  createdAt?: string;
}

interface CalendarEvent {
  taskId: string;
  taskName: string;
  scheduleType: ScheduledTask["scheduleType"];
  timeLabel: string;
  isEnabled: boolean;
}

interface CalendarDay {
  date: Date;
  dayOfMonth: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  events: CalendarEvent[];
}

interface ScheduledTaskCalendarComponentProps {
  tasks: ScheduledTask[];
  onEventClick?: (taskId: string) => void;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const MAX_VISIBLE_EVENTS_PER_DAY = 3;

const SCHEDULE_TYPE_KEYS: ScheduledTask["scheduleType"][] = [
  "hourly",
  "daily",
  "weekly",
  "cron",
  "once",
  "custom",
  "trigger",
];

function getColorVariantClassName(scheduleType: string): string {
  const classNameMap: Record<string, string> = {
    hourly: styles["is-color-hourly"],
    daily: styles["is-color-daily"],
    weekly: styles["is-color-weekly"],
    cron: styles["is-color-cron"],
    once: styles["is-color-once"],
    custom: styles["is-color-custom"],
    trigger: styles["is-color-trigger"],
  };
  return classNameMap[scheduleType] || "";
}

function formatTimeFromSchedule(scheduleTime?: string): string {
  if (!scheduleTime) return "";
  const [hours, minutes] = scheduleTime.split(":").map(Number);
  const meridiem = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${String(minutes).padStart(2, "0")} ${meridiem}`;
}

function parseCronField(
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

  return results.sort((a, b) => a - b);
}

function doesCronMatchDate(cronExpression: string, targetDate: Date): boolean {
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

function getCronTimeLabel(cronExpression: string): string {
  const fields = cronExpression.trim().split(/\s+/);
  if (fields.length < 5) return "Cron";

  const [minuteField, hourField] = fields;

  const matchingMinutes = parseCronField(minuteField, 0, 59);
  const matchingHours = parseCronField(hourField, 0, 23);

  if (matchingHours.length === 24) return "All day";
  if (matchingHours.length === 0) return "Cron";

  const firstHour = matchingHours[0];
  const firstMinute = matchingMinutes.length > 0 ? matchingMinutes[0] : 0;
  const meridiem = firstHour >= 12 ? "PM" : "AM";
  const displayHour = firstHour % 12 || 12;
  return `${displayHour}:${String(firstMinute).padStart(2, "0")} ${meridiem}`;
}

function getEventsForDate(
  tasks: ScheduledTask[],
  targetDate: Date,
): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  for (const task of tasks) {
    let matchesDate = false;
    let timeLabel = "";

    switch (task.scheduleType) {
      case "hourly":
        matchesDate = true;
        timeLabel = "Every hour";
        break;

      case "daily":
        matchesDate = true;
        timeLabel = formatTimeFromSchedule(task.scheduleTime);
        break;

      case "weekly": {
        const targetDayOfWeek = targetDate.getDay();
        matchesDate = targetDayOfWeek === (task.scheduleDay ?? 1);
        timeLabel = formatTimeFromSchedule(task.scheduleTime);
        break;
      }

      case "cron":
        if (task.cronExpression) {
          matchesDate = doesCronMatchDate(task.cronExpression, targetDate);
          timeLabel = getCronTimeLabel(task.cronExpression);
        }
        break;

      case "once": {
        if (task.scheduleDate) {
          const [year, month, day] = task.scheduleDate.split("-").map(Number);
          matchesDate =
              targetDate.getFullYear() === year &&
              targetDate.getMonth() === month - 1 &&
              targetDate.getDate() === day;
          timeLabel = formatTimeFromSchedule(task.scheduleTime);
        }
        break;
      }

      case "custom": {
        if (task.recurrenceRule) {
          const rule = task.recurrenceRule;
          const startDateInput = task.createdAt ? new Date(task.createdAt) : new Date();
          
          const startDate = new Date(
            startDateInput.getFullYear(),
            startDateInput.getMonth(),
            startDateInput.getDate()
          );
          const targetDateNormalized = new Date(
            targetDate.getFullYear(),
            targetDate.getMonth(),
            targetDate.getDate()
          );

          if (targetDateNormalized.getTime() >= startDate.getTime()) {
            const interval = Math.max(1, rule.interval);
            const freq = rule.frequency;

            if (freq === "daily") {
              const differenceInMs = targetDateNormalized.getTime() - startDate.getTime();
              const differenceInDays = Math.floor(differenceInMs / (24 * 60 * 60 * 1000));
              matchesDate = differenceInDays % interval === 0;
            } else if (freq === "weekly") {
              const startSunday = new Date(startDate);
              startSunday.setDate(startDate.getDate() - startDate.getDay());

              const targetSunday = new Date(targetDateNormalized);
              targetSunday.setDate(targetDateNormalized.getDate() - targetDateNormalized.getDay());

              const differenceInMs = targetSunday.getTime() - startSunday.getTime();
              const differenceInWeeks = Math.floor(differenceInMs / (7 * 24 * 60 * 60 * 1000));

              if (differenceInWeeks % interval === 0) {
                if (!rule.weekdays || rule.weekdays.length === 0) {
                  matchesDate = targetDateNormalized.getDay() === startDate.getDay();
                } else {
                  matchesDate = rule.weekdays.includes(targetDateNormalized.getDay());
                }
              }
            } else if (freq === "monthly") {
              const differenceInMonths =
                (targetDateNormalized.getFullYear() - startDate.getFullYear()) * 12 +
                (targetDateNormalized.getMonth() - startDate.getMonth());

              if (differenceInMonths % interval === 0) {
                if (rule.monthlyType === "nthDayOfWeek" && rule.nthDayOfWeek) {
                  const nthRule = rule.nthDayOfWeek;
                  if (targetDateNormalized.getDay() === nthRule.dayOfWeek) {
                    const occurrence = nthRule.occurrence;
                    const dayOfMonth = targetDateNormalized.getDate();
                    if (occurrence > 0) {
                      const startRange = (occurrence - 1) * 7 + 1;
                      const endRange = occurrence * 7;
                      matchesDate = dayOfMonth >= startRange && dayOfMonth <= endRange;
                    } else if (occurrence === -1) {
                      const lastDayOfMonth = new Date(
                        targetDateNormalized.getFullYear(),
                        targetDateNormalized.getMonth() + 1,
                        0
                      ).getDate();
                      matchesDate = dayOfMonth >= lastDayOfMonth - 6 && dayOfMonth <= lastDayOfMonth;
                    }
                  }
                } else {
                  const dayOfMonthRule = rule.dayOfMonth ?? 1;
                  if (dayOfMonthRule === -1) {
                    const nextDay = new Date(
                      targetDateNormalized.getFullYear(),
                      targetDateNormalized.getMonth(),
                      targetDateNormalized.getDate() + 1
                    );
                    matchesDate = nextDay.getMonth() !== targetDateNormalized.getMonth();
                  } else {
                    matchesDate = targetDateNormalized.getDate() === dayOfMonthRule;
                  }
                }
              }
            } else if (freq === "yearly") {
              const differenceInYears = targetDateNormalized.getFullYear() - startDate.getFullYear();

              if (differenceInYears % interval === 0) {
                const activeMonths = rule.months || [startDate.getMonth() + 1];
                const targetMonthOneIndexed = targetDateNormalized.getMonth() + 1;

                if (activeMonths.includes(targetMonthOneIndexed)) {
                  if (rule.yearlyType === "nthDayOfWeek" && rule.nthDayOfWeek) {
                    const nthRule = rule.nthDayOfWeek;
                    if (targetDateNormalized.getDay() === nthRule.dayOfWeek) {
                      const occurrence = nthRule.occurrence;
                      const dayOfMonth = targetDateNormalized.getDate();
                      if (occurrence > 0) {
                        const startRange = (occurrence - 1) * 7 + 1;
                        const endRange = occurrence * 7;
                        matchesDate = dayOfMonth >= startRange && dayOfMonth <= endRange;
                      } else if (occurrence === -1) {
                        const lastDayOfMonth = new Date(
                          targetDateNormalized.getFullYear(),
                          targetDateNormalized.getMonth() + 1,
                          0
                        ).getDate();
                        matchesDate = dayOfMonth >= lastDayOfMonth - 6 && dayOfMonth <= lastDayOfMonth;
                      }
                    }
                  } else {
                    const dayOfMonthRule = rule.dayOfMonth ?? 1;
                    if (dayOfMonthRule === -1) {
                      const nextDay = new Date(
                        targetDateNormalized.getFullYear(),
                        targetDateNormalized.getMonth(),
                        targetDateNormalized.getDate() + 1
                      );
                      matchesDate = nextDay.getMonth() !== targetDateNormalized.getMonth();
                    } else {
                      matchesDate = targetDateNormalized.getDate() === dayOfMonthRule;
                    }
                  }
                }
              }
            }
          }
          timeLabel = formatTimeFromSchedule(task.scheduleTime);
        }
        break;
      }

      case "trigger":
        break;
    }

    if (matchesDate) {
      events.push({
        taskId: task.id,
        taskName: task.name,
        scheduleType: task.scheduleType,
        timeLabel,
        isEnabled: task.enabled,
      });
    }
  }

  return events;
}

function buildCalendarGrid(
  year: number,
  month: number,
  tasks: ScheduledTask[],
): CalendarDay[] {
  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth();
  const todayDate = today.getDate();

  const firstDayOfMonth = new Date(year, month, 1);
  const startDayOfWeek = firstDayOfMonth.getDay();
  const calendarStartDate = new Date(year, month, 1 - startDayOfWeek);

  const totalCells = 42;
  const calendarDays: CalendarDay[] = [];

  for (let cellIndex = 0; cellIndex < totalCells; cellIndex++) {
    const currentDate = new Date(calendarStartDate);
    currentDate.setDate(calendarStartDate.getDate() + cellIndex);

    const isCurrentMonth =
        currentDate.getMonth() === month && currentDate.getFullYear() === year;
    const isToday =
        currentDate.getFullYear() === todayYear &&
        currentDate.getMonth() === todayMonth &&
        currentDate.getDate() === todayDate;

    calendarDays.push({
      date: currentDate,
      dayOfMonth: currentDate.getDate(),
      isCurrentMonth,
      isToday,
      events: isCurrentMonth ? getEventsForDate(tasks, currentDate) : [],
    });
  }

  return calendarDays;
}

function formatPopoverDateLabel(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function classNames(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(" ");
}

export default function ScheduledTaskCalendarComponent({
  tasks,
  onEventClick,
}: ScheduledTaskCalendarComponentProps) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [popoverDayKey, setPopoverDayKey] = useState<string | null>(null);

  const enabledTasks = useMemo(
    () => tasks.filter((task) => task.scheduleType !== "trigger"),
    [tasks],
  );

  const calendarGrid = useMemo(
    () => buildCalendarGrid(viewYear, viewMonth, enabledTasks),
    [viewYear, viewMonth, enabledTasks],
  );

  const activeScheduleTypes = useMemo(() => {
    const typeSet = new Set<string>();
    for (const task of enabledTasks) {
      typeSet.add(task.scheduleType);
    }
    return SCHEDULE_TYPE_KEYS.filter((type) => typeSet.has(type));
  }, [enabledTasks]);

  const navigateToPreviousMonth = useCallback(() => {
    setViewMonth((previousMonth) => {
      if (previousMonth === 0) {
        setViewYear((previousYear) => previousYear - 1);
        return 11;
      }
      return previousMonth - 1;
    });
    setPopoverDayKey(null);
  }, []);

  const navigateToNextMonth = useCallback(() => {
    setViewMonth((previousMonth) => {
      if (previousMonth === 11) {
        setViewYear((previousYear) => previousYear + 1);
        return 0;
      }
      return previousMonth + 1;
    });
    setPopoverDayKey(null);
  }, []);

  const navigateToPreviousYear = useCallback(() => {
    setViewYear((previousYear) => previousYear - 1);
    setPopoverDayKey(null);
  }, []);

  const navigateToNextYear = useCallback(() => {
    setViewYear((previousYear) => previousYear + 1);
    setPopoverDayKey(null);
  }, []);

  const navigateToToday = useCallback(() => {
    const currentDate = new Date();
    setViewYear(currentDate.getFullYear());
    setViewMonth(currentDate.getMonth());
    setPopoverDayKey(null);
  }, []);

  return (
    <div className={styles["calendar-container"]}>
      {/* ── Header Navigation ── */}
      <header className={styles["calendar-header"]}>
        <nav className={styles["calendar-navigation-group"]}>
          <button
            className={styles["calendar-navigation-button"]}
            onClick={navigateToPreviousYear}
            title="Previous year"
            aria-label="Navigate to previous year"
          >
            <ChevronsLeft size={16} />
          </button>
          <button
            className={styles["calendar-navigation-button"]}
            onClick={navigateToPreviousMonth}
            title="Previous month"
            aria-label="Navigate to previous month"
          >
            <ChevronLeft size={16} />
          </button>
        </nav>

        <div className={styles["calendar-title-group"]}>
          <span className={styles["calendar-month-label"]}>
            {MONTH_NAMES[viewMonth]}
          </span>
          <span className={styles["calendar-year-label"]}>{viewYear}</span>
        </div>

        <nav className={styles["calendar-navigation-group"]}>
          <button
            className={styles["calendar-today-button"]}
            onClick={navigateToToday}
            title="Jump to today"
          >
            <CalendarDays size={12} />
            <span>Today</span>
          </button>
          <button
            className={styles["calendar-navigation-button"]}
            onClick={navigateToNextMonth}
            title="Next month"
            aria-label="Navigate to next month"
          >
            <ChevronRight size={16} />
          </button>
          <button
            className={styles["calendar-navigation-button"]}
            onClick={navigateToNextYear}
            title="Next year"
            aria-label="Navigate to next year"
          >
            <ChevronsRight size={16} />
          </button>
        </nav>
      </header>

      {/* ── Weekday Labels ── */}
      <div className={styles["calendar-weekday-row"]}>
        {WEEKDAY_LABELS.map((dayLabel) => (
          <div key={dayLabel} className={styles["calendar-weekday-cell"]}>
            {dayLabel}
          </div>
        ))}
      </div>

      {/* ── Days Grid ── */}
      <div className={styles["calendar-days-grid"]}>
        {calendarGrid.map((calendarDay) => {
          const dayKey = calendarDay.date.toISOString().split("T")[0];
          const isPopoverOpen = popoverDayKey === dayKey;
          const visibleEvents = calendarDay.events.slice(
            0,
            MAX_VISIBLE_EVENTS_PER_DAY,
          );
          const overflowCount =
            calendarDay.events.length - MAX_VISIBLE_EVENTS_PER_DAY;

          return (
            <div
              key={dayKey}
              className={classNames(
                styles["calendar-day-cell"],
                !calendarDay.isCurrentMonth && styles["is-outside-month"],
                calendarDay.isToday && styles["is-today-cell"],
              )}
            >
              <div className={styles["calendar-day-number"]}>
                {calendarDay.dayOfMonth}
              </div>

              {calendarDay.events.length > 0 && (
                <div className={styles["calendar-events-list"]}>
                  {visibleEvents.map((event, eventIndex) => (
                    <div
                      key={`${event.taskId}-${eventIndex}`}
                      className={classNames(
                        styles["calendar-event-chip"],
                        getColorVariantClassName(event.scheduleType),
                        !event.isEnabled && styles["is-disabled-task"],
                      )}
                      title={`${event.taskName}${event.timeLabel ? ` — ${event.timeLabel}` : ""}`}
                      style={{ animationDelay: `${eventIndex * 30}ms`, cursor: "pointer" }}
                      onClick={(clickEvent) => {
                        clickEvent.stopPropagation();
                        onEventClick?.(event.taskId);
                      }}
                    >
                      <span
                        className={classNames(
                          styles["calendar-event-chip-dot"],
                          getColorVariantClassName(event.scheduleType),
                        )}
                      />
                      <span className={styles["calendar-event-chip-label"]}>
                        {event.taskName}
                      </span>
                    </div>
                  ))}

                  {overflowCount > 0 && (
                    <button
                      className={styles["calendar-overflow-badge"]}
                      onClick={(clickEvent) => {
                        clickEvent.stopPropagation();
                        setPopoverDayKey(isPopoverOpen ? null : dayKey);
                      }}
                    >
                      +{overflowCount} more
                    </button>
                  )}
                </div>
              )}

              {/* ── Day Popover ── */}
              {isPopoverOpen && (
                <>
                  <div
                    className={styles["calendar-day-popover-backdrop"]}
                    onClick={() => setPopoverDayKey(null)}
                  />
                  <div className={styles["calendar-day-popover"]}>
                    <div className={styles["calendar-popover-header"]}>
                      <span className={styles["calendar-popover-date-label"]}>
                        {formatPopoverDateLabel(calendarDay.date)}
                      </span>
                      <button
                        className={styles["calendar-popover-close-button"]}
                        onClick={() => setPopoverDayKey(null)}
                        aria-label="Close popover"
                      >
                        <X size={12} />
                      </button>
                    </div>
                    <div className={styles["calendar-popover-events-list"]}>
                      {calendarDay.events.map((event, eventIndex) => (
                        <div
                          key={`${event.taskId}-${eventIndex}`}
                          className={classNames(
                            styles["calendar-popover-event-item"],
                            !event.isEnabled && styles["is-disabled-task"],
                          )}
                          onClick={() => {
                            setPopoverDayKey(null);
                            onEventClick?.(event.taskId);
                          }}
                          style={{ cursor: "pointer" }}
                        >
                          <span
                            className={classNames(
                              styles["calendar-popover-event-dot"],
                              getColorVariantClassName(event.scheduleType),
                            )}
                          />
                          <span
                            className={styles["calendar-popover-event-name"]}
                          >
                            {event.taskName}
                          </span>
                          {event.timeLabel && (
                            <span
                              className={styles["calendar-popover-event-time"]}
                            >
                              {event.timeLabel}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Legend ── */}
      {activeScheduleTypes.length > 0 && (
        <footer className={styles["calendar-legend-bar"]}>
          {activeScheduleTypes.map((scheduleType) => (
            <div key={scheduleType} className={styles["calendar-legend-item"]}>
              <span
                className={classNames(
                  styles["calendar-legend-dot"],
                  getColorVariantClassName(scheduleType),
                )}
              />
              <span>
                {scheduleType.charAt(0).toUpperCase() + scheduleType.slice(1)}
              </span>
            </div>
          ))}
        </footer>
      )}
    </div>
  );
}
