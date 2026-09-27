/**
 * Storage.
 *
 * The log is append-only and holds two kinds of record: a `start` and a `stop`.
 * A stop refers back to a start by id, so finishing a session is just another
 * append -- we never rewrite a line that is already on disk. That means a
 * process that dies mid-write can cost you at most the last line, and a
 * truncated file is still readable up to that point.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export type StartRecord = { type: 'start'; id: string; at: string; note: string | null };
export type StopRecord = { type: 'stop'; id: string; at: string };
export type Record_ = StartRecord | StopRecord;

export type Session = {
	id: string;
	start: Date;
	/** null while the session is still running. */
	end: Date | null;
	note: string | null;
};

export function dataFile(): string {
	return process.env.FOCUSLOG_DATA ?? join(homedir(), '.focuslog', 'sessions.jsonl');
}

function isStart(r: unknown): r is StartRecord {
	return (
		typeof r === 'object' && r !== null &&
		(r as Record_).type === 'start' &&
		typeof (r as StartRecord).id === 'string' &&
		typeof (r as StartRecord).at === 'string' &&
		!Number.isNaN(Date.parse((r as StartRecord).at))
	);
}

function isStop(r: unknown): r is StopRecord {
	return (
		typeof r === 'object' && r !== null &&
		(r as Record_).type === 'stop' &&
		typeof (r as StopRecord).id === 'string' &&
		typeof (r as StopRecord).at === 'string' &&
		!Number.isNaN(Date.parse((r as StopRecord).at))
	);
}

export type ReadResult = {
	records: Record_[];
	/** Human-readable complaints about lines we could not use. Never throws. */
	problems: string[];
};

export function readRecords(file = dataFile()): ReadResult {
	if (!existsSync(file)) return { records: [], problems: [] };

	const records: Record_[] = [];
	const problems: string[] = [];

	readFileSync(file, 'utf8')
		.split('\n')
		.forEach((line, i) => {
			const trimmed = line.trim();
			if (!trimmed) return;
			let parsed: unknown;
			try {
				parsed = JSON.parse(trimmed);
			} catch {
				problems.push(`line ${i + 1}: not valid JSON, skipped`);
				return;
			}
			if (isStart(parsed) || isStop(parsed)) {
				records.push(parsed);
			} else {
				problems.push(`line ${i + 1}: not a start/stop record, skipped`);
			}
		});

	return { records, problems };
}

/**
 * Fold records into sessions. Stops with no matching start are ignored, and a
 * second stop for the same id is ignored -- both are cheap mistakes to make and
 * neither should cost you the rest of the log.
 */
export function toSessions(records: Record_[]): Session[] {
	const byId = new Map<string, Session>();
	const order: string[] = [];

	for (const r of records) {
		if (r.type === 'start') {
			if (byId.has(r.id)) continue;
			byId.set(r.id, { id: r.id, start: new Date(r.at), end: null, note: r.note });
			order.push(r.id);
		} else {
			const s = byId.get(r.id);
			if (!s || s.end !== null) continue;
			const end = new Date(r.at);
			// A stop that lands before its start is nonsense; ignore it and let
			// the session stay open rather than inventing a negative duration.
			if (end < s.start) continue;
			s.end = end;
		}
	}

	return order.map((id) => byId.get(id)!).sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function appendRecord(record: Record_, file = dataFile()): void {
	mkdirSync(dirname(file), { recursive: true });
	appendFileSync(file, `${JSON.stringify(record)}\n`, 'utf8');
}

export function durationMinutes(s: Session, now = new Date()): number {
	const end = s.end ?? now;
	return Math.max(0, (end.getTime() - s.start.getTime()) / 60_000);
}

export function activeSession(sessions: Session[]): Session | undefined {
	return sessions.find((s) => s.end === null);
}
