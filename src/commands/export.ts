import { Flags } from "../types";
import { flagString } from "../util/parse-args";
import { exportTrajectory } from "../trajectory/export";

export function runExportCommand(positionals: string[], flags: Flags): void {
  const subcommand = positionals[0];
  if (subcommand !== "trajectory") {
    throw new Error("Usage: loom export trajectory --feature <slug>");
  }
  const feature = flagString(flags.feature);
  if (!feature) throw new Error("Usage: loom export trajectory --feature <slug>");
  console.log(JSON.stringify(exportTrajectory(feature), null, 2));
}
