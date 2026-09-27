#!/usr/bin/env node
/**
 * focuslog -- a Pomodoro timer that keeps a log and draws it as a heatmap.
 *
 * Everything is local and append-only. There is no account, no sync, no config
 * file; the only state is one JSONL file you can read with `cat`.
 */

import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';

import { supportsColor } from './color.ts';
import { dayKey, formatMinutes } from './dates.ts';
import { buildGrid, legend, renderGrid } from './heatmap.ts';
import { activeSession, appendRecord, dataFile, durationMinutes, readRecords, toSessions, type Session } from './store.ts';
import { bestStreak, currentStreak, minutesByDay, totalMinutes } from './stats.ts';

const USAGE = `focuslog -- track deep work, see it add up

Usage
  focuslog start [note...]      begin a session (fails if one is running)
  focuslog stop                 end the running session
  focuslog status               show the running session, if any
  focuslog log <minutes> [note] backfill a finished session
  focuslog today                totals for today
  focuslog stats                totals, streaks, and daily average
  focuslog heatmap [weeks]      contribution-style graph (default 26)
  focuslog sessions [limit]     most recent sessions (default 10)
  focuslog file                 path to the log file

Options
  --no-color                    never emit ANSI colour
  --help                        this text

Environment
  FOCUSLOG_DATA                 override the log file location
`;

type Flags = { color: boolean; rest: string[] };

function parseFlags(argv: string[]): Flags {
	const rest: string[] = [];
	let color = supportsColor();
	for (const arg of argv) {
		if (arg === '--no-color') color = false;
		else if (arg === '--color') color = true;
		else if (arg === '--help' || arg === '-h') rest.push('help');
		else rest.push(arg);
	}
	return { color, rest };
}

function fail(message: string): never {
	process.stderr.write(`focuslog: ${message}\n`);
	process.exit(1);
}

function load(): Session[] {
	const { records, problems } = readRecords();
	for (const p of problems) process.stderr.write(`focuslog: warning: ${p}\n`);
	return toSessions(records);
}

function describe(s: Session, now = new Date()): string {
	const mins = Math.round(durationMinutes(s, now));
	const when = s.start.toLocaleString(undefined, {
		month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
	});
	const note = s.note ? `  ${s.note}` : '';
	return `  ${when}  ${formatMinutes(mins).padStart(7)}${s.end ? '' : '  (running)'}${note}`;
}

function main(argv: string[]): void {
	const { color, rest } = parseFlags(argv);
	const [command, ...args] = rest;

	if (!command || command === 'help') {
		process.stdout.write(USAGE);
		return;
	}

	const sessions = load();
	const now = new Date();

	switch (command) {
		case 'start': {
			if (activeSession(sessions)) {
				const running = activeSession(sessions)!;
				fail(`a session is already running (started ${running.start.toLocaleString()}). Run \`focuslog stop\` first.`);
			}
			const note = args.length ? args.join(' ') : null;
			appendRecord({ type: 'start', id: randomUUID(), at: now.toISOString(), note });
			process.stdout.write(`started${note ? `: ${note}` : ''}\n`);
			break;
		}

		case 'stop': {
			const running = activeSession(sessions);
			if (!running) fail('no session is running.');
			appendRecord({ type: 'stop', id: running.id, at: now.toISOString() });
			const mins = Math.round(durationMinutes(running, now));
			process.stdout.write(`stopped after ${formatMinutes(mins)}\n`);
			break;
		}

		case 'status': {
			const running = activeSession(sessions);
			if (!running) {
				process.stdout.write('no session running\n');
				return;
			}
			const mins = Math.round(durationMinutes(running, now));
			const note = running.note ? ` (${running.note})` : '';
			process.stdout.write(`running for ${formatMinutes(mins)}${note}\n`);
			break;
		}

		case 'log': {
			const minutes = Number(args[0]);
			if (!Number.isFinite(minutes) || minutes <= 0) {
				fail('usage: focuslog log <minutes> [note]');
			}
			// A backfilled session ends now and started `minutes` ago, so it
			// lands in the right heatmap cell.
			const start = new Date(now.getTime() - minutes * 60_000);
			const id = randomUUID();
			appendRecord({ type: 'start', id, at: start.toISOString(), note: args[1] ?? null });
			appendRecord({ type: 'stop', id, at: now.toISOString() });
			process.stdout.write(`logged ${formatMinutes(minutes)}\n`);
			break;
		}

		case 'today': {
			const mins = minutesByDay(sessions, now).get(dayKey(now)) ?? 0;
			const done = sessions.filter((s) => dayKey(s.start) === dayKey(now)).length;
			process.stdout.write(`${formatMinutes(mins)} across ${done} session${done === 1 ? '' : 's'}\n`);
			break;
		}

		case 'stats': {
			const totals = minutesByDay(sessions, now);
			const active = totals.size;
			const total = totalMinutes(sessions, now);
			const streak = currentStreak(totals, now);
			const best = bestStreak(totals);
			const avg = active === 0 ? 0 : total / active;
			const rows: [string, string][] = [
				['total focused', formatMinutes(total)],
				['active days', String(active)],
				['daily average', formatMinutes(Math.round(avg))],
				['current streak', `${streak} day${streak === 1 ? '' : 's'}`],
				['longest streak', `${best} day${best === 1 ? '' : 's'}`],
			];
			const width = Math.max(...rows.map(([k]) => k.length));
			for (const [k, v] of rows) {
				process.stdout.write(`  ${k.padEnd(width)}  ${v}\n`);
			}
			break;
		}

		case 'heatmap': {
			const weeks = args[0] ? Number(args[0]) : 26;
			if (!Number.isInteger(weeks) || weeks < 1 || weeks > 200) {
				fail('usage: focuslog heatmap [weeks]   (1-200)');
			}
			const grid = buildGrid(sessions, weeks, now);
			process.stdout.write(`\n${renderGrid(grid, color)}\n\n  ${legend(color)}\n\n`);
			break;
		}

		case 'sessions': {
			const limit = args[0] ? Number(args[0]) : 10;
			if (!Number.isInteger(limit) || limit < 1) fail('usage: focuslog sessions [limit]');
			const done = sessions.filter((s) => s.end !== null);
			if (done.length === 0) {
				process.stdout.write('no completed sessions yet\n');
				return;
			}
			const shown = done.slice(-limit).reverse();
			for (const s of shown) process.stdout.write(`${describe(s, now)}\n`);
			break;
		}

		case 'file': {
			const file = dataFile();
			process.stdout.write(`${file}${existsSync(file) ? '' : '  (not created yet)'}\n`);
			break;
		}

		default:
			fail(`unknown command "${command}". Try \`focuslog --help\`.`);
	}
}

main(process.argv.slice(2));
