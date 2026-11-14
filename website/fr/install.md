---
english: 9c64829a7a52
---

# Installation

pgcast garde les noms de modules de Zapatos, vous l’installez donc sous l’alias `zapatos`. Rien ne change dans vos imports.
{.lede}

## Prérequis {#requirements}

- Postgres. La suite de tests tourne sur les versions 14, 16 et 18.
- Node, et `pg` (node-postgres), avec `@types/pg` pour TypeScript.
- TypeScript 5.7 ou plus récent. `@types/pg` installe aussi `@types/node` et `pg-protocol`, dont les types en ont désormais besoin ; c’est aussi le cas du type de [`toBuffer()`](/fr/runtime-config#toBuffer), `Buffer<ArrayBuffer>`, comme dans Zapatos 6.6.1.

### Sur un TypeScript plus ancien {#on-an-older-typescript}

Les types de pgcast eux-mêmes remontent à TypeScript 4.1, le premier à avoir les template literal types. Sous la 5.7, dites à TypeScript de ne pas vérifier les types de `node_modules` (`toBuffer()` renvoie alors `any`) :

::: code-group

```json [tsconfig.json]
{
  "compilerOptions": {
    "skipLibCheck": true
  }
}
```

:::

- À partir de la 5.0, c’est tout.
- Sous la 5.0, TypeScript ne sait pas lire le `@types/node` d’aujourd’hui. Installez celui fait pour votre version, par son tag, et figez sa version : ici pour la 4.1, `ts4.9` pour la 4.9.

```sh
npm install --save-dev --save-exact @types/node@ts4.1
```

::: warning Schéma périmé
`skipLibCheck` ignore aussi votre `schema.d.ts` généré. Après une mise à jour de pgcast, un schéma que vous n’avez pas régénéré n’échoue plus sur `schemaVersionCanary` ([Quand le schéma change](/fr/first-query#when-the-schema-changes)) : lancez `npx pgcast` à chaque fois.
:::

## Ajouter le paquet {#add-the-package}

::: code-group

```sh [npm]
npm install zapatos@npm:@pgcast/pgcast pg
npm install --save-dev @types/pg
```

```sh [pnpm]
pnpm add zapatos@npm:@pgcast/pgcast pg
pnpm add -D @types/pg
```

```sh [yarn]
yarn add zapatos@npm:@pgcast/pgcast@^6 pg
yarn add -D @types/pg
```

```sh [bun]
bun add zapatos@npm:@pgcast/pgcast@^6 pg
bun add -d @types/pg
```

:::

Yarn 2 et les versions suivantes exigent une plage de versions dans un alias, et Yarn 1 et bun avant 1.4 n’en écrivent aucune sans elle : d’où le `@^6`.

::: tip Pourquoi l’alias
Le schéma généré et le runtime parlent de `zapatos/db` et de `zapatos/schema`. Si le paquet était installé sous son seul nom, `@pgcast/pgcast`, ces imports ne se résoudraient pas. Des noms `pgcast/*` natifs viendront plus tard, en opt-in ([décision 002](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/002-module-names.md)).
:::

Déjà sur Zapatos ? Le passage tient en une ligne de `package.json`, puis un coup d’œil aux quelques appels dont le résultat change : [Venir de Zapatos](/fr/switching).

Voilà pgcast dans votre projet. Ensuite, [Première requête](/fr/first-query) génère les types d’une base de données, puis exécute avec eux une lecture et une insertion.

Vous travaillez avec un assistant ? Il peut lire cette doc depuis [llms.txt](/fr/llms.txt), un index des pages, ou [llms-full.txt](/fr/llms-full.txt), toutes les pages en un seul fichier.
