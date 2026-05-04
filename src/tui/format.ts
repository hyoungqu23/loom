/**
 * Pure formatters for the TUI frame. No I/O, no side effects.
 */

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const sec = s % 60;
  const m = Math.floor(s / 60);
  if (m < 60) {
    return `${m}:${String(sec).padStart(2, "0")}`;
  }
  const min = m % 60;
  const h = Math.floor(m / 60);
  return `${h}:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export type FormatBytesOptions = { delta?: boolean };

export function formatBytes(n: number, opts: FormatBytesOptions = {}): string {
  const sign = opts.delta ? (n < 0 ? "-" : "+") : "";
  const abs = Math.abs(n);
  if (abs < 1024) return `${sign}${abs} B`;
  if (abs < 1024 * 1024) {
    return `${sign}${(abs / 1024).toFixed(1)} KB`;
  }
  return `${sign}${(abs / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatPersonaLabel(name: string, width = 8): string {
  if (name.length >= width) return name;
  return name + " ".repeat(width - name.length);
}

export type Icons = {
  done: string;
  active: string;
  queued: string;
  failed: string;
};

export function icons(asciiOnly: boolean): Icons {
  if (asciiOnly) {
    return { done: "+", active: "*", queued: ".", failed: "x" };
  }
  return { done: "✓", active: "⚬", queued: "·", failed: "✗" };
}
