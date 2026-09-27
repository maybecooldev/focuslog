/**
 * Date helpers. Everything here works in *local* time on purpose: a session
 * logged at 11pm belongs to the day you lived it, not to the UTC day.
 */

export function dayKey(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

export function startOfDay(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
	const c = new Date(d);
	c.setDate(c.getDate() + n);
	return c;
}

/** The Sunday of the week containing `d`. Matches how GitHub lays out its graph. */
export function startOfWeek(d: Date): Date {
	return addDays(startOfDay(d), -d.getDay());
}

export function daysBetween(a: Date, b: Date): number {
	return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000);
}

export function formatMinutes(total: number): string {
	const h = Math.floor(total / 60);
	const m = Math.round(total % 60);
	if (h === 0) return `${m}m`;
	if (m === 0) return `${h}h`;
	return `${h}h ${m}m`;
}
