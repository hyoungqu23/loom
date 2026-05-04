/**
 * Anything that can be sensibly stringified by `String(value)`. This is the
 * widest practical input for console.log/error without resorting to `unknown`
 * or `any`.
 */
export type ConsoleArg = string | number | boolean | null | undefined | object;

/**
 * Run `fn` while redirecting console.log/console.error to a buffer.
 * Restores the original console methods even if `fn` throws.
 *
 * Note: this monkeypatches the global console for the duration of `fn`.
 * Callers must ensure no concurrent code expects the real console.
 */
export async function captureConsole<T>(
  buffer: string[],
  fn: () => Promise<T> | T,
): Promise<T> {
  const originalLog = console.log;
  const originalError = console.error;
  const append = (parts: readonly ConsoleArg[]): void => {
    buffer.push(parts.map((part) => String(part)).join(" "));
  };
  console.log = (...args: ConsoleArg[]) => append(args);
  console.error = (...args: ConsoleArg[]) => append(args);
  try {
    return await fn();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}
