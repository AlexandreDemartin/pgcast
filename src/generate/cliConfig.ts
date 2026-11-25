/*
Zapatos: https://jawj.github.io/zapatos/
Copyright (C) 2020 - 2023 George MacKerron
pgcast (fork of Zapatos): https://github.com/AlexandreDemartin/pgcast
Copyright (C) 2026 Alexandre Demartin
Released under the MIT licence: see LICENCE file
*/

import * as fs from 'fs';
import * as path from 'path';
import { finaliseConfig } from './config';
import type { Config } from './config';
import { staleFiles, upToDate } from './outputFiles';
import { failedQuerySeq } from './queryErrors';
import { generate } from './write';

// kept out of zapatos/generate's exports, like moduleNames.ts; moved here from cli.ts, to be tested

const recursivelyInterpolateEnvVars = (obj: any): any =>
  // string? => do the interpolation
  typeof obj === 'string' ?
    obj.replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (_0, name) => {
      const e = process.env[name];
      if (e === undefined) throw new Error(`Environment variable '${name}' is not set`);
      return e;
    }) :
    // array? => recurse over its items
    Array.isArray(obj) ?
      obj.map(item => recursivelyInterpolateEnvVars(item)) :
      // object? => recurse over its values (but don't touch the keys: fromEntries keeps a schema named __proto__ as one)
      obj !== null && typeof obj === 'object' ?
        Object.fromEntries(Object.keys(obj).map(key => [key, recursivelyInterpolateEnvVars(obj[key])])) :
        // anything else (e.g. number)? => pass right through
        obj;

/**
 * The CLI's config: the file in `dir`, `pgcastconfig.json` else `zapatosconfig.json` else none, then `argsJSON`
 * merged over it, each with its environment variables filled in. With both files, a note through `warningListener`.
 */
export const cliConfig = (argsJSON = '{}', dir = '.') => {
  const
    configFiles = ['pgcastconfig.json', 'zapatosconfig.json'].filter(name => fs.existsSync(path.join(dir, name))),
    configFile = configFiles[0] ?? 'zapatosconfig.json',
    configJSON = configFiles.length > 0 ? fs.readFileSync(path.join(dir, configFile), { encoding: 'utf8' }) : '{}';

  let fileConfig;
  try {
    fileConfig = recursivelyInterpolateEnvVars(JSON.parse(configJSON));

  } catch (err: any) {
    throw new Error(`If present, ${configFile} must be a valid JSON file, and all referenced environment variables must exist: ${err.message}`);
  }

  let argsConfig;
  try {
    argsConfig = recursivelyInterpolateEnvVars(JSON.parse(argsJSON));

  } catch (err: any) {
    throw new Error(`If present, the argument to Zapatos must be valid JSON, and all referenced environment variables must exist: ${err.message}`);
  }

  const config = { ...fileConfig, ...argsConfig } as Config;

  if (configFiles.length > 1) {
    const
      { warningListener } = finaliseConfig(config),
      warn = warningListener === true ? console.log : warningListener || (() => void 0);

    warn(`Note: pgcastconfig.json and zapatosconfig.json are both here, and only pgcastconfig.json is read. ` +
      `Move any option you still need from zapatosconfig.json into pgcastconfig.json, then delete zapatosconfig.json.`);
  }

  return config;
};

/** What `--help` prints, and an unknown flag after its name. */
export const usage = `Usage: pgcast [--check] [config]
       zapatos [--check] [config]

Reads the config file of this folder, pgcastconfig.json else zapatosconfig.json, if there,
then writes the types of zapatos/schema, read from the database.

  config      a JSON object merged over the file's config, key by key: '{"outDir": "./src"}'
  --check     writes nothing, and exits with 1 if a file it would write differs or is missing
  --help, -h  prints this usage

{{NAME}} in a string of the config is replaced by the environment variable NAME.
Docs: https://pgcast.dev/generator#cli`;

/**
 * The CLI's arguments: skip a bare `--` forwarded by pnpm, take `--check` anywhere, and the JSON argument, the first other one, as Zapatos 6.6.1 reads
 * `process.argv[2]`; any later one is ignored, as there, and each flag among them returned, to be noted. A flag in
 * the JSON argument's place, `-h` or one starting with `--`, where 6.6.1 failed on it as JSON, is returned instead.
 */
export const cliArgs = (args: string[]) => {
  const
    [first, ...later] = args.filter(arg => arg !== '--check' && arg !== '--'),
    flag = first === '-h' || first?.startsWith('--') ? first : undefined;

  return {
    check: args.includes('--check'), argsJSON: flag === undefined ? first : undefined, flag,
    ignoredFlags: later.filter(arg => arg.startsWith('--')),
  };
};

/**
 * Run the CLI on its arguments in `dir`: `generate()`, or with `--check` the comparison of `check()`, after a note through
 * `warningListener` for each flag it ignores; or, before reading any config, the usage for `--help` and `-h`, on
 * stderr after the flag's name for any other flag. Resolve to its exit code: 1 on a failed query, printed on stdout
 * as Zapatos 6.6.1 prints it.
 */
export const runCli = async (args: string[], dir = '.') => {
  const { check: checkOnly, argsJSON, flag, ignoredFlags } = cliArgs(args);
  if (flag === '--help' || flag === '-h') {
    console.log(usage);
    return 0;
  }
  if (flag !== undefined) {
    console.error(`Unknown flag ${flag}: the flags are --check, --help and -h`);
    console.error(usage);
    return 1;
  }

  const config = cliConfig(argsJSON, dir);
  if (ignoredFlags.length > 0) {
    const
      { warningListener } = finaliseConfig(config),
      warn = warningListener === true ? console.log : warningListener || (() => void 0);

    for (const flag of ignoredFlags) warn(`Note: flag ${flag} ignored after the JSON argument: only --check may follow it.`);
  }

  try {
    if (!checkOnly) {
      await generate(config);
      return 0;
    }
    return await printStaleFiles(config);

  } catch (e) {
    const seq = failedQuerySeq(e);
    if (seq === undefined) throw e;  // not a query's: its stack goes to stderr
    console.log(`*** error ${seq} ***`, e);
    return 1;
  }
};

/** What `check()` compares, printed whatever the listeners say, with how to write the files; resolve to the exit code. */
const printStaleFiles = async (config: Config) => {
  const { folderTargetPath, lines } = await staleFiles(config);
  if (lines.length === 0) {
    console.log(upToDate(folderTargetPath));
    return 0;
  }
  for (const line of lines) console.log(line);
  console.log(`Run the generator without --check to write ${lines.length === 1 ? 'it' : 'them'}.`);
  return 1;
};
