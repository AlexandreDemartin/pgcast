/*
Zapatos: https://jawj.github.io/zapatos/
Copyright (C) 2020 - 2023 George MacKerron
Released under the MIT licence: see LICENCE file
*/

import * as fs from 'fs';
import { finaliseConfig, Config } from './config';
import { outputFiles, warnAfterOutput } from './outputFiles';


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
