// Copyright (C) 2026 Alexandre Demartin
//
// For each isolation level, the levels of a transaction whose client a call at that level may join (#177),
// written out by hand from Postgres's docs: those that give every guarantee the level asks for. Plain strings,
// so that the runtime tests (../../src/db) and the type tests ('zapatos/db', test/types) both read this one table.

const
  S = 'SERIALIZABLE', RR = 'REPEATABLE READ', RC = 'READ COMMITTED', SRO = 'SERIALIZABLE, READ ONLY',
  RRRO = 'REPEATABLE READ, READ ONLY', RCRO = 'READ COMMITTED, READ ONLY', SROD = 'SERIALIZABLE, READ ONLY, DEFERRABLE';

export const satisfying = {
  [S]: [S], [RR]: [S, RR], [RC]: [S, RR, RC],
  [SRO]: [S, SRO, SROD], [RRRO]: [S, RR, SRO, RRRO, SROD], [RCRO]: [S, RR, RC, SRO, RRRO, RCRO, SROD],
  [SROD]: [S, SRO, SROD],
} as const;

/** Whether a call at `inner`, given the client of a transaction at `outer`, gets every guarantee it asks for. */
export const satisfies = (outer: string, inner: keyof typeof satisfying) => (satisfying[inner] as readonly string[]).includes(outer);
