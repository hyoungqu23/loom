import { Flags } from "../types.js";
import { flagString } from "../util/parse-args.js";
import { exportTrajectory } from "../trajectory/export.js";

export function runExportCommand(positionals: string[], flags: Flags): void {
  const subcommand = positionals[0];
  if (subcommand !== "trajectory") {
    throw new Error("Usage: loom export trajectory --feature <slug>");
  }
  const feature = flagString(flags.feature);
  if (!feature) throw new Error("Usage: loom export trajectory --feature <slug>");
  console.log(JSON.stringify(exportTrajectory(feature), null, 2));
}
