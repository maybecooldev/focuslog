/**
 * The heatmap: one column per week, one row per weekday, shaded by minutes
 * focused. Laid out the same way GitHub draws its own contribution graph, which
 * is the whole reason this exists.
 */

import { addDays, dayKey, startOfWeek } from './dates.ts';
import { bg } from './color.ts';
import { minutesByDay, type Session } from './stats.ts';

/** GitHub's greens, lightest to darkest. */
const PALETTE = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'];

/** Minutes needed to reach each level. Index 0 is always "nothing logged". */
const THRESHOLDS = [0, 1, 30, 60, 120];

export function levelFor(minutes: number): number {
	let level = 0;
	for (let i = 1; i < THRESHOLDS.length; i++) {
		if (minutes >= THRESHOLDS[i]) level = i;
	}
	return level;
}

export type Grid = {
	/** weeks[column][row] is minutes focused, or 0. */
	weeks: number[][];
	/** Day keys, parallel to the grid. Same shape. */
	keys: string[][];
	/** Day-of-week labels for the first column only; blank on the rest. */
	rowLabels: string[];
	/** Month labels positioned above the column they start in. */
	monthLabels: { column: number; label: string }[];
};

const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

export function buildGrid(
	sessions: Session[],
	weekCount: number,
	now = new Date(),
): Grid {
	const totals = minutesByDay(sessions, now);
	// Anchor on the Sunday of the current week, then walk back weekCount-1 weeks
	// so the newest column is always the one containing today.
	const lastWeekStart = startOfWeek(now);
	const firstWeekStart = addDays(lastWeekStart, -(weekCount - 1) * 7);

	const weeks: number[][] = [];
	const keys: string[][] = [];
	const monthLabels: { column: number; label: string }[] = [];
	let lastMonth = -1;

	for (let w = 0; w < weekCount; w++) {
		const weekStart = addDays(firstWeekStart, w * 7);
		const column: number[] = [];
		const keyColumn: string[] = [];
		for (let d = 0; d < 7; d++) {
			const day = addDays(weekStart, d);
			keyColumn.push(dayKey(day));
			column.push(totals.get(dayKey(day)) ?? 0);
		}
		weeks.push(column);
		keys.push(keyColumn);

		const month = weekStart.getMonth();
		if (month !== lastMonth) {
			monthLabels.push({
				column: w,
				label: weekStart.toLocaleString('en-US', { month: 'short' }),
			});
			lastMonth = month;
		}
	}

	return { weeks, keys, rowLabels: DAY_LABELS, monthLabels };
}

const CELL_WIDTH = 2;
const LABEL_WIDTH = 4;

/** Fallback glyphs when colour is off, so the graph is still readable. */
const MONO = [' ', '░', '▒', '▓', '█'];

function cell(level: number, color: boolean): string {
	if (color) return bg(PALETTE[level], ' '.repeat(CELL_WIDTH), color);
	return MONO[level]!.repeat(CELL_WIDTH);
}

export function renderGrid(grid: Grid, color: boolean): string {
	const lines: string[] = [];

	// Month header, indented by the same amount as the weekday column so the
	// labels sit above the week they describe.
	let header = ' '.repeat(LABEL_WIDTH) + grid.weeks.map(() => ' '.repeat(CELL_WIDTH)).join('');
	let lastEnd = LABEL_WIDTH;
	for (const { column, label } of grid.monthLabels) {
		const at = LABEL_WIDTH + column * CELL_WIDTH;
		// Skip a label that would overlap the one before it.
		if (at < lastEnd) continue;
		header = header.slice(0, at) + ' ' + label + header.slice(at + 1 + label.length);
		lastEnd = at + 1 + label.length;
	}
	lines.push(header.trimEnd());

	for (let row = 0; row < 7; row++) {
		const parts: string[] = [grid.rowLabels[row].padEnd(LABEL_WIDTH)];
		for (let w = 0; w < grid.weeks.length; w++) {
			parts.push(cell(levelFor(grid.weeks[w][row]), color));
		}
		lines.push(parts.join(''));
	}

	return lines.join('\n');
}

export function legend(color: boolean): string {
	const cells = PALETTE.map((_, i) => cell(i, color));
	return `less ${cells.join(' ')} more`;
}
