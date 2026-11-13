/*
pgcast (fork of Zapatos): https://github.com/AlexandreDemartin/pgcast
Copyright (C) 2026 Alexandre Demartin
Released under the MIT licence: see LICENCE file
*/

import * as fs from 'fs';
import * as path from 'path';
import type { CompleteConfig } from './config';

// kept out of zapatos/generate's exports, like enumOrder.ts

type ModuleNames = NonNullable<CompleteConfig['moduleNames']>;

/** The `moduleNames` of a config, `'zapatos'` when absent. Any other value throws. */
export const moduleNamesOf = (config: CompleteConfig): ModuleNames => {
  const names = config.moduleNames ?? 'zapatos';
  if (names !== 'zapatos' && names !== 'pgcast') {
    throw new Error(`moduleNames must be 'zapatos' (the default) or 'pgcast', not '${names}'`);
  }
  return names;
};

/**
 * Warn when `outDir` also holds the schema of the other `moduleNames`: both declare `'zapatos/schema'`
 * (in `'pgcast'` mode, for src/db's declarations), and TypeScript merges the two.
 */
export const warnAboutOtherModuleNames = (config: CompleteConfig) => {
  const
    names = moduleNamesOf(config),
    other = names === 'zapatos' ? 'pgcast' : 'zapatos',
    folderPath = path.join(config.outDir, names),
    otherFolderPath = path.join(config.outDir, other),
    otherSchemaPath = path.join(otherFolderPath, 'schema' + config.outExt);

  if (!fs.existsSync(otherSchemaPath)) return;

  const warn = config.warningListener === true ? console.log : config.warningListener || (() => void 0);
  warn(`Note: ${otherSchemaPath} is here too, generated with moduleNames: '${other}'. ` +
    `It declares 'zapatos/schema', as ${path.join(folderPath, 'schema' + config.outExt)} does, and TypeScript merges the two: ` +
    `types can loosen, silently under skipLibCheck. Delete the folder ${otherFolderPath}, ` +
    `once any placeholder you edited there is moved to ${path.join(folderPath, 'custom')}.`);
};
