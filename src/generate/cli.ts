#!/usr/bin/env node
// ^^ this shebang is for the compiled JS file, not the TS source

/*
Zapatos: https://jawj.github.io/zapatos/
Copyright (C) 2020 - 2023 George MacKerron
Released under the MIT licence: see LICENCE file
*/

import { generate } from ".";
import { cliConfig } from './cliConfig';


void (async () => {
  await generate(cliConfig(process.argv[2]));
})();
