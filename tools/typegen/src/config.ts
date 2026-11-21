// Copyright (C) 2026 Alexandre Demartin

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { finaliseConfig } from '@pgcast/pgcast/generate';

/** Read the same file and expand the same string values as the schema generator. */
export function readConfig(dir: string) {
  const files = ['pgcastconfig.json', 'zapatosconfig.json'].filter(name => existsSync(join(dir, name)));
  if (!files.length) return finaliseConfig({});
  const file = files[0], json = readFileSync(join(dir, file), 'utf8');
  let config;
  try {
    config = JSON.parse(json, (_, value: unknown) => typeof value !== 'string' ? value :
      value.replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (_match, name: string) => {
        const replacement = process.env[name];
        if (replacement === undefined) throw new Error(`Environment variable '${name}' is not set in ${file}`);
        return replacement;
      }));
  } catch (error) {
    // A JSON syntax error can quote the config, including its credentials.
    if (error instanceof SyntaxError) throw new Error(`${file} must be a valid JSON file`);
    throw error;
  }
  const final = finaliseConfig(config);
  if (files.length > 1 && final.warningListener) {
    console.error('Note: pgcastconfig.json and zapatosconfig.json are both here, and only pgcastconfig.json is read. ' +
      'Move any option you still need from zapatosconfig.json into pgcastconfig.json, then delete zapatosconfig.json.');
  }
  return final;
}
