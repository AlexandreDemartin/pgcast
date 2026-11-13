// Copyright (C) 2026 Alexandre Demartin
// `pg` in the playground's worker, which cannot bundle the real one (it needs Node's `net`, `tls`, `dns`): zapatos/db
// imports it only for `instanceof pg.Pool` and `pg.Client` (transaction.ts). Both fail on the recording pool, which
// is then told apart by its missing `_connected`, as a pool.
export class Pool {}
export class Client {}
