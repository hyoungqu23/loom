/**
 * Anything that can be sensibly stringified by `String(value)`. This is the
 * widest practical input for console.log/error without resorting to `unknown`
 * or `any`.
 */
export type ConsoleArg = string | number | boolean | null | undefined | object;

/**
 * Run `fn` while redirecting console.log/console.error AND
 * process.stdout.write/process.stderr.write to a buffer.
 *
 * Restores all originals even if `fn` throws. Stdout/stderr.write
 * is captured so the new TUI sink (which writes directly via
 * process.stdout.write to maintain precise cursor control) is
 * observable from tests through the same buffer interface.
 *
 * Note: this monkeypatches globals for the duration of `fn`. Callers
 * must ensure no concurrent code expects the real console.
 */
export async function captureConsole<T>(
  buffer: string[],
  fn: () => Promise<T> | T,
): Promise<T> {
  const originalLog = console.log;
  const originalError = console.error;
  const originalStdout = process.stdout.write.bind(process.stdout);
  const originalStderr = process.stderr.write.bind(process.stderr);
  const append = (parts: readonly ConsoleArg[]): void => {
    buffer.push(parts.map((part) => String(part)).join(" "));
  };
  const writeAppend = (chunk: string | Uint8Array): boolean => {
    const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    // Trailing newlines from sink writes match the line-per-entry contract.
    const trimmed = text.endsWith("\n") ? text.slice(0, -1) : text;
    if (trimmed.length === 0 && text.endsWith("\n")) return true;
    buffer.push(trimmed);
    return true;
  };
  console.log = (...args: ConsoleArg[]) => append(args);
  console.error = (...args: ConsoleArg[]) => append(args);
  // We replace .write with our capturing variant. The stream still
  // accepts the same call shape; we ignore the optional encoding/cb.
  (process.stdout.write as unknown as typeof writeAppend) = writeAppend;
  (process.stderr.write as unknown as typeof writeAppend) = writeAppend;
  try {
    return await fn();
  } finally {
    console.log = originalLog;
    console.error = originalError;
    (process.stdout.write as unknown as typeof originalStdout) = originalStdout;
    (process.stderr.write as unknown as typeof originalStderr) = originalStderr;
  }
}
