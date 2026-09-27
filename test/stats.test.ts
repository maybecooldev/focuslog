import { test } from 'node:test';
import assert from 'node:assert/strict';

import { levelFor, buildGrid } from '../src/heatmap.ts';
import { bestStreak, currentStreak, minutesByDay, totalMinutes } from '../src/stats.ts';
import { dayKey, formatMinutes } from '../src/dates.ts';
import { toSessions, type Record_ } from '../src/store.ts';

/** Build sessions from `YYYY-MM-DD HH:MM` strings in local time. */
function session(start: string, minutes: number, note: string | null = null) {
	const s = new Date(start.replace(' ', 'T'));
	const e = new Date(s.getTime() + minutes * 60_000);
	return toSessions([
		{ type: 'start', id: `${start}-${minutes}`, at: s.toISOString(), note },
		{ type: 'stop', id: `${start}-${minutes}`, at: e.toISOString() },
	])[0]!;
}

test('levels step at the documented thresholds', () => {
	assert.equal(levelFor(0), 0);
	assert.equal(levelFor(0.9), 0);
	assert.equal(levelFor(1), 1);
	assert.equal(levelFor(29), 1);
	assert.equal(levelFor(30), 2);
	assert.equal(levelFor(59), 2);
	assert.equal(levelFor(60), 3);
	assert.equal(levelFor(119), 3);
	assert.equal(levelFor(120), 4);
	assert.equal(levelFor(600), 4);
});

test('minutes are bucketed by the day the session started', () => {
	const sessions = [session('2026-03-10 09:00', 30), session('2026-03-10 14:00', 45)];
	const totals = minutesByDay(sessions, new Date('2026-03-10T18:00:00'));
	assert.equal(totals.get(dayKey(new Date('2026-03-10T12:00:00'))), 75);
});

test('total minutes sums every session', () => {
	const sessions = [session('2026-03-01 09:00', 25), session('2026-03-02 09:00', 50)];
	assert.equal(totalMinutes(sessions), 75);
});

test('an empty history totals zero and has no streak', () => {
	const totals = minutesByDay([]);
	assert.equal(totals.size, 0);
	assert.equal(currentStreak(totals), 0);
	assert.equal(bestStreak(totals), 0);
});

test('consecutive days count as a streak', () => {
	const now = new Date('2026-03-10T12:00:00');
	const totals = minutesByDay([
		session('2026-03-08 09:00', 30),
		session('2026-03-09 09:00', 30),
		session('2026-03-10 09:00', 30),
	], now);
	assert.equal(currentStreak(totals, now), 3);
});

test('an empty today does not break the streak', () => {
	const now = new Date('2026-03-10T08:00:00');
	const totals = minutesByDay([
		session('2026-03-08 09:00', 30),
		session('2026-03-09 09:00', 30),
	], now);
	assert.equal(currentStreak(totals, now), 2);
});

test('a gap ends the streak', () => {
	const now = new Date('2026-03-10T12:00:00');
	const totals = minutesByDay([
		session('2026-03-05 09:00', 30),
		session('2026-03-09 09:00', 30),
	], now);
	assert.equal(currentStreak(totals, now), 1);
});

test('best streak finds the longest historical run', () => {
	const totals = minutesByDay([
		session('2026-01-01 09:00', 30),
		session('2026-01-02 09:00', 30),
		session('2026-01-03 09:00', 30),
		session('2026-01-04 09:00', 30),
		session('2026-01-20 09:00', 30),
		session('2026-01-21 09:00', 30),
	]);
	assert.equal(bestStreak(totals), 4);
});

test('the grid always has the requested number of weeks', () => {
	const grid = buildGrid([], 26, new Date('2026-03-10T12:00:00'));
	assert.equal(grid.weeks.length, 26);
	assert.equal(grid.keys.length, 26);
	for (const week of grid.weeks) assert.equal(week.length, 7);
});

test('the newest column is the week containing today', () => {
	const now = new Date('2026-03-10T12:00:00'); // a Tuesday
	const grid = buildGrid([], 4, now);
	const lastWeek = grid.keys[3]!;
	assert.equal(lastWeek[now.getDay()], dayKey(now));
});

test('a session lands in the cell matching its day', () => {
	const now = new Date('2026-03-10T12:00:00');
	const grid = buildGrid([session('2026-03-09 09:00', 90)], 4, now);

	// Find the cell by its date rather than assuming a column index -- which
	// column "yesterday" lands in depends on the day of the week.
	let found: number | null = null;
	for (let w = 0; w < grid.keys.length; w++) {
		const day = grid.keys[w]!.indexOf('2026-03-09');
		if (day >= 0) found = grid.weeks[w]![day]!;
	}

	assert.equal(found, 90);
	assert.equal(levelFor(90), 3);

	// Nothing else in the window should carry those minutes.
	const total = grid.weeks.flat().reduce((a, b) => a + b, 0);
	assert.equal(total, 90);
});

test('months appear in the header without duplicating within a month', () => {
	const grid = buildGrid([], 26, new Date('2026-03-10T12:00:00'));
	const labels = grid.monthLabels.map((m) => m.label);
	assert.equal(new Set(labels).size, labels.length);
});

test('durations read the way a person would say them', () => {
	assert.equal(formatMinutes(45), '45m');
	assert.equal(formatMinutes(60), '1h');
	assert.equal(formatMinutes(90), '1h 30m');
	assert.equal(formatMinutes(0), '0m');
});
