# SQL typé

À partir de `@pgcast/typegen` 0.1.0. Demandez à Postgres le type de ligne d’une [requête SQL brute](/fr/raw-sql) et conservez-le à côté du schéma généré.
{.lede}

## 1. Installer l’outil {#install}

Dans votre projet pgcast, ajoutez l’outil aux dépendances de développement dès sa publication. Ses peer dependencies sont `@pgcast/pgcast`, `pg` et `typescript`. Le paquet principal et l’alias que vous importez sous le nom `zapatos/db` doivent avoir la même version.

```sh
npm install --save-dev @pgcast/typegen
```

La génération et la vérification utilisent l’API JavaScript du parseur de TypeScript. Si votre compilateur sort de la [plage de versions prise en charge](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/012-raw-sql-types.md#3-naming-finding-writing-checking), exécutez l’outil avec une installation compatible de TypeScript en développement ou en CI. Votre application peut compiler séparément les types commités.

## 2. Nommer la requête {#name-the-query}

Importez `Row` depuis le fichier que l’outil va générer. Dans le second argument de type de `db.sql`, donnez à la requête un nom littéral. Ici, `Row<'films-by-studio'>` décrit un film et `[]` donne au résultat de `.run(pool)` son type de tableau.

<CastPanel example="typed_sql_films">

<<< ../examples/typed_sql_films.ts{ts twoslash}

</CastPanel>

## 3. Générer les types de ligne {#generate-the-rows}

Depuis le dossier de votre configuration pgcast, connectez-vous à la base après migration avec l’option `db` ou les variables d’environnement de pg. Utilisez le même rôle et le même `search_path` que l’application.

```sh
npx --no-install pgcast-typegen
```

L’outil parcourt le projet décrit par `tsconfig.json` (ou `--project <tsconfig>`) et demande à Postgres de décrire les requêtes nommées sans les exécuter. Commitez `<outDir>/zapatos/queries.ts` à côté du schéma. Avec `moduleNames: "pgcast"`, importez les types depuis le fichier généré `pgcast/queries.ts` et utilisez `pgcast/db`.

## 4. Vérifier en CI {#check-in-ci}

```sh
npx --no-install pgcast-typegen --check
```

| Configuration | Ce que l’outil compare |
|---|---|
| Omettre `db` | Hors ligne, même si les variables d’environnement de pg sont définies. Compare les noms des requêtes et leur SQL avec ses paramètres au fichier commité, et vérifie son format. Les types de ligne restent sans vérification. |
| Faire pointer `db` vers la base après migration | Décrit à nouveau chaque requête et compare le fichier généré octet par octet, types de ligne compris. |

Dans les deux cas, le fichier reste intact. Une différence ou une erreur donne le code de sortie 1. Après une modification de la requête ou du schéma, régénérez le fichier et commitez les changements.

## 5. Affiner le type d’une colonne {#narrow-a-column}

Le type généré de `total` est `string | null` : Postgres n’associe aucune colonne d’origine au résultat du comptage. Même sur une table vide, `count(*)` renvoie un nombre et pg décode ce `bigint` en chaîne. Utilisez `NotNull` pour un champ dont vous savez que la **valeur décodée** ne peut jamais être nulle.

<CastPanel example="typed_sql_count">

<<< ../examples/typed_sql_count.ts{ts twoslash}

</CastPanel>

## Ce qui reste manuel {#what-stays-manual}

- **Paramètres.** Vérifiez vous-même les valeurs en entrée. L’outil décrit les résultats selon les parseurs de texte par défaut de pg.
- **Interpolations.** Utilisez des identifiants littéraux ou `param()`. Un cast littéral ou `false` fixe le SQL du paramètre. Au plus quatre appels sans cast ou avec `true` peuvent prendre deux formes, avec ou sans cast en JSON. Pour les conditions, les variables interpolées directement, les appels de fonctions utilitaires, `raw()` ou les fragments imbriqués, écrivez vous-même le type de ligne.
- **Nullabilité.** Un champ garde `| null` quand l’outil ne peut pas prouver qu’il provient d’une colonne de table non nullable. Une jointure externe peut rendre tous les champs nullables dans le type. Gardez l’union sauf si la requête garantit que la valeur décodée ne peut pas être nulle.
- **Régénération.** Relancez la commande après chaque modification du SQL ou du schéma. L’outil ne propose pas encore `--watch`.
