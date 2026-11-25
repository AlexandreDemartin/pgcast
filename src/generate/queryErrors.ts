/*
pgcast (fork of Zapatos): https://github.com/AlexandreDemartin/pgcast
Copyright (C) 2026 Alexandre Demartin
Released under the MIT licence: see LICENCE file
*/

// kept out of zapatos/generate's exports, like enumOrder.ts

/** By error, the number of the generator's query that failed with it: the error itself is rejected untouched. */
const seqs = new WeakMap<object, number>();

/** Note that the query numbered `seq` failed with `error`. */
export const noteFailedQuery = (error: unknown, seq: number) => {
  if (typeof error === 'object' && error !== null) seqs.set(error, seq);
};

/** The number of the query that failed with `error`, if a query of the generator did: what the CLI prints. */
export const failedQuerySeq = (error: unknown) =>
  typeof error === 'object' && error !== null ? seqs.get(error) : undefined;
