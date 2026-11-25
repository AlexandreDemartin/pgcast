/*
pgcast (fork of Zapatos): https://github.com/AlexandreDemartin/pgcast
Copyright (C) 2026 Alexandre Demartin
Released under the MIT licence: see LICENCE file
*/

// kept out of zapatos/generate's exports, like enumOrder.ts

/** The generator options 8.0 removed, each with the value whose behaviour it always has (decision 019 § 4). */
const removedOptions: { [key: string]: unknown } = {
  typeEnumsAcrossSchemas: true,
  enumOrder: 'declared',
};

/**
 * Throw on a removed option, an own key of `config`, set to anything but the value 8.0 keeps, `null` or `undefined`:
 * called before any query, so a config written for 7.x never switches behaviour without a word.
 */
export const refuseRemovedOptions = (config: object) => {
  for (const key of Object.keys(removedOptions)) {
    if (!Object.prototype.hasOwnProperty.call(config, key)) continue;
    const value = (config as { [key: string]: unknown })[key], kept = removedOptions[key];
    if (value !== kept && value != null) {
      throw new Error(`${key} was removed in 8.0, which always does what ${key}: ${JSON.stringify(kept)} did; ` +
        `delete it from the generator's config: https://pgcast.dev/switching#from-8-0-${key}`);
    }
  }
};

/** `config` without the removed options, which `refuseRemovedOptions()` has let through. */
export const withoutRemovedOptions = <T extends object>(config: T) => {
  for (const key of Object.keys(removedOptions)) delete (config as { [key: string]: unknown })[key];
  return config;
};
