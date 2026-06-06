import type { ScheduleSettings } from "../../repositories/settings";

const WEEKDAY_INDEX: Record<string, number> = {
    Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
};

function toMinutes(hhmm: string): number {
    const [h, m] = hhmm.split(":").map((v) => parseInt(v, 10));
    return (h || 0) * 60 + (m || 0);
}

function zonedParts(date: Date, timeZone: string): { dow: number; minutes: number } {
    const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone, hour12: false, weekday: "short", hour: "2-digit", minute: "2-digit",
    });
    const parts = fmt.formatToParts(date);
    const value = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    let hour = parseInt(value("hour"), 10);
    if (hour === 24) hour = 0;
    return {
        dow: WEEKDAY_INDEX[value("weekday")] ?? 0,
        minutes: hour * 60 + parseInt(value("minute"), 10),
    };
}

function zonedYMD(date: Date, timeZone: string): { y: number; mo: number; d: number } {
    const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    });
    const parts = fmt.formatToParts(date);
    const value = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);
    return { y: value("year"), mo: value("month") - 1, d: value("day") };
}

function tzOffsetMs(timeZone: string, date: Date): number {
    const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const parts = fmt.formatToParts(date);
    const value = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);
    let hour = value("hour");
    if (hour === 24) hour = 0;
    const asUtc = Date.UTC(value("year"), value("month") - 1, value("day"), hour, value("minute"), value("second"));
    return asUtc - date.getTime();
}

function zonedTimeToUtc(timeZone: string, y: number, mo: number, d: number, h: number, mi: number): Date {
    const guess = Date.UTC(y, mo, d, h, mi);
    let utc = guess - tzOffsetMs(timeZone, new Date(guess));
    utc = guess - tzOffsetMs(timeZone, new Date(utc));
    return new Date(utc);
}

function mondayIndex(utcDay: number): number {
    return (utcDay + 6) % 7;
}

export function isWithinSchedule(schedule: ScheduleSettings, date: Date = new Date()): boolean {
    if (!schedule.enabled) return true;
    const { dow, minutes } = zonedParts(date, schedule.timezone);
    const day = schedule.days[dow];
    if (!day || !day.enabled) return false;
    const start = toMinutes(day.start);
    const end = toMinutes(day.end);
    return start < end && minutes >= start && minutes < end;
}

export function nextScheduleOpen(schedule: ScheduleSettings, from: Date = new Date()): Date | null {
    if (!schedule.enabled || isWithinSchedule(schedule, from)) return from;
    const { y, mo, d } = zonedYMD(from, schedule.timezone);
    for (let i = 0; i < 8; i++) {
        const cal = new Date(Date.UTC(y, mo, d + i));
        const day = schedule.days[mondayIndex(cal.getUTCDay())];
        if (!day || !day.enabled) continue;
        const start = toMinutes(day.start);
        if (start >= toMinutes(day.end)) continue;
        const open = zonedTimeToUtc(
            schedule.timezone, cal.getUTCFullYear(), cal.getUTCMonth(), cal.getUTCDate(),
            Math.floor(start / 60), start % 60,
        );
        if (open.getTime() >= from.getTime()) return open;
    }
    return null;
}
