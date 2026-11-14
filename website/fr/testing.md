---
english: 680a6fab3758
---

# Tests

Trois façons de tester une fonction qui lance des requêtes pgcast, la plus fidèle d’abord : contre un vrai Postgres, chaque test annulé ensuite ; sur la requête qu’elle compile, sans base ; sur un faux résultat typé d’après le schéma. Cette page suppose les bases du [tutoriel](/fr/tutorial).
{.lede}

## La fonction à tester {#the-function-to-test}

`programme()` liste les films d’un studio, du plus ancien au plus récent, sous forme de lignes pour une affiche. Les exemples ci-dessous la testent, elle ou une fonction semblable :

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
async function programme(queryable: db.Queryable, studio_id: number) {
  const films = await db.select('films', { studio_id }, {
    columns: ['title', 'release_year'],
    order: { by: 'release_year', direction: 'ASC' },
  }).run(queryable);
  return films.map(film => `${film.title} (${film.release_year})`);
}
```

Elle prend un [`Queryable`](/fr/sql-template#Queryable) : un test peut donc lui passer n’importe quel pool ou client, ou un fake.

## Tester contre une vraie base {#test-against-a-real-database}

L’approche que je recommande : la seule des trois qui vérifie la requête elle-même et ce que Postgres renvoie. Son coût : un serveur Postgres, en local et en CI, et une exécution plus lente. La suite de tests de pgcast fonctionne ainsi ([`test/helpers/db.ts`](https://github.com/AlexandreDemartin/pgcast/blob/master/test/helpers/db.ts)).

### Copier une base pour chaque fichier de test {#copy-a-database-for-each-test-file}

Chargez votre schéma une fois dans une base modèle, avec vos migrations, puis copiez-la pour chaque fichier de test et supprimez la copie après ses tests :

```sql
CREATE DATABASE films_test_4f1c TEMPLATE films_template;
-- this file's tests
DROP DATABASE films_test_4f1c;
```

- Postgres copie le modèle tel quel : les migrations ne tournent pas une seconde fois. Le rôle a besoin de `CREATEDB`.
- Aucune session ne doit être connectée au modèle pendant la copie : Postgres refuse avec 55006 (« <span lang="en">source database … is being accessed by other users</span> »).
- Un suffixe aléatoire par fichier permet aux fichiers de test de tourner en même temps, chacun sur sa propre base.

### Annuler chaque test {#roll-back-each-test}

Chaque test tourne sur un seul client, dans un `BEGIN`, annulé ensuite : ce qu’il écrit a disparu avant le test suivant. Il insère ses propres seeds avec [`insert()`](/fr/insert#insert) :

<<< ../examples/plain/testing_rolled_back.ts{ts twoslash}

- Ici avec `test` de `node:test` et `assert` de `node:assert/strict` ; n’importe quel test runner convient, et des hooks `beforeEach` / `afterEach` peuvent contenir les mêmes lignes.
- Lisez une valeur générée dans ce que renvoie `insert()`, comme `studio.id` ici : ne l’écrivez jamais en dur dans le test (ci-dessous).
- Un client dont le `ROLLBACK` échoue est cassé : `release(err)` le détruit au lieu de le passer au test suivant. Si le test avait déjà échoué, c’est sa propre erreur qui est levée, puisque c’est elle qui dit pourquoi.

### Savoir ce que laisse un rollback {#know-what-a-rollback-leaves}

| Ce qu’un test a fait | Après son `ROLLBACK` |
|---|---|
| Des lignes insérées, modifiées ou supprimées ; `SET` ; une table temporaire | annulé |
| Une valeur `SERIAL` ou d’identité prise | toujours prise : l’`insert()` du test suivant reçoit l’id suivant, 2 après 1, bien que la ligne 1 ait disparu |
| `PREPARE`, ou une requête lancée avec [`prepared()`](/fr/sql-template#prepared) | gardé sur la connexion, pour le prochain test qui la reçoit du pool |
| Un advisory lock de session, `pg_advisory_lock()` | toujours détenu par cette connexion |

Un id se lit donc, il ne s’écrit jamais en dur ; et un nom préparé désigne un seul texte dans tous les tests qui partagent le pool.

### Donner le pool au code qui commite {#give-code-that-commits-the-pool}

Le code qui ouvre sa propre [`transaction()`](/fr/transaction#transaction) ne peut pas rejoindre celle du test. Si on lui donne le client du test, dans son `BEGIN`, il envoie `START TRANSACTION ISOLATION LEVEL SERIALIZABLE`<!-- probe: db.serializable(pool, async () => {}) -->, à quoi Postgres répond par un avertissement (25001, « <span lang="en">there is already a transaction in progress</span> »), puis il termine la transaction du test de l’une de deux façons ([#233](https://github.com/AlexandreDemartin/pgcast/issues/233)) :

- Si le test n’a encore lancé aucune requête, ou au niveau propre à la session (`readCommitted()`, sur un serveur par défaut), son `COMMIT`<!-- probe: db.serializable(pool, async () => {}) --> commite la transaction du test, lignes comprises.
- À un autre niveau, après n’importe quelle requête, seeds du test compris, Postgres refuse avec 25001 (« <span lang="en">SET TRANSACTION ISOLATION LEVEL must be called before any query</span> ») : son `ROLLBACK`<!-- probe: db.serializable(pool, async () => { throw 0; }) --> annule les seeds, et l’appel est rejeté.

Dans les deux cas, le `ROLLBACK` du test n’a plus rien à annuler (25P01), et pgcast avertit une fois, `PGCAST_DEP005`. Activez [`transactionRequiresIdleClient`](/fr/runtime-config#Config.transactionRequiresIdleClient) dans la mise en place de vos tests, et un tel appel est alors rejeté, avant son `START TRANSACTION` : le test échoue, et son `ROLLBACK` annule toujours ses seeds.

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
db.setConfig({ transactionRequiresIdleClient: true });
```

