// Copyright (C) 2026 Alexandre Demartin
// `pg` in the playground's worker, which cannot bundle the real one (it needs Node's `net`, `tls`, `dns`): zapatos/db
// imports it only for `instanceof pg.Pool` and `pg.Client` (transaction.ts). Both fail on the playground's pools,
// which it then tells apart by `_connected`: missing on a pool, `true` on the client its `connect()` lends.
export class Pool {}
export class Client {}
