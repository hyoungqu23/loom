#!/usr/bin/env node
"use strict";

const { main } = require("../dist/cli");

main(process.argv.slice(2)).catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
