import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readRecords, toSessions, durationMinutes, activeSession, type Record_ } from '../src/store.ts';

function tmpFile(contents: string): string {
	const dir = mkdtempSync(join(tmpdir(), 'focuslog-test-'));
	const file = join(dir, 'sessions.jsonl');
	writeFileSync(file, contents, 'utf8');
	return file;
}

test('a start with no stop is still running', () => {
	const { records } = readRecords(tmpFile(
		`${JSON.stringify({ type: 'start', id: 'a', at: '2026-01-01T10:00:00Z', note: null })}\n`,
	));
	const sessions = toSessions(records);
	assert.equal(sessions.length, 1);
	assert.equal(sessions[0].end, null);
	assert.equal(activeSession(sessions)?.id, 'a');
});

test('a stop closes the matching start', () => {
	const { records } = readRecords(tmpFile([
		JSON.stringify({ type: 'start', id: 'a', at: '2026-01-01T10:00:00Z', note: 'writing' }),
		JSON.stringify({ type: 'stop', id: 'a', at: '2026-01-01T10:25:00Z' }),
	].join('\n') + '\n'));

	const [s] = toSessions(records);
	assert.equal(s.note, 'writing');
	assert.equal(durationMinutes(s), 25);
	assert.equal(s.end?.toISOString(), '2026-01-01T10:25:00.000Z');
});

test('a stop with no matching start is ignored', () => {
	const { records } = readRecords(tmpFile(
		`${JSON.stringify({ type: 'stop', id: 'ghost', at: '2026-01-01T10:00:00Z' })}\n`,
	));
	assert.deepEqual(toSessions(records), []);
});

test('a second stop for the same id is ignored', () => {
	const { records } = readRecords(tmpFile([
		JSON.stringify({ type: 'start', id: 'a', at: '2026-01-01T10:00:00Z', note: null }),
		JSON.stringify({ type: 'stop', id: 'a', at: '2026-01-01T10:25:00Z' }),
		JSON.stringify({ type: 'stop', id: 'a', at: '2026-01-01T11:00:00Z' }),
	].join('\n') + '\n'));

	const [s] = toSessions(records);
	// The first stop wins; the second must not overwrite it.
	assert.equal(durationMinutes(s), 25);
});

test('a stop before its start is ignored, leaving the session open', () => {
	const { records } = readRecords(tmpFile([
		JSON.stringify({ type: 'start', id: 'a', at: '2026-01-01T10:00:00Z', note: null }),
		JSON.stringify({ type: 'stop', id: 'a', at: '2026-01-01T09:00:00Z' }),
	].join('\n') + '\n'));

	const [s] = toSessions(records);
	assert.equal(s.end, null);
	assert.equal(durationMinutes(s, new Date('2026-01-01T10:30:00Z')), 30);
});

test('duplicate start ids collapse to one session', () => {
	const { records } = readRecords(tmpFile([
		JSON.stringify({ type: 'start', id: 'a', at: '2026-01-01T10:00:00Z', note: null }),
		JSON.stringify({ type: 'start', id: 'a', at: '2026-01-01T11:00:00Z', note: null }),
	].join('\n') + '\n'));

	assert.equal(toSessions(records).length, 1);
});

test('corrupt lines are reported but do not lose the good ones', () => {
	const { records, problems } = readRecords(tmpFile([
		'{ this is not json',
		JSON.stringify({ type: 'start', id: 'a', at: '2026-01-01T10:00:00Z', note: null }),
		'{"type":"something-else"}',
		'',
		'{"type":"start","id":"b","at":"not-a-date","note":null}',
	].join('\n') + '\n'));

	assert.equal(records.length, 1);
	assert.equal(records[0]!.id, 'a');
	assert.equal(problems.length, 3);
	assert.match(problems[0]!, /not valid JSON/);
	assert.match(problems[1]!, /not a start\/stop record/);
	assert.match(problems[2]!, /not a start\/stop record/);
});

test('a missing file is an empty log, not an error', () => {
	const { records, problems } = readRecords(join(tmpdir(), 'definitely-not-here-9182.jsonl'));
	assert.deepEqual(records, []);
	assert.deepEqual(problems, []);
});

test('sessions come back in chronological order regardless of file order', () => {
	const raw: Record_[] = [
		{ type: 'start', id: 'b', at: '2026-01-02T10:00:00Z', note: null },
		{ type: 'start', id: 'a', at: '2026-01-01T10:00:00Z', note: null },
	];
	const sessions = toSessions(raw);
	assert.deepEqual(sessions.map((s) => s.id), ['a', 'b']);
});

test('an unfinished session measures against the time you ask', () => {
	const { records } = readRecords(tmpFile(
		`${JSON.stringify({ type: 'start', id: 'a', at: '2026-01-01T10:00:00Z', note: null })}\n`,
	));
	const [s] = toSessions(records);
	assert.equal(durationMinutes(s, new Date('2026-01-01T10:45:00Z')), 45);
});
