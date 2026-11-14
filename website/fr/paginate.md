---
english: e48a068050ff
---

# Pagination

Affichez une longue liste une page à la fois : ici les films, du plus récent au plus ancien, deux par page. La dernière section réunit les étapes dans un handler de requête HTTP. La page suppose les bases du [tutoriel](/fr/tutorial).
{.lede}

<AtAGlance>

- Une page, c’est un `order` sans ex æquo, puis un `limit`.
- Pour avancer, un `offset` pour la page *n*, ou les clés de la dernière ligne pour la page suivante.
- Un total, si la page en affiche un : `count()`, ou une fenêtre dans `extras`.

</AtAGlance>

## Trier, puis limiter {#order-then-limit}

Demandez la première page de tous les films ([`db.all`](/fr/sql-template#all)) : un `order` qui finit sur une colonne unique, puis un `limit`.

<CastPanel example="paginate">

<<< ../examples/paginate.ts{ts twoslash}

<template #caption><span>Page 1 : Small Hours at Calder Bay (2019, id 1003), puis The Cartographer’s Silence (2008, id 1002).</span></template>
</CastPanel>

- Finissez l’[`order`](/fr/select#order-limit-offset-and-withties) sur une colonne unique, ici `id`. Sinon, deux films de la même année peuvent revenir dans un ordre ou dans l’autre, et d’une requête HTTP à la suivante un film peut apparaître sur deux pages ou sur aucune : Postgres ne promet aucun ordre entre ex æquo ([LIMIT and OFFSET](https://www.postgresql.org/docs/current/queries-limit.html)).
- `limit` est envoyé comme paramètre, `LIMIT $4`<!-- probe: examples/paginate.ts -->.
- Nommez les [`columns`](/fr/select#columns) que la page affiche, et gardez-y celles de l’`order` si vous chargez la page suivante à partir de la dernière ligne (plus bas).

Choisissez ensuite comment le lecteur avance :

| | `offset` | Les clés de la dernière ligne |
|---|---|---|
| Aller à la page *n* | oui | non : la page suivante, à partir de la précédente |
| Une page lointaine | Postgres calcule chaque ligne qu’il saute | Postgres part de la dernière ligne, avec un index qui correspond à l’`order` |
| Un film ajouté ou supprimé entre-temps | décale d’une ligne chaque page suivante | la page suivante commence toujours après la dernière ligne affichée |
| Il faut | un `order` sans ex æquo | un `order` sans ex æquo, et ses colonnes dans `columns` |

## Aller à la page n avec offset {#go-to-page-n-with-offset}

Sautez `(n - 1) × size` lignes avec [`offset`](/fr/select#order-limit-offset-and-withties) :

<CastPanel example="paginate_offset">

<<< ../examples/paginate_offset.ts{ts twoslash}

<template #caption><span>Page 2 : A Lantern for Edith (1991, id 1001), puis The Salt Orchard (1974, id 1000).</span></template>
</CastPanel>

- Après la dernière page, `select()` donne `[]`.
- Postgres calcule quand même les lignes qu’il saute, donc la page 500 coûte plus cher que la page 1 ([LIMIT and OFFSET](https://www.postgresql.org/docs/current/queries-limit.html)).
- Un film plus récent ajouté entre deux requêtes HTTP pousse le dernier film de la page 1 sur la page 2, où le lecteur le voit deux fois. Pour une longue liste qui change, partez de la dernière ligne.

## Charger la page suivante à partir de la dernière ligne {#fetch-the-next-page-from-the-last-row}

C’est la pagination par clés (keyset) : demandez les lignes qui viennent après la dernière que vous avez affichée, dans le même `order`.

### Garder la dernière ligne {#keep-the-last-row}

La dernière ligne de la page contient ses clés, ou vaut `undefined` quand la page est vide : il n’y a alors pas de page suivante.

```ts twoslash
import * as db from 'zapatos/db';
import type pg from 'pg';
declare const pool: pg.Pool;
const page = await db.select('films', db.all, {
  columns: ['id', 'title', 'release_year'],
  order: [
    { by: 'release_year', direction: 'DESC' },
    { by: 'id', direction: 'DESC' },
  ],
  limit: 2,
}).run(pool);
// ---cut---
const last = page.at(-1);
if (last === undefined) throw new Error('No next page');
```

Survolez `last` pour voir son type : une ligne des `columns` que vous avez demandées, ou `undefined`, donc les clés doivent en faire partie. Avec `strict` activé, le compilateur vous impose les deux :

- Sans la garde, `last.id` ne compile pas : `'last' is possibly 'undefined'` (TS18048).
- Sans `id` dans `columns`, il ne compile pas non plus (TS2339).

Avec `strict` désactivé, les deux compilent : une clé manquante est envoyée comme `NULL`, et la page suivante saute le reste de cette année.

### Demander les lignes qui la suivent {#ask-for-the-rows-after-it}

Donnez le `where` sous forme de fragment [`sql`](/fr/sql-template#sql) qui compare les colonnes de l’`order`, dans son ordre, à celles de `last`, chaque valeur passant par [`db.param()`](/fr/sql-template#param). Ici `last` est celle gardée plus haut, après sa garde, 2008 et 1002 :

<CastPanel example="paginate_keyset">

<<< ../examples/paginate_keyset.ts{ts twoslash}

<template #caption><span>La même page 2 qu’avec offset : A Lantern for Edith (1991, id 1001), puis The Salt Orchard (1974, id 1000).</span></template>
</CastPanel>

- `("release_year", "id") < ($4, $5)`<!-- probe: examples/paginate_keyset.ts --> garde les lignes qui précèdent 2008 et 1002 dans l’ordre : une année antérieure, ou 2008 et un `id` plus petit ([comparaison de lignes](https://www.postgresql.org/docs/current/functions-comparisons.html#ROW-WISE-COMPARISON)). `<` va avec `DESC` ; pour un ordre `ASC`, écrivez `>`.
- Avec un index sur `(release_year, id)`, Postgres commence à lire à la dernière ligne. Sur 300 000 films, après la dernière ligne (1960, 150000), `EXPLAIN (ANALYZE)` montre un `Index Scan Backward` avec `Index Cond: (ROW(release_year, id) < ROW(1960, 150000))` : il lit les 2 lignes qu’il renvoie, et aucune à sauter.
- Gardez les colonnes de clé `NOT NULL`, comme celles-ci : là où la comparaison rencontre un `NULL`, elle donne `NULL`, et cette ligne n’apparaît jamais.
- `s.films.SQL` ne laisse le fragment nommer que les colonnes de `films`.

### Avec un filtre {#with-a-filter}

Pour garder un filtre à côté de la comparaison, donnez la comparaison dans un [Whereable](/fr/sql-template#whereable), comme valeur de la première colonne de l’`order`, `release_year` : là, [`db.self`](/fr/sql-template#self) représente cette colonne, et le Whereable la relie aux autres clés par `AND`.

<CastPanel example="paginate_keyset_filter">

<<< ../examples/paginate_keyset_filter.ts{ts twoslash}

<template #caption><span>Parmi les films du studio 1000 après 2008 et 1002 : The Salt Orchard (1974, id 1000), seul.</span></template>
</CastPanel>

### Quand les sens diffèrent {#when-the-directions-differ}

Une comparaison de lignes va dans un seul sens. Avec `release_year` en `DESC` et `id` en `ASC`, écrivez-la en entier avec [`conditions.or`](/fr/conditions#conditions.or) : une année antérieure ([`conditions.lt`](/fr/conditions#conditions.lt)), ou la même année et un `id` plus grand ([`conditions.gt`](/fr/conditions#conditions.gt)). Bornez-la ensuite sur la première clé, avec [`conditions.and`](/fr/conditions#conditions.and) et [`conditions.lte`](/fr/conditions#conditions.lte) : cette année ou une antérieure.

<CastPanel example="paginate_mixed">

<<< ../examples/paginate_mixed.ts{ts twoslash}

<template #caption><span>De nouveau la page 2 : A Lantern for Edith (1991, id 1001), puis The Salt Orchard (1974, id 1000).</span></template>
</CastPanel>

- Créez l’index dans les sens de l’`order`, `(release_year DESC, id ASC)`. Postgres commence à lire à l’année de la dernière ligne : sur 300 000 films, après la dernière ligne (1960, 150000), `EXPLAIN (ANALYZE)` montre `Index Cond: (release_year <= 1960)`, puis un `Filter:` qui retire le reste de cette année, 1 167 lignes.
- Sans la borne, le `OR` n’est qu’un `Filter:` : Postgres lit et jette chaque ligne avant la dernière, 148 671 ici, comme pour un `offset`.

### Envoyer le curseur au client {#send-the-cursor-to-the-client}

Un client qui demande la page suivante renvoie les clés de la dernière ligne. Donnez-les-lui en une seule chaîne, un curseur, et vérifiez ce qui revient avant que cela n’entre dans une requête :

```ts twoslash
type Cursor = { release_year: number; id: number };

function encodeCursor({ release_year, id }: Cursor): string {
  return Buffer.from(JSON.stringify({ release_year, id })).toString('base64url');
}

function decodeCursor(cursor: string): Cursor | undefined {
  try {
    const { release_year, id } = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    const isKey = (key: number) => Number.isInteger(key) && Math.abs(key) < 2 ** 31;  // within Postgres's integer
    const made = encodeCursor({ release_year, id }) === cursor;  // no stray character, no other key
    if (isKey(release_year) && isKey(id) && made) return { release_year, id };
  } catch {}  // not base64url JSON
  return undefined;
}
```

- Pour 2008 et 1002, le curseur est `eyJyZWxlYXNlX3llYXIiOjIwMDgsImlkIjoxMDAyfQ` : du JSON en base64url, qu’une URL accepte tel quel.
- `decodeCursor()` donne `undefined` pour une chaîne qu’il n’a pas produite : `nonsense`, une chaîne vide, du JSON qui n’est pas un objet, des clés qui ne sont pas des entiers (`"2008"`, `2008.5`) ou hors de l’`integer` de Postgres (`99999999999`, `1e300`). Répondez 400, comme le fait le [handler](#a-handler-from-request-to-response).
- Il refuse aussi une clé en trop, le `==` du base64 standard et un `!` égaré : le décodage base64url ignore ces deux derniers, et la déstructuration écarte une clé en trop, donc il réencode les deux clés et compare.
- Un curseur est encodé, pas signé : le client peut le lire et le modifier. Il ne contient que l’endroit où la page commence, et chaque clé va à Postgres comme paramètre : un curseur modifié déplace la page, rien de plus.

## Revenir à la page précédente {#go-back-a-page}

Partez de la première ligne affichée, et lisez dans l’autre sens : inversez la comparaison et les sens de l’`order`, puis remettez les lignes dans l’ordre de la page. Ici `first` est la première ligne de la page 2, A Lantern for Edith (1991, id 1001), gardée comme `last`, avec `page.at(0)` et sa garde :

<CastPanel example="paginate_previous">

<<< ../examples/paginate_previous.ts{ts twoslash}

<template #caption><span>De la page 2 à la page 1, une fois inversée : Small Hours at Calder Bay (2019, id 1003), puis The Cartographer’s Silence (2008, id 1002).</span></template>
</CastPanel>

- `>` avec `ASC` donne les lignes juste avant `first` dans l’ordre de la page, la plus proche d’abord ; [`reverse()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/reverse), sur place, les remet de la plus récente à la plus ancienne.
- Moins de lignes que `limit`, y compris `[]` : vous avez atteint le début de la liste, affichez donc la première page à la place. Un film ajouté depuis l’affichage de la page 1 peut y laisser une ligne, et non `[]`.
- L’index sur `(release_year, id)` sert dans les deux sens. Sur 300 000 films, avant la première ligne (1960, 150000), `EXPLAIN (ANALYZE)` montre un `Index Scan`, vers l’avant cette fois, avec `Index Cond: (ROW(release_year, id) > ROW(1960, 150000))` : il lit les 2 lignes qu’il renvoie.
- Pour qu’un client puisse revenir, envoyez `encodeCursor(first)` comme second curseur, `before`, à côté d’`after`. Pour savoir s’il existe une page précédente, chargez `size + 1` lignes dans l’autre sens, comme le [handler](#a-handler-from-request-to-response) le fait pour `after`, gardez-en `size` et inversez.

## Compter le total {#count-the-total}

Deux façons, selon l’endroit où vous voulez le nombre :

| | [`count()`](/fr/select#count) | `count(*) OVER ()` dans `extras` |
|---|---|---|
| Requêtes | une de plus | aucune, mais elle lit chaque ligne du `where`, comme `count()` |
| Le total | un `number` | une clé sur chaque ligne |
| Une page vide | toujours le total | aucune ligne, donc pas de total |
| Avec les clés de la dernière ligne | le total de la liste, avec le filtre de la liste | les lignes restantes : utilisez `count()` |

Les deux comptent les lignes du `where`. Le `where` de la fenêtre est celui de la page : avec la comparaison de la dernière ligne dedans, elle compte les lignes restantes, pas toute la liste.

### Avec `count()` {#with-count}

<CastPanel example="paginate_count">

<<< ../examples/paginate_count.ts{ts twoslash}

</CastPanel>

Donnez-lui le `where` de la liste, et aucune des options de la page :

- `offset` saute l’unique ligne du comptage, et `.run()` est rejetée avec `TypeError: Cannot read properties of undefined (reading 'result')` ([#163](https://github.com/AlexandreDemartin/pgcast/issues/163)).
- `order` par une colonne : Postgres refuse la requête (42803).

### Avec une fenêtre dans `extras` {#with-a-window-in-extras}

Une fonction de fenêtrage dans [`extras`](/fr/select#extras) compte les lignes avant que `LIMIT` ne les coupe, et donne le total sur chaque ligne :

<CastPanel example="paginate_total">

<<< ../examples/paginate_total.ts{ts twoslash}

</CastPanel>

- Chaque ligne a `total: 4`. Le type est le second argument de type du fragment, `number` ; le `bigint` de Postgres arrive comme nombre JSON.
- Sur une page vide, après la dernière, aucune ligne ne le porte : `page[0]?.total` vaut `undefined`, pas le total.
- Avec la fenêtre, la requête de la page lit et trie chaque ligne du `where`. Sur 300 000 films, `EXPLAIN (ANALYZE)` montre un `Seq Scan` et un `WindowAgg` sur toutes, là où la page seule est un `Index Scan Backward` qui s’arrête à ses 2 lignes.
- Avec `strict` désactivé, `total` n’est pas dans le type ([Options](/fr/select#options)), et `page[0].total` ne compile pas (TS2339).

## Un handler, de la requête HTTP à la réponse {#a-handler-from-request-to-response}

Les étapes ci-dessus en une fonction : le filtre tiré de la query string, le curseur, l’existence d’une page suivante, le total, et la réponse JSON. `listFilms()` prend la [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request) de l’API Fetch et renvoie une [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response), toutes deux globales dans Node ; `encodeCursor()` et `decodeCursor()` sont ceux d’[Envoyer le curseur au client](#send-the-cursor-to-the-client).

<<< ../examples/plain/paginate_handler.ts{ts twoslash}

Sur le schéma de la doc, `GET /films` répond :

```json
{
  "films": [
    { "id": 1003, "title": "Small Hours at Calder Bay", "release_year": 2019 },
    { "id": 1002, "title": "The Cartographer's Silence", "release_year": 2008 }
  ],
  "nextCursor": "eyJyZWxlYXNlX3llYXIiOjIwMDgsImlkIjoxMDAyfQ",
  "total": 4
}
```

- `limit: size + 1` demande une ligne de plus que la page. Si elle revient, il y a une page suivante, et le curseur est la dernière ligne de la page, pas celle en trop ; `GET /films?after=eyJyZWxlYXNlX3llYXIiOjIwMDgsImlkIjoxMDAyfQ` donne 1001 et 1000, puis `"nextCursor": null`. Avec `limit: size`, une dernière page pleine enverrait un curseur vers une page vide.
- Le `where` de la page est [celui avec un filtre](#with-a-filter) : `filter`, puis la comparaison quand un curseur a été envoyé. [`count()`](#with-count) ne prend que `filter`, donc chaque page a le total de la liste : `GET /films?studio=1000` donne 1002 et 1000, et `"total": 2`. Retirez-le, avec sa requête, si la page n’affiche pas de total.
- Un `studio` qui n’est pas fait de 1 à 9 chiffres, ou un `after` que `decodeCursor()` refuse, reçoit un 400 avant toute requête : `Number()` seul lirait `''` comme 0, `0x3e8` comme 1000, et laisserait `99999999999` atteindre Postgres, qui le refuse.

## Voir aussi {#see-also}

- [`select()`](/fr/select#select) : chaque option et le SQL qu’elle écrit ; [`count()`](/fr/select#count) et ses options.
- [Template SQL](/fr/sql-template#sql), [`self`](/fr/sql-template#self) et [`param()`](/fr/sql-template#param), pour la comparaison.
- [Pourquoi pgcast](/fr/why) : pourquoi une requête reste le SQL que vous voyez.
