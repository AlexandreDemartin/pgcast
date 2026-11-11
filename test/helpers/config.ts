// Copyright (C) 2026 Alexandre Demartin
//
// The runtime config (setConfig) is module state: a test that changes it calls
// resetConfig() afterwards, e.g. `afterEach(resetConfig)`.

import { getConfig, setConfig, type NewConfig } from '../../src/db';

const defaults = getConfig();

/** Restores the config as it was at import. setConfig() merges: the listeners must be unset explicitly. */
export const resetConfig = () => {
  setConfig({ queryListener: undefined, resultListener: undefined, transactionListener: undefined, ...defaults } as NewConfig);
};
