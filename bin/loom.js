#!/usr/bin/env node
"use strict";

const { main } = require("../dist/cli");

const useColor =
  Boolean(process.stderr.isTTY) &&
  !(typeof process.env.NO_COLOR === "string" && process.env.NO_COLOR.length > 0);
const RED = useColor ? "\x1b[31m" : "";
const YELLOW = useColor ? "\x1b[33m" : "";
const DIM = useColor ? "\x1b[2m" : "";
const RESET = useColor ? "\x1b[0m" : "";
const debug = process.env.LOOM_DEBUG === "1";

main(process.argv.slice(2)).catch((error) => {
  const message = (error && error.message) || String(error);
  const isUsage = typeof message === "string" && message.startsWith("Usage:");
  if (isUsage) {
    // Strip the "Usage: " prefix and present as a plain hint.
    const text = message.replace(/^Usage:\s*/, "");
    process.stderr.write(`${YELLOW}usage${RESET}  ${text}\n`);
    process.exit(2);
  }
  process.stderr.write(`${RED}error${RESET}  ${message}\n`);
  if (debug && error && error.stack) {
    process.stderr.write(`${DIM}${error.stack}${RESET}\n`);
  } else if (error && error.stack) {
    process.stderr.write(
      `${DIM}run with LOOM_DEBUG=1 to see the full stack${RESET}\n`,
    );
  }
  process.exit(1);
});
