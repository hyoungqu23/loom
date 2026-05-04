type RedactRule = {
  pattern: RegExp;
  /** When omitted, the entire match is replaced with `[REDACTED]`. */
  replace?: (match: string, ...groups: string[]) => string;
};

const SIMPLE: RegExp[] = [
  /\b[A-Z0-9_]*(SECRET|TOKEN|PASSWORD|API_KEY)[A-Z0-9_]*\s*=\s*[^\s`'"]+/gi,
  /\bsk-[A-Za-z0-9_-]{12,}\b/g,
  /\bgh[ps]_[A-Za-z0-9]{30,}\b/g,
  /\bgho_[A-Za-z0-9]{30,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
  /\b[Bb]earer\s+[A-Za-z0-9._\-+/=]{16,}\b/g,
];

const RULES: RedactRule[] = [
  ...SIMPLE.map((pattern) => ({ pattern })),
  {
    pattern:
      /(["']?(?:api[_-]?key|access[_-]?token|auth[_-]?token|secret)["']?\s*[:=]\s*["'])([^"'\s]{8,})(["'])/gi,
    replace: (_match, prefix: string, _value: string, suffix: string) =>
      `${prefix}[REDACTED]${suffix}`,
  },
];

export function redactText(text: string): string {
  let out = text;
  for (const rule of RULES) {
    out = rule.replace
      ? out.replace(rule.pattern, rule.replace)
      : out.replace(rule.pattern, "[REDACTED]");
  }
  return out;
}

export function redactValue<T>(value: T): T {
  if (typeof value === "string") return redactText(value) as T;
  if (Array.isArray(value)) return value.map((item) => redactValue(item)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      out[key] = redactValue(child);
    }
    return out as T;
  }
  return value;
}

/**
 * Worker stdout/stderr is normally written raw to `.loom/features/<slug>/workers/`
 * for debugging. Operators who run Loom on shared/CI machines can opt into
 * redaction by exporting `LOOM_REDACT_WORKER_OUTPUT=1` (or `=true`).
 */
export function workerOutputRedactionEnabled(): boolean {
  const raw = process.env.LOOM_REDACT_WORKER_OUTPUT;
  if (!raw) return false;
  return raw !== "0" && raw.toLowerCase() !== "false";
}
