// Copyright (C) 2026 Alexandre Demartin

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { finaliseConfig } from '@pgcast/pgcast/generate';

/** Read the same file and expand the same string values as the schema generator. */
export function readConfig(dir: string) {
  const files = ['pgcastconfig.json', 'zapatosconfig.json'].filter(name => existsSync(join(dir, name)));
  const file = files[0], json = file ? readFileSync(join(dir, file), 'utf8') : '{}';
  let config, problem: string | undefined;
  try {
    config = JSON.parse(json, (_, value: unknown) => typeof value !== 'string' ? value :
      value.replace(/\{\{([\s\S]*?)\}\}/g, (_, contents: string) => {
        const name = contents.trim();
        if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(name)) {
          problem ??= `${file}: a placeholder is not a variable name`;
        } else if (process.env[name] === undefined) {
          problem ??= `Environment variable '${name}' is not set in ${file}`;
        } else return process.env[name]!;
        // Finish expanding db so the CLI can redact the diagnostic.
        return '';
      }));
  } catch (error) {
    // A JSON syntax error can quote the config, including its credentials.
    if (error instanceof SyntaxError) throw new Error(`${file} must be a valid JSON file`);
    throw error;
  }
  const final = finaliseConfig(config);
  const note = files.length > 1 && final.warningListener ?
    'Note: pgcastconfig.json and zapatosconfig.json are both here, and only pgcastconfig.json is read. ' +
      'Move any option you still need from zapatosconfig.json into pgcastconfig.json, then delete zapatosconfig.json.' : undefined;
  return { config: final, problem, note };
}
