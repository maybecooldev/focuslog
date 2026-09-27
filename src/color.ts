/** Minimal 24-bit colour helpers. No dependency, no config file, no ceremony. */

export function hexToRgb(hex: string): [number, number, number] {
	const h = hex.replace('#', '');
	const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
	return [
		parseInt(full.slice(0, 2), 16),
		parseInt(full.slice(2, 4), 16),
		parseInt(full.slice(4, 6), 16),
	];
}

/**
 * Decide whether to emit escape codes.
 *
 * NO_COLOR wins over everything (https://no-color.org). FORCE_COLOR overrides
 * the TTY check, which is what you want in tests and when piping to `less -R`.
 */
export function supportsColor(): boolean {
	if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '') return false;
	if (process.env.FORCE_COLOR !== undefined && process.env.FORCE_COLOR !== '0') return true;
	return Boolean(process.stdout.isTTY);
}

export function bg(hex: string, text: string, enabled: boolean): string {
	if (!enabled) return text;
	const [r, g, b] = hexToRgb(hex);
	return `[48;2;${r};${g};${b}m${text}[0m`;
}
