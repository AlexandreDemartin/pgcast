/*
Zapatos: https://jawj.github.io/zapatos/
Copyright (C) 2020 - 2023 George MacKerron
Released under the MIT licence: see LICENCE file
*/

import * as fs from 'fs';
import { finaliseConfig, Config } from './config';
import { outputFiles, staleFiles, upToDate, warnAfterOutput } from './outputFiles';


/**
 * Generate a schema and supporting files and folders given a configuration.
 * @param suppliedConfig An object approximately matching `zapatosconfig.json`.
 */
export const generate = async (suppliedConfig: Config) => {
  const
    config = finaliseConfig(suppliedConfig),
    log = config.progressListener === true ? console.log :
      config.progressListener || (() => void 0),
    warn = config.warningListener === true ? console.log :
      config.warningListener || (() => void 0),
    debug = config.debugListener === true ? console.log :
      config.debugListener || (() => void 0),

    { folderTargetPath, customFolderTargetPath, schema, customTypesIndex, placeholders } = await outputFiles(config, debug);

  log(`(Re)creating schema folder: ${schema.path}`);
  fs.mkdirSync(folderTargetPath, { recursive: true });

  log(`Writing generated schema: ${schema.path}`);
  fs.writeFileSync(schema.path, schema.content, { flag: 'w' });

  if (customTypesIndex) {
    fs.mkdirSync(customFolderTargetPath, { recursive: true });

    for (const placeholder of placeholders) {
      if (fs.existsSync(placeholder.path)) {
        log(`Custom type or domain declaration file already exists: ${placeholder.path}`);

      } else {
        warn(`Writing new custom type or domain placeholder file: ${placeholder.path}`);
        fs.writeFileSync(placeholder.path, placeholder.content, { flag: 'w' });
      }
    }

    log(`Writing custom types file: ${customTypesIndex.path}`);
    fs.writeFileSync(customTypesIndex.path, customTypesIndex.content, { flag: 'w' });
  }

  warnAfterOutput(suppliedConfig, config);
};

/**
 * Compare the files `generate()` would write with those on disk, writing nothing, as the CLI's `--check` does: each
 * that differs or is missing goes to `warningListener` (`Out of date: <path>`, `Missing: <path>`); none, one line to
 * `progressListener`. A placeholder counts only when missing: it is yours to edit. A failed query rejects with its
 * error, `rejectOnQueryError` left out included; only `rejectOnQueryError: false` ends the process, as in `generate()`.
 * @param suppliedConfig An object approximately matching `zapatosconfig.json`.
 * @returns `true` when the files on disk are up to date.
 */
export const check = async (suppliedConfig: Config) => {
  const
    config = finaliseConfig(suppliedConfig),
    log = config.progressListener === true ? console.log :
      config.progressListener || (() => void 0),
    warn = config.warningListener === true ? console.log :
      config.warningListener || (() => void 0),

    // no exit of Zapatos 6.6.1 to keep, so no note of it: it rejects, as generate() will by default in 7.0
    rejectOnQueryError = suppliedConfig.rejectOnQueryError ?? true,  // left out, or null from JSON
    { folderTargetPath, lines } = await staleFiles({ ...suppliedConfig, rejectOnQueryError });

  if (lines.length === 0) log(upToDate(folderTargetPath));
  for (const line of lines) warn(line);
  return lines.length === 0;
};
