---
english: ad28a2a5731d
---

# Sécurité

Ce qui empêche l’entrée d’un appelant de changer le SQL qu’envoie pgcast, ce contre quoi il ne peut rien, et comment signaler une faille. Les étapes sont dans [SQL brut](/fr/raw-sql) ; cette page en donne le pourquoi.
{.lede}

<AtAGlance>

- Les valeurs voyagent comme paramètres, à côté du texte SQL ; les noms sont entre guillemets ; les mots-clés viennent d’une liste fermée.
- `raw()` est la seule porte par laquelle une chaîne devient du code : ne lui donnez que vos propres constantes.
- Du SQL valide peut encore faire autre chose que prévu : la chaîne d’un appelant comme nom, un filtre vide, un objet qui n’est pas un filtre.

</AtAGlance>

## Les valeurs n’entrent jamais dans le SQL {#values-never-enter-the-sql}

Chaque valeur qu’envoie pgcast, venue d’un filtre, d’un `insert()` ou d’un [`param()`](/fr/sql-template#param), devient un paramètre numéroté, `$1`, et voyage à côté du texte SQL plutôt qu’à l’intérieur. Postgres analyse d’abord le texte, et lie les valeurs ensuite : à ce stade, une valeur ne peut être qu’une donnée.

<ValuesFlow />

pgcast n’échappe jamais une valeur, il n’y a donc aucun échappement à rater. C’est le fondement de Zapatos, gardé tel quel.

<CastPanel example="security_values">

<<< ../examples/security_values.ts{ts twoslash}

</CastPanel>

Écrit dans le texte, ce titre fermerait sa chaîne et correspondrait à tous les films : `("title" = 'x' OR 'a' = 'a')`. Sous la forme `("title" = $1)`<!-- probe: examples/security_values.ts -->, c’est un titre qu’aucun film ne porte, et la requête n’en renvoie aucun.

La séparation a un second effet. node-postgres envoie une requête avec valeurs par le protocole étendu de Postgres, où une requête est une seule instruction : `SELECT $1::int; SELECT 2` est refusé avec « cannot insert multiple commands into a prepared statement » (42601).

Une requête sans valeurs, et sans nom `.prepared()`, part en texte simple, où un `;` peut commencer une seconde instruction. C’est pourquoi les failles décrites plus bas étaient les plus graves dans une requête sans paramètres.

## Les noms sont entre guillemets, pas des paramètres {#names-are-quoted-not-parameters}

Un paramètre tient lieu d’une valeur, jamais d’une table ou d’une colonne : `SELECT * FROM $1` est une erreur de syntaxe (42601). Les noms vont donc dans le texte, et pgcast les protège deux fois :

1. **Le type** : `Table` et `Column` sont des unions des noms que le générateur a lus dans le catalogue, donc un nom que vous écrivez est un nom que la base possède.
2. **Les guillemets**, car le type disparaît à l’exécution et des noms peuvent arriver sans passer par lui : les clés du corps JSON d’une requête HTTP, données à `select()` comme filtre, sont des noms de colonnes.

Chaque chaîne que pgcast écrit comme nom est mise entre guillemets doubles et découpée à chaque `.`, chaque `"` qu’elle contient doublé, sauf si c’est déjà un nom entre guillemets bien formé (`'"title"'` donne `"title"`<!-- probe: db.sql`${'"title"'}` -->, `'a""b'` reste `"a""b"`<!-- probe: db.sql`${'a""b'}` -->). Elle ne peut donc jamais fermer ses guillemets :

<CastPanel example="security_names">

<<< ../examples/security_names.ts{ts twoslash}

</CastPanel>

La clé reste un seul nom, une colonne qui n’existe pas (42703). Zapatos 6.6.1 faisait ici confiance au type (sa doc avertissait de ne jamais le contourner), et écrivait cette clé sous la forme `("title" = "title" OR TRUE OR "title" = $1)`, ce qui renvoie tous les films ; sans paramètres, un tel nom pouvait exécuter une seconde instruction.

Le type refuse une telle clé dans un objet littéral (TS2353). Un objet construit à l’exécution (un `Record<string, string>`, `Object.fromEntries()`, une variable avec des clés en trop) la laisse passer, comme le font `any` et le JavaScript sans types. Toutes les règles des guillemets, y compris pour un nom déjà mis entre guillemets à la main : [Identifiants](/fr/sql-template#identifiers).

## Les mots-clés sont vérifiés avant toute requête {#keywords-are-checked-before-any-query}

Certains morceaux de SQL ne sont ni une valeur ni un nom : `DESC`, `FOR UPDATE`, `SERIALIZABLE`, `RESTART IDENTITY`, le nom d’un agrégat. pgcast les écrit tels quels dans le texte, donc il ne les prend que dans une liste fermée, ou, pour un agrégat, que sous forme de nom de fonction.

Le type dit lesquels ; à l’exécution, pgcast vérifie de nouveau et lève une erreur avant toute requête, car un cast, un `any` ou un corps JSON peut lui passer n’importe quoi : un `lock` valant `{ for: 'UPDATE; DROP TABLE ratings; --' }` lève l’erreur "Lock strength must be UPDATE/NO KEY UPDATE/SHARE/KEY SHARE, not '…'"<!-- message -->.

Les valeurs qui n’ont pas de sens là où elles se trouvent sont refusées de la même façon : `db.Default`, `db.self` ou `db.raw()` comme valeur de filtre lève une erreur à la compilation, donc la promesse de `.run()` est rejetée avant que quoi que ce soit n’atteigne Postgres. Zapatos 6.6.1 les envoyait comme chaînes ou comme JSON : aucune ligne ne correspondait sur une colonne de texte, toutes sous `ne()` et `isNotIn()`, et les autres types échouaient.

Une telle valeur est un bug du code appelant, et un bug ne devrait pas devenir une requête. Chacune de ces erreurs, avec ce qui la lève : [Erreurs que pgcast lève avant toute requête](/fr/transaction#errors-pgcast-throws-before-any-query). Les distinguer de celles de Postgres : [Erreurs](/fr/handle-errors#fix-the-errors-pgcast-throws).

## `raw()` est la seule porte {#raw-is-the-one-door}

[`raw()`](/fr/sql-template#raw) écrit sa chaîne telle quelle dans le SQL : c’est la seule interpolation où une chaîne devient du code, et son type accepte n’importe quelle chaîne. C’est son rôle, pour une syntaxe qu’aucun paramètre ne peut remplacer, choisie par votre propre code.

::: warning Sécurité
Avec le texte d’un appelant, `raw()` laisse l’appelant écrire votre requête. Il ne reçoit donc jamais que vos constantes, et le choix d’un appelant est mis en correspondance avec l’une d’elles ([Choisir le SQL à l’exécution parmi vos propres constantes](/fr/raw-sql#choose-sql-at-run-time-from-your-own-constants)). pgcast ne peut pas vérifier ce que vous y mettez, c’est pourquoi `SECURITY.md` exclut de son périmètre le SQL écrit dans `raw()`.
:::

Comme valeur de filtre, `raw()` lève une erreur. Zapatos 6.6.1 l’y envoyait comme paramètre par accident, son enveloppe en JSON ; le compiler comme SQL aurait fait de chaque `{ title: db.raw(input) }` une injection. Il n’est donc ni l’un ni l’autre : pour comparer une colonne à du SQL, écrivez un fragment, où `db.self` tient lieu de la colonne.

## Ce qui a changé depuis Zapatos 6.6.1 {#what-changed-from-zapatos-6-6-1}

La caractérisation de Zapatos 6.6.1 a trouvé sept façons pour la chaîne d’un appelant d’atteindre le SQL comme du code. pgcast les a toutes fermées, et refuse les valeurs dont un filtre n’a que faire :

<div class="stack">

| Ce qui atteint pgcast | Zapatos 6.6.1 | pgcast |
|---|---|---|
| un `"` dans un nom : une table, une colonne, une clé de filtre, `cols()`, `order.by` | ferme ses guillemets | doublé : `'a"b'` donne `"a""b"`<!-- probe: db.sql`${'a"b'}` --> |
| une chaîne qui commence et finit par `"` | écrite telle quelle | telle quelle seulement si c’est un nom entre guillemets bien formé |
| le type de `param(x, cast)` | écrit tel quel entre guillemets | tel quel s’il est bien formé une fois entre guillemets (`pg_catalog"."int4`) ; sinon un seul nom entre guillemets, chaque `"` doublé |
| une clé de `lateral`, ou l’`alias` ou le nom de table de `select()` | insérés dans `"lateral_…"` et `"sq_…"` | un seul nom là aussi |
| `lock.for`, `lock.wait`, les options de `truncate()`, le niveau de `transaction()` | écrits tels quels | vérifiés : toute autre valeur lève une erreur |
| l’`aggregate` de `select()` | écrit tel quel | un nom de fonction, sinon une erreur |
| une chaîne dans les `updateValues` de `upsert()` | un nom de colonne | un paramètre |
| `db.Default`, `db.self`, `db.raw()`, `db.cols()` ou `db.vals()` comme valeur de filtre | une chaîne, ou du JSON | lève une erreur |

</div>

Zapatos 6.6.1 vérifiait déjà `order.direction` et `order.nulls`. Chaque faille, ce qu’elle laissait passer et le test qui la fige : le [rapport de caractérisation](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/CHARACTERISATION-REPORT.md#security) ; le SQL avant et après : [le changelog](/fr/changelog#6.6.2-security).

## Ce contre quoi pgcast ne peut rien {#what-pgcast-can-t-guard-against}

pgcast empêche l’entrée d’un appelant de devenir du code ; il ne peut pas savoir si le SQL fait ce que vous vouliez. Dans les trois cas ci-dessous, le SQL est valide, et fait autre chose que prévu.

### La chaîne d’un appelant comme nom {#a-caller-s-string-as-a-name}

Entre guillemets, un nom reste celui qu’a choisi l’appelant :

- Comme nom de table, `'schema.table'` compris, c’est n’importe quelle relation que le rôle peut lire : avec `'pg_catalog.pg_roles'`, `select()` liste les rôles de la base.
- Comme nom de colonne, c’est n’importe quelle colonne à portée, y compris une colonne système comme `xmin`, ou aucune (42703). `` ${'title'} = ${title} ``, avec `title` typé `any` et valant `'title'`, compile en `"title" = "title"`<!-- probe: db.sql`${'title'} = ${'title'}` -->, vrai pour chaque film.

Faites correspondre le choix d’un appelant à un nom de votre propre liste, et souvenez-vous que les clés du corps d’une requête HTTP, données comme filtre, sont aussi des noms.

### Un filtre vide {#an-empty-filter}

Un filtre, ce sont ses conditions jointes par `AND`, et aucune condition du tout donne `TRUE`, comme dans Zapatos. Un filtre construit à partir de champs facultatifs tous absents correspond donc à chaque ligne :

<CastPanel example="security_empty_filter">

<<< ../examples/security_empty_filter.ts{ts twoslash}

</CastPanel>

::: warning Sécurité
Dans `deletes()` ou `update()`, un filtre vide désigne chaque ligne : `removeRatings()` les supprime toutes. Avant d’écrire avec un filtre construit à l’exécution, vérifiez qu’il a une clé, et aucune condition qui vaut `TRUE` quelle que soit la ligne, comme `isNotIn([])`.
:::

### Un objet qui n’est pas un filtre {#an-object-that-is-not-a-filter}

Un objet interpolé qui n’est pas l’une des valeurs de pgcast compile comme un filtre de ses propres clés énumérables : une instance de classe donne ses champs, et `TRUE` quand elle n’en a pas.

Un objet natif du realm qui exécute pgcast (`Date`, `Map`, `Promise`, un tableau typé, …) lève une erreur avant toute requête ; un objet d’un autre realm, comme un contexte `vm`, non. Dans Zapatos 6.6.1, `` db.sql`DELETE FROM ${'ratings'} WHERE ${when}` ``, avec `when` une `Date` typée `any`, compilait en `DELETE FROM "ratings" WHERE TRUE` ([Objets Whereable](/fr/sql-template#whereable)). Passez une date comme `db.param(when)`.

## Signaler une faille {#report-a-flaw}

Si vous pensez avoir trouvé une faille dans pgcast (le SQL qu’il compile à partir de l’entrée d’un appelant, ou le code qu’écrit le générateur), signalez-la en privé : [signalez une vulnérabilité](https://github.com/AlexandreDemartin/pgcast/security/advisories/new) depuis l’onglet Security du dépôt, jamais dans une issue publique.

Donnez l’appel, le SQL que donne son `.compile()`, et ce que contrôle un attaquant ; une faille que pgcast partage avec Zapatos se signale ici aussi.

Vous aurez une réponse sous une semaine. La correction sort dans une version de correctif, avec un avis de sécurité GitHub et son CVE, publié à une date convenue avec vous, et vous êtes crédité dans l’avis et dans le CHANGELOG, sauf si vous préférez ne pas être nommé.

Ce qui entre dans le périmètre, et quelles versions sont prises en charge : [SECURITY.md](https://github.com/AlexandreDemartin/pgcast/blob/master/SECURITY.md).

## Pour aller plus loin {#further-reading}

- [SQL brut](/fr/raw-sql) : les étapes, des paramètres à `raw()` avec vos propres constantes.
- [Template SQL](/fr/sql-template) : chaque interpolation et le SQL qu’elle donne, dont [Identifiants](/fr/sql-template#identifiers) et [Objets Whereable](/fr/sql-template#whereable).
- [Erreurs](/fr/handle-errors) : les erreurs de pgcast lui-même, et celles de Postgres.
- [`SECURITY.md`](https://github.com/AlexandreDemartin/pgcast/blob/master/SECURITY.md) : périmètre, modèle de menace et versions prises en charge.
