import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildGrid, renderGrid, legend } from '../src/heatmap.ts';
import { hexToRgb } from '../src/color.ts';
import { toSessions } from '../src/store.ts';

const NOW = new Date('2026-03-10T12:00:00'); // Tuesday

function sessionOn(iso: string, minutes: number) {
	const s = new Date(iso);
	const e = new Date(s.getTime() + minutes * 60_000);
	return toSessions([
		{ type: 'start', id: iso, at: s.toISOString(), note: null },
		{ type: 'stop', id: iso, at: e.toISOString() },
	])[0]!;
}

test('a coloured grid contains escape codes and one row per weekday', () => {
	const out = renderGrid(buildGrid([], 4, NOW), true);
	assert.match(out, /\[48;2;/);
	// header + 7 weekday rows
	assert.equal(out.split('\n').length, 8);
});

test('a grid rendered without colour still shows data', () => {
	const grid = buildGrid([sessionOn('2026-03-09T09:00:00', 90)], 4, NOW);
	const out = renderGrid(grid, false);
	assert.doesNotMatch(out, /\[/);
	// 90 minutes lands in level 3, which is the '▓' glyph.
	assert.match(out, /▓/);
});

test('a full row of cells is present for every weekday', () => {
	const out = renderGrid(buildGrid([], 6, NOW), false);
	const body = out.split('\n').slice(1);
	assert.equal(body.length, 7);
	for (const line of body) {
		// 4-char label column + 6 weeks * 2 chars
		assert.equal(line.length, 4 + 6 * 2, `bad row width: ${JSON.stringify(line)}`);
	}
});

test('the month header starts under the label column, not at column 0', () => {
	const out = renderGrid(buildGrid([], 8, NOW), false);
	const header = out.split('\n')[0]!;
	assert.ok(header.startsWith('    '), 'header must be indented past the label column');
	assert.match(header, /Jan|Feb|Mar/);
});

test('the legend shows every level, coloured or not', () => {
	const mono = legend(false);
	for (const glyph of ['░', '▒', '▓', '█']) assert.ok(mono.includes(glyph), `legend missing ${glyph}`);

	const coloured = legend(true);
	assert.equal((coloured.match(/\[48;2;/g) ?? []).length, 5);
});

test('hexToRgb expands shorthand and parses full colours', () => {
	assert.deepEqual(hexToRgb('#fff'), [255, 255, 255]);
	assert.deepEqual(hexToRgb('000000'), [0, 0, 0]);
	assert.deepEqual(hexToRgb('#216e39'), [33, 110, 57]);
});
