/*
Zapatos: https://jawj.github.io/zapatos/
Copyright (C) 2020 - 2023 George MacKerron
pgcast (fork of Zapatos): https://github.com/AlexandreDemartin/pgcast
Copyright (C) 2026 Alexandre Demartin
Released under the MIT licence: see LICENCE file
*/

import * as fs from 'fs';
import * as path from 'path';
import { finaliseConfig, type Config } from './config';

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
      // object? => recurse over its values (but don't touch the keys)
      obj !== null && typeof obj === 'object' ?
        Object.keys(obj).reduce<any>((memo, key) => {
          memo[key] = recursivelyInterpolateEnvVars(obj[key]);
          return memo;
        }, {}) :
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
