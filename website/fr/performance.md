---
english: c0951e679a55
---

# Performance

Garder rapide la lecture de lignes volumineuses ou nombreuses. Chaque raccourci construit son résultat en JSON dans Postgres ; là où cela coûte, [`columns`](/fr/select#columns), [`selectRows()`](/fr/select#selectRows), [`cursor()`](/fr/transaction#cursor), [`prepared()`](/fr/sql-template#prepared) et le template [`sql`](/fr/sql-template#sql) le réduisent.
{.lede}

## Quand le JSON coûte {#when-the-json-costs}

Chaque ligne est `to_jsonb("films".*)`<!-- probe: examples/select.ts -->, et `select()` rassemble les lignes en une seule valeur, `coalesce(jsonb_agg(result), '[]')`<!-- probe: examples/select.ts -->. Trois cas font apparaître ce coût :

- **Les grandes valeurs** : `to_jsonb` lit chaque valeur en entier, y compris un gros `jsonb` stocké hors de la ligne, et la reconstruit. Sur 10 000 lignes avec un `jsonb` de 4 Ko, `select()` prend environ 0,6 s, `SELECT *` environ 0,2 s.
- **Un grand nombre de lignes** : `jsonb_agg` construit tout le résultat en une seule valeur dans la mémoire de Postgres, envoyée et parsée d’un bloc, jusqu’à une [limite](#limits).
- **Les laterals imbriqués** : chaque niveau construit le `jsonb` de ses lignes et le fusionne dans celui de son parent. 1 000 studios de 20 films chacun prennent environ 0,1 s, contre 50 ms pour une simple jointure imbriquée en JavaScript.

Une page de 50 petites lignes prend de 0,1 à 0,2 ms sous toutes les formes mesurées, environ un aller-retour vers un Postgres local : là, le JSON ne vaut pas la peine d’être évité. Ces chiffres sont des ordres de grandeur, mesurés depuis le client sur Postgres 17.3 en local.

## Laisser de côté une grosse colonne {#leave-a-large-column-out}

Les films d’un studio sans leurs `details`, une colonne `jsonb` :

<CastPanel example="performance">

<<< ../examples/performance.ts{ts twoslash}

</CastPanel>

- `jsonb_build_object($1::text, "id", $2::text, "title", $3::text, "release_year")`<!-- probe: examples/performance.ts --> remplace `to_jsonb("films".*)`, donc `details` n’est jamais converti en JSON. Sur les 10 000 lignes ci-dessus, la requête passe d’environ 0,6 s à 20 ms.
- Le type ne garde que ces clés, `{ id: number; title: string; release_year: number }[]`.
- Un champ de la grosse colonne s’obtient par un fragment [`extras`](/fr/select#extras) : [Champs JSON](/fr/json-fields).

## Obtenir une ligne par résultat {#get-one-row-per-result}

<CastPanel example="performance_select_rows">

<<< ../examples/performance_select_rows.ts{ts twoslash}

</CastPanel>

- `SELECT to_jsonb("films".*) AS result FROM "films" WHERE ("studio_id" = $1)`<!-- probe: examples/performance_select_rows.ts --> : pas de `jsonb_agg`, donc chaque ligne est une valeur à part. Sur les 10 000 lignes de 4 Ko, environ 0,3 s contre 0,6 s. Sur 2 000 lignes de 100 Ko, environ 1,6 s, là où `select()` échoue.
- Le type est celui de `select()`, `s.films.JSONSelectable[]`.
- Pour chaque `select()` exécuté seul, activez [`topLevelSelectAsRows`](/fr/runtime-config#Config.topLevelSelectAsRows) : chacun envoie cette requête, et ceux qui sont imbriqués gardent leur agrégat.

## Lire par batches {#read-in-batches}

Pour un résultat que vous préférez ne pas garder en mémoire d’un bloc, [`cursor()`](/fr/transaction#cursor) lit un `selectRows()` un batch à la fois, `FETCH FORWARD 100 FROM pgcast_cursor_1`<!-- probe: db.readCommitted(pool, async txnClient => { for await (const _ of db.cursor(txnClient, db.selectRows('films', { studio_id: 1000 }), { batchSize: 100 })) { } }) -->, chaque batch en un aller-retour : [Curseurs](/fr/cursors).

## Préparer une requête imbriquée lancée souvent {#prepare-a-nested-query-run-often}

Postgres planifie une requête chaque fois qu’il la lance, 0,6 ms pour une requête dont les laterals sont imbriqués sur trois niveaux. [`prepared()`](/fr/sql-template#prepared) la nomme, pour que chaque connexion la prépare une fois, puis la lance par son nom :

<CastPanel example="performance_prepared">

<<< ../examples/performance_prepared.ts{ts twoslash}

</CastPanel>

- Le SQL est le même ; `compile()` ajoute le nom, `studio_with_films`.
- Cette requête prenait environ 0,8 ms par appel, et un cinquième de moins préparée.
- Un nom correspond à un seul texte : une fonction de requête dont le texte ne change jamais, ses valeurs mises à part.

## Lire les lignes telles que `pg` les renvoie {#read-rows-as-pg-returns-them}

Le template [`sql`](/fr/sql-template#sql) ne construit aucun JSON :

<CastPanel example="performance_sql">

<<< ../examples/performance_sql.ts{ts twoslash}

</CastPanel>

- `SELECT * FROM "films" WHERE ("studio_id" = $1)`<!-- probe: examples/performance_sql.ts -->, tel qu’écrit. Sur les 10 000 lignes de 4 Ko, environ 0,2 s contre 0,6 s avec `select()`.
- Le type est celui que vous donnez, `s.films.Selectable[]` : les valeurs telles que `pg` les parse, un `timestamptz` en `Date` là où `JSONSelectable` a une chaîne ([Une colonne, cinq types](/fr/catalog-types#one-column-five-types)). Rien ne le vérifie par rapport à la requête ; [SQL typé](/fr/typed-sql) le génère.

## Limites {#limits}

- `select()` échoue dès que son `jsonb_agg` dépasse 256 Mo, avec l’erreur 54000 de Postgres, `total size of jsonb array elements exceeds the maximum of 268435455 bytes`. `columns`, `selectRows()` ou un `cursor()` restent en dessous.
- `pg` lit chaque valeur dans une seule chaîne JavaScript, et Node limite une chaîne à environ 512 Mo ([node-postgres#2653](https://github.com/brianc/node-postgres/issues/2653)).

## Mesurer {#measure}

Mesurez la durée de l’appel depuis votre client, ou, à partir de Postgres 17, lancez `EXPLAIN (ANALYZE, SERIALIZE)` sur le texte compilé de la requête :

```ts twoslash
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
// ---cut---
const { text, values } = db.selectOne('films', { id: 1000 }).compile();
const plan = await pool.query(`EXPLAIN (ANALYZE, SERIALIZE) ${text}`, values);
```

Un simple `EXPLAIN ANALYZE` laisse de côté la conversion de chaque ligne en texte pour le client, là où un `SELECT *` lit ses grandes valeurs : sur les 10 000 lignes de 4 Ko, il donne à `SELECT *` 0,4 ms, contre 178 ms avec `SERIALIZE`. Un raccourci construit son JSON dans le plan, donc un simple `EXPLAIN ANALYZE` le compte, et fait paraître `SELECT *` bien moins cher qu’il ne l’est. Depuis le client, lire une ligne par sa clé prend 0,2 ms avec `selectOne()` et 0,1 ms avec `SELECT *`.

## Voir aussi {#see-also}

- [`select()`](/fr/select#select) : chaque option, le SQL qu’elle écrit.
- [Pourquoi les raccourcis renvoient du JSON](/fr/catalog-types#why-the-shortcuts-return-json).
- [`EXPLAIN`](https://www.postgresql.org/docs/current/sql-explain.html), dans la doc de Postgres.
