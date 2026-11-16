#!/usr/bin/env node
// ^^ this shebang is for the compiled JS file, not the TS source

/*
Zapatos: https://jawj.github.io/zapatos/
Copyright (C) 2020 - 2023 George MacKerron
Released under the MIT licence: see LICENCE file
*/

import { runCli } from './cliConfig';


void (async () => {
  const exitCode = await runCli(process.argv.slice(2));
  if (exitCode !== 0) process.exitCode = exitCode;  // --check, on a file out of date
})();
