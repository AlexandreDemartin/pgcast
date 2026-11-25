/*
pgcast (fork of Zapatos): https://github.com/AlexandreDemartin/pgcast
Copyright (C) 2026 Alexandre Demartin
Released under the MIT licence: see LICENCE file
*/

// kept out of zapatos/generate's exports, like enumOrder.ts

/** The key, set on the CLI's config alone, of the function a failed query of the generator calls at once. */
export const onFailedQuery = Symbol('onFailedQuery');

/** A config the CLI gives: a failed query is printed and ends the process before the pool ends, which waits for each query running. */
export interface ExitOnFailedQuery {
  [onFailedQuery]?: (error: unknown, seq: number) => void;
}
