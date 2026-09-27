# focuslog

A Pomodoro timer for the terminal that keeps a log and draws it back as a
heatmap.

No account, no sync, no database. The only state is one JSONL file you can read
with `cat`, and nothing leaves your machine.

```
$ focuslog heatmap 14

     Jun       Aug       Sep
                ▓▓  ▒▒    ▒▒
Mon       ██▓▓████░░██▓▓▓▓██▓▓
          ░░░░██▓▓▓▓▓▓██▓▓████
Wed       ██████████▓▓██████░░
          ▓▓▓▓██░░██▓▓▓▓▓▓████
Fri       ████▓▓██▓▓████▒▒████
            ▓▓  ░░▒▒      ▓▓

  less    ░░ ▒▒ ▓▓ ██ more
```

## Install

Needs Node 22.6 or newer — it runs the TypeScript directly, so there is no build
step and no `node_modules`.

```sh
git clone https://github.com/maybecooldev/focuslog
cd focuslog
npm link          # optional, puts `focuslog` on your PATH
```

Or run it without installing:

```sh
node src/cli.ts stats
```

## Use

```sh
focuslog start writing the parser   # begin a session
focuslog status                     # how long have we been going
focuslog stop                       # log it and close

focuslog today                      # today's total
focuslog stats                      # totals, streaks, daily average
focuslog heatmap 26                 # the graph
focuslog sessions                   # recent sessions
focuslog log 45 "fixed the bug"     # record a finished session by hand
```

`--no-color` swaps the palette for block glyphs, and `FOCUSLOG_DATA` points the
log somewhere other than `~/.focuslog/sessions.jsonl`.

## How the log works

Every entry is one line of JSON, and entries are only ever appended:

```jsonl
{"type":"start","id":"7f3c...","at":"2026-03-09T09:00:00.000Z","note":"parser"}
{"type":"stop","id":"7f3c...","at":"2026-03-09T10:15:00.000Z"}
```

A `stop` points back at a `start` by id, which means finishing a session never
rewrites a line that is already on disk. If the process dies mid-write you lose
at most the last line, and everything before it still parses.

That design also makes the obvious mistakes harmless. A second `stop` for a
session that is already closed is ignored. A `stop` that somehow lands before
its `start` is ignored and the session stays open. A line of garbage produces a
warning on stderr and the rest of the log loads normally. None of these throw —
a log file you cannot open is worse than a log file with holes in it.

Sessions are bucketed into days by when they *started*, in your local timezone.
A session that begins at 11pm and ends at midnight counts for the 11pm day.

## Tests

```sh
npm test
```

29 tests, no mocking framework. The store tests write real files to a temp
directory; the stats and rendering tests are pure functions over fixed dates.

## Limits worth knowing

- A session cannot span two days in the heatmap. It is credited to its start
  date by design.
- `focuslog log` backfills relative to now, so there is no way to record
  something for last Tuesday. The log file is plain JSONL if you want to edit it.
- There is no timer loop. `start` and `stop` are two commands you run yourself;
  it will not buzz at you when 25 minutes are up.
