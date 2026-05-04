import { Flags } from "../types";
import { summarizeMetrics } from "../metrics/events";

export function runMetricsCommand(positionals: string[], _flags: Flags): void {
  const subcommand = positionals[0] || "summary";
  if (subcommand !== "summary") {
    throw new Error("Usage: loom metrics summary");
  }

  const rows = summarizeMetrics();
  console.log("Metrics Summary\n");
  if (rows.length === 0) {
    console.log("(no metrics recorded)");
    return;
  }

  for (const row of rows) {
    console.log(
      `${row.feature} phases=${row.phases} durationMs=${row.durationMs} workers=${row.workers} failed=${row.failed}`,
    );
  }
}
