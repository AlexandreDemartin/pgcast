/*
Zapatos: https://jawj.github.io/zapatos/
Copyright (C) 2020 - 2023 George MacKerron
pgcast (fork of Zapatos): https://github.com/AlexandreDemartin/pgcast
Copyright (C) 2026 Alexandre Demartin
Released under the MIT licence: see LICENCE file
*/

import * as fs from 'fs';
import * as path from 'path';
import { finaliseConfig, type CompleteConfig, type Config } from './config';
import * as legacy from './legacy';
import { moduleNamesOf, warnAboutOtherModuleNames } from './moduleNames';
import { warnAboutSchemaRules } from './schemaRules';
import { tsForConfig } from './tsOutput';
import { header } from './header';

// kept out of zapatos/generate's exports, like cliConfig.ts

interface OutputFile { path: string; content: string }

/**
 * The files `generate()` writes, built in memory: the schema and, when there is a custom type, `custom/index`,
 * each written on every run; and the placeholders, each written only when missing.
 */
export const outputFiles = async (config: CompleteConfig, debug: (s: string) => void) => {
  const
    { ts, customTypeSourceFiles } = await tsForConfig(config, debug),

    folderName = moduleNamesOf(config),
    schemaName = 'schema' + config.outExt,
    customFolderName = 'custom',
    customTypesIndexName = 'index' + config.outExt,
    customTypesIndexContent = header() + `
// this empty declaration appears to fix relative imports in other custom type files
declare module '${folderName}/custom' { }
`,

    folderTargetPath = path.join(config.outDir, folderName),
    customFolderTargetPath = path.join(folderTargetPath, customFolderName),
    schema: OutputFile = { path: path.join(folderTargetPath, schemaName), content: ts },
    placeholders: OutputFile[] = Object.keys(customTypeSourceFiles).map(name => ({
      path: path.join(customFolderTargetPath, name + config.outExt), content: customTypeSourceFiles[name],
    })),
    customTypesIndex: OutputFile | undefined = placeholders.length > 0 ?
      { path: path.join(customFolderTargetPath, customTypesIndexName), content: customTypesIndexContent } :
      undefined;

  return { folderTargetPath, customFolderTargetPath, schema, customTypesIndex, placeholders };
};

/** The notes `generate()` gives after its writes, through `warningListener`. */
export const warnAfterOutput = (suppliedConfig: Config, config: CompleteConfig) => {
  warnAboutOtherModuleNames(config);
  warnAboutSchemaRules(suppliedConfig, config);
  legacy.srcWarning(config);
};

/**
 * Compare the files `generate()` would write with those on disk, writing nothing, after the notes of a run: resolve to
 * their folder and a line per file that differs or is missing. A placeholder counts only when missing: it is yours to
 * edit. `check()` and the CLI's `--check` print them, each in its own way.
 */
export const staleFiles = async (suppliedConfig: Config) => {
  const
    config = finaliseConfig(suppliedConfig),
    debug = config.debugListener === true ? console.log :
      config.debugListener || (() => void 0),

    { folderTargetPath, schema, customTypesIndex, placeholders } = await outputFiles(config, debug),

    contentOf = (file: OutputFile) => fs.existsSync(file.path) ? fs.readFileSync(file.path, 'utf8') : undefined,
    stale = [schema, ...customTypesIndex ? [customTypesIndex] : []]
      .map(file => ({ file, content: contentOf(file) }))
      .filter(({ file, content }) => content !== file.content)
      .map(({ file, content }) => `${content === undefined ? 'Missing' : 'Out of date'}: ${file.path}`),
    missingPlaceholders = placeholders
      .filter(file => !fs.existsSync(file.path))
      .map(file => `Missing: ${file.path}`)
      .sort();  // tsForConfig() adds them in the order its queries complete

  warnAfterOutput(suppliedConfig, config);
  return { folderTargetPath, lines: [...stale, ...missingPlaceholders] };
};

/** The line that says the files in `folderTargetPath` are up to date. */
export const upToDate = (folderTargetPath: string) => `The generated files in ${folderTargetPath} are up to date.`;
