import { Flags } from "../types";
import { listCronJobs, runCronJob } from "../cron/jobs";

export async function runCronCommand(positionals: string[], _flags: Flags): Promise<void> {
  const subcommand = positionals[0] || "list";
  if (subcommand === "list") {
    const jobs = listCronJobs();
    console.log("Cron Jobs\n");
    if (jobs.length === 0) {
      console.log("(none configured)");
      return;
    }
    for (const job of jobs) {
      console.log(
        `${job.id.padEnd(24)} ${job.enabled ? "enabled " : "disabled"} ${job.schedule.padEnd(12)} ${job.command} ${job.args.join(" ")} last=${job.lastStatus ?? "never"}`,
      );
    }
    return;
  }
  if (subcommand === "run") {
    const id = positionals[1];
    if (!id) throw new Error("Usage: loom cron run <id>");
    const result = await runCronJob(id);
    console.log(
      `[loom] cron ${id} status=${result.status == null ? "null" : result.status}`,
    );
    return;
  }
  throw new Error("Usage: loom cron list | run <id>");
}
