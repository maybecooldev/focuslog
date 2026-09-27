/** Aggregation over sessions. Pure functions -- no I/O, easy to test. */

import { dayKey, daysBetween, startOfDay } from './dates.ts';
import { durationMinutes, type Session } from './store.ts';

/** Minutes focused per local day, as a dayKey -> minutes map. */
export function minutesByDay(sessions: Session[], now = new Date()): Map<string, number> {
	const totals = new Map<string, number>();
	for (const s of sessions) {
		const minutes = durationMinutes(s, now);
		if (minutes <= 0) continue;
		const key = dayKey(s.start);
		totals.set(key, (totals.get(key) ?? 0) + minutes);
	}
	return totals;
}

export function totalMinutes(sessions: Session[], now = new Date()): number {
	return sessions.reduce((sum, s) => sum + durationMinutes(s, now), 0);
}

/**
 * Current run of consecutive days with at least one focused minute, counting
 * back from today. Today not being logged yet does not break the streak -- the
 * day is simply still open.
 */
export function currentStreak(totals: Map<string, number>, now = new Date()): number {
	const today = startOfDay(now);

	// Today being empty does not break a streak -- the day is still open. Start
	// counting from yesterday instead so the run survives until midnight.
	let cursor = (totals.get(dayKey(today)) ?? 0) > 0
		? today
		: new Date(today.getTime() - 86_400_000);

	let streak = 0;
	while ((totals.get(dayKey(cursor)) ?? 0) > 0) {
		streak++;
		cursor = new Date(cursor.getTime() - 86_400_000);
	}
	return streak;
}

/** Longest run of consecutive active days anywhere in the history. */
export function bestStreak(totals: Map<string, number>): number {
	const days = [...totals.entries()]
		.filter(([, m]) => m > 0)
		.map(([k]) => k)
		.sort();
	if (days.length === 0) return 0;

	let best = 1;
	let run = 1;
	for (let i = 1; i < days.length; i++) {
		const prev = new Date(`${days[i - 1]}T00:00:00`);
		const cur = new Date(`${days[i]}T00:00:00`);
		if (daysBetween(prev, cur) === 1) {
			run++;
			best = Math.max(best, run);
		} else {
			run = 1;
		}
	}
	return best;
}
