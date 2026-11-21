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

Importez `Row` depuis le fichier que l’outil va générer. Donnez un nom littéral à la requête dans le second argument de type de `db.sql`. Ici, `Row<'films-by-studio'>` décrit un film et `[]` indique que `.run(pool)` renvoie un tableau de ces films.

<CastPanel example="typed_sql_films">

<<< ../examples/typed_sql_films.ts{ts twoslash}

</CastPanel>

## 3. Générer les types de ligne {#generate-the-rows}

Placez-vous dans le dossier de votre configuration pgcast. Pour vous connecter à la base où les migrations ont été appliquées, utilisez l’option `db` ou les variables d’environnement de `pg`. Reprenez le rôle et le `search_path` de l’application.

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
| Omettre `db` | La vérification s’effectue hors ligne, même si les variables d’environnement de `pg` sont définies. L’outil compare les noms des requêtes et leur SQL (avec les paramètres `$1`, `$2`, etc.) au contenu du fichier commité. Il en vérifie le format. Les types de ligne ne sont pas vérifiés. |
| Faire pointer `db` vers la base où les migrations ont été appliquées | Demande à Postgres de décrire à nouveau chaque requête et compare le résultat au fichier commité octet par octet, types de ligne compris. |

Dans les deux cas, le fichier reste intact. L’outil se termine avec le code `1` s’il trouve une différence ou rencontre une erreur. Après une modification de la requête ou du schéma, régénérez le fichier et commitez les changements.

## 5. Affiner le type d’une colonne {#narrow-a-column}

Le type généré de `total` est `string | null` car Postgres n’associe le résultat du comptage à aucune colonne d’origine. Même sur une table vide, `count(*)` renvoie un nombre et `pg` décode ce `bigint` en chaîne. Utilisez `NotNull` si vous savez que la **valeur décodée** du champ ne peut jamais être nulle.

<CastPanel example="typed_sql_count">

<<< ../examples/typed_sql_count.ts{ts twoslash}

</CastPanel>

## Ce qui reste manuel {#what-stays-manual}

- **Paramètres.** Vérifiez vous-même les valeurs d’entrée. L’outil décrit les résultats selon les parseurs de texte par défaut de `pg`.
- **Interpolations.** Utilisez des identifiants littéraux ou `param()`. Un cast littéral ou `false` fixe le SQL du paramètre. L’outil accepte jusqu’à quatre appels à `param()` sans cast ou avec `true`. Leur SQL peut prendre deux formes, avec ou sans cast en JSON. Pour les conditions, les variables interpolées directement, les appels de fonctions utilitaires, `raw()` ou les fragments imbriqués, écrivez vous-même le type de ligne.
- **Nullabilité.** Un champ garde `| null` quand l’outil ne peut pas établir qu’il provient d’une colonne de table non nullable. Une jointure externe peut rendre tous les champs nullables dans le type. Gardez `| null` sauf si la requête garantit que la valeur décodée ne peut pas être nulle.
- **Régénération.** Relancez la commande après chaque modification du SQL ou du schéma. L’outil ne propose pas encore `--watch`.