Il faut pg 8.21 ou plus récent, qui signale le `BEGIN` du test ([Votre propre `BEGIN`](/fr/transaction#your-own-begin)). Donnez ensuite le pool à ce code, et supprimez ce qu’il commite :

<<< ../examples/plain/testing_commits.ts{ts twoslash}

- Le `deletes()` dans `finally` s’exécute même quand une assertion échoue.
- D’ici là, la réservation est visible de toutes les autres connexions : un test portant sur la même séance, lancé au même moment, peut la compter.

## Tester la requête que construit une fonction {#test-the-query-a-function-builds}

Pour une fonction dont le rôle est de transformer son entrée en requête, aucune base n’est nécessaire : [`compile()`](/fr/sql-template#compile) donne le `text` et les `values` que `run()` enverrait. `filmSearch()` construit une recherche à partir des paramètres d’une URL :

```ts twoslash
import * as db from 'zapatos/db';
// ---cut---
function filmSearch(params: URLSearchParams) {
  const words = params.get('title'), before = params.get('before');
  return db.select('films', {
    ...(words === null ? {} : { title: db.conditions.ilike(`%${words}%`) }),
    ...(before === null ? {} : { release_year: db.conditions.lt(Number(before)) }),
  }, { columns: ['title', 'release_year'], order: { by: 'release_year', direction: 'ASC' } });
}
```

Pour `?title=lantern&before=2000` :

<CastPanel example="testing_search">

<<< ../examples/testing_search.ts{ts twoslash}

</CastPanel>

Le test compare la requête compilée de la fonction avec celle de l’appel qu’elle devrait faire, compilée par le même pgcast :

<<< ../examples/plain/testing_search_test.ts{ts twoslash}

- Il échoue quand `filmSearch()` fait un autre appel, et non quand pgcast écrit autrement le SQL du même appel.
- `values` contient plus que votre entrée : `columns` envoie chaque nom comme paramètre (`$1::text`<!-- probe: examples/testing_search.ts -->), et les clés d’un filtre suivent l’ordre alphabétique, `"release_year" < $3`<!-- probe: examples/testing_search.ts --> avant `"title" ILIKE $4`<!-- probe: examples/testing_search.ts -->. Un tableau `values` écrit à la main lie le test à ces deux détails.
- Il ne voit pas ce que seul Postgres refuse : pour `?before=abc`, `lt(Number('abc'))` compile `NaN` des deux côtés, et le test passe, là où Postgres refuse la requête avec 22P02 (`invalid input syntax for type integer: "NaN"`).
- Pour le SQL que vous écrivez vous-même dans un template `sql`, figer son `text` ne pose pas de problème : le texte est le vôtre ([Vérifier le SQL avant de l’exécuter](/fr/raw-sql#check-the-sql-before-you-run-it)).

### Le texte SQL n’est pas une API stable {#the-sql-text-is-not-a-stable-api}

pgcast préserve ce que fait une requête : les lignes qu’elle lit ou écrit, et le type de ce que renvoie `run()`. Il ne préserve pas le texte qu’il compile : une version mineure peut le changer, une paire de parenthèses, l’ordre des clauses, un cast, tant que le résultat ne change pas.

La correction de `not()` est un tel changement : chaque condition sous `not()` gagne une paire de parenthèses, et la plupart correspondent aux mêmes lignes. Un test qui fige le texte de la requête d’un raccourci, ou un fake qui choisit sa réponse en comparant ce texte, peut donc casser lors d’une mise à jour sans que rien ne cloche dans votre code.

## Simuler un résultat typé d’après le schéma {#fake-a-result-typed-from-the-schema}

Pour la logique autour d’une requête, sans aucune base : un faux `Queryable` renvoie les lignes que vous lui donnez, et ces lignes sont typées d’après le schéma, donc une fausse ligne cesse de compiler quand sa table change. Quelques lignes de code à écrire vous-même ; pgcast ne fournit aucun fake.

<<< ../examples/plain/testing_fake.ts{ts twoslash}

- `run()` envoie la requête compilée à `query()` et lit son résultat dans ce qui revient ; le fake ignore la requête.
- Ce n’est ni un `pg.Pool` ni un client, d’où `as unknown as` : un simple `as db.Queryable` ne compile pas (TS2352).
- Une [`transaction()`](/fr/transaction#transaction) à laquelle on donne le fake appelle son `connect()`, qu’il n’a pas : un fake pour du code qui en ouvre une a aussi besoin de `connect()`, qui le renvoie lui-même avec un `release()`, et reçoit aussi `START TRANSACTION …` et `COMMIT` comme requêtes.

Supposons qu’une migration renomme `release_year` : une fois le générateur relancé, chaque fausse ligne qui l’a encore ne compile plus. Ici, une fausse ligne avec une colonne que `films` n’a pas :

```ts twoslash
// @errors: 2353
import * as db from 'zapatos/db';
type Films = db.FullSelectReturnTypeForTable<
  'films', ['title', 'release_year'], undefined, undefined, db.SelectResultMode.Many>;
// ---cut---
const films: Films = [{ title: 'Tidewater', year: 2021 }];
```

Avec `strict` désactivé, `columns` laisse le type au `JSONSelectable` complet de la table ([options de `select()`](/fr/select#options)) : une fausse ligne a alors besoin de toutes les colonnes (TS2739), et `null` convient à chacune.

### Typer chaque résultat {#type-each-result}

| Requête | Le type d’un résultat | Les `rows` du fake |
|---|---|---|
| [`select()`](/fr/select#select) | [`FullSelectReturnTypeForTable`](/fr/select#FullSelectReturnTypeForTable)`<T, C, L, E, M>`, `M` le mode | `[{ result }]`, tout le tableau dans une seule ligne ; `[{ result: [] }]` pour aucune, comme Postgres l’envoie (`[]` donne `undefined`) |
| [`selectOne()`](/fr/select#selectOne), [`selectExactlyOne()`](/fr/select#selectExactlyOne) | le même | `[{ result }]` ; `[]` pour aucune : `undefined` de `selectOne()`, une [`NotExactlyOneError`](/fr/select#NotExactlyOneError) de `selectExactlyOne()` |
| [`count()`](/fr/select#count) et les autres agrégats | `number` | `[{ result }]` |
| [`insert()`](/fr/insert#insert), [`update()`](/fr/insert#update), [`deletes()`](/fr/insert#deletes) | [`ReturningTypeForTable`](/fr/insert#ReturningTypeForTable)`<T, C, E>`, pour chaque ligne | un `{ result }` par ligne |
| [`upsert()`](/fr/insert#upsert) | [`UpsertReturnableForTable`](/fr/insert#UpsertReturnableForTable)`<T, C, E, RA>`, pour chaque ligne | un `{ result }` par ligne |
| Un template [`sql`](/fr/sql-template#sql) | [`RunResultForSQLFragment`](/fr/sql-template#RunResultForSQLFragment)`<typeof query>` | les lignes elles-mêmes |

- `RunResultForSQLFragment` lit `undefined` comme `null`, comme une requête imbriquée revient en JSON : pour un `selectOne()` que vous lancez, `FullSelectReturnTypeForTable` avec `SelectResultMode.One` garde son `undefined`.
- Les raccourcis lisent leur résultat dans une colonne nommée `result`<!-- probe: examples/testing_search.ts -->, qui fait partie du SQL qu’ils compilent : un fake qui répond sous cette forme en dépend, autant que du texte.

### Savoir ce qu’un fake ne vérifie pas {#know-what-a-fake-does-not-check}

- **La requête.** Un filtre sur la mauvaise colonne, une valeur que Postgres refuse (`stars: 6` dans `ratings`, 23514 à cause de son `CHECK`), du SQL qu’il ne sait pas parser : le fake répond quand même.
- **Ce que Postgres renvoie.** Quelles lignes, dans quel ordre, lesquelles valent `null` : le fake renvoie ce qu’on lui donne.
  - Un `timestamptz` revient d’un raccourci sous forme de chaîne dans le fuseau horaire de la session : `2030-03-01T19:30:00+00:00` en UTC, `2030-03-01T20:30:00+01:00` à Paris. Son type, `TimestampTzString`, accepte aussi `2030-03-01T19:30:00Z`. Depuis un template `sql`, `pg` donne un `Date`.
  - Un `bigint` revient d’un raccourci sous forme de nombre JSON, arrondi au-delà de 2<sup>53</sup> : 9007199254740993 arrive en 9007199254740992 ([`customJSONParsingForLargeNumbers`](/fr/generator#generate.customJSONParsingForLargeNumbers)). Depuis un template `sql`, `pg` donne une chaîne.

Une vraie base vérifie les deux : gardez un test contre elle pour chaque requête, et des fakes pour la logique autour.

## Voir aussi {#see-also}

- [SQL brut](/fr/raw-sql#check-the-sql-before-you-run-it) : un test qui garde une entrée hostile dans `values`.
- [Retries](/fr/retries#test-a-retry) : un test qui fait relancer une transaction.
- [`compile()`](/fr/sql-template#compile), [`Queryable`](/fr/sql-template#Queryable), [`transaction()`](/fr/transaction#transaction) : ce qu’ils prennent et ce qu’ils donnent.
- [Pourquoi pgcast](/fr/why) : pourquoi la base est la source des types.
