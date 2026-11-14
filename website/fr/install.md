---
english: 062a04037b46
---

# Installation

À partir de la 6.7.0, vous installez pgcast sous son propre nom et importez `pgcast/db`. Un projet qui vient de Zapatos l’installe plutôt sous l’alias `zapatos`, et garde ses imports.
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

### Sous son propre nom {#under-its-own-name}

::: code-group

```sh [npm]
npm install pgcast@npm:@pgcast/pgcast pg
npm install --save-dev @types/pg
```

```sh [pnpm]
pnpm add pgcast@npm:@pgcast/pgcast pg
pnpm add -D @types/pg
```

```sh [yarn]
yarn add pgcast@npm:@pgcast/pgcast@^6.7 pg
yarn add -D @types/pg
```

```sh [bun]
bun add pgcast@npm:@pgcast/pgcast@^6.7 pg
bun add -d @types/pg
```

:::

Indiquez ensuite `"moduleNames": "pgcast"` dans `pgcastconfig.json`, le fichier de configuration du générateur ([La CLI](/fr/generator#cli)), et importez `pgcast/db` et `pgcast/schema` ([`moduleNames`](/fr/generator#generate.moduleNames)).

Yarn 2 et les versions suivantes exigent une plage de versions dans un alias, et Yarn 1 et bun avant 1.4 n’en écrivent aucune sans elle : d’où le `@^6.7`, la première version qui a `moduleNames`.

::: info À venir
La 6.7.0 n’est pas encore sur npm : la 6.6.2 ne lit que `zapatosconfig.json`, ignore `moduleNames` et écrit `zapatos/`, et les commandes yarn et bun ne trouvent aucune version. D’ici là, installez-le sous l’alias `zapatos` ([le jalon](https://github.com/AlexandreDemartin/pgcast/milestone/1)).
:::

### Sous l’alias `zapatos` {#under-the-zapatos-alias}

Pour un projet qui vient de Zapatos, dont les imports restent `zapatos/*`, et pour un nouveau projet jusqu’à la 6.7.0 :

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

Ici, n’importe quelle 6.x convient : `@^6`.

::: tip Pourquoi l’alias
Vos imports et le schéma généré nomment le paquet par son dossier dans `node_modules` : `pgcast/db` ou `zapatos/db`. Installé sous son seul nom, `@pgcast/pgcast`, il atterrit dans `node_modules/@pgcast/pgcast`, où ni l’un ni l’autre ne se résout. L’alias nomme le dossier, et `moduleNames` doit lui correspondre ([décision 002](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/002-module-names.md)).
:::

Déjà sur Zapatos ? Le passage tient en une ligne de `package.json`, puis un coup d’œil aux quelques appels dont le résultat change : [Venir de Zapatos](/fr/switching).

Voilà pgcast dans votre projet. Ensuite, [Première requête](/fr/first-query) génère les types d’une base de données, puis exécute avec eux une lecture et une insertion.

Vous travaillez avec un assistant ? Il peut lire cette doc depuis [llms.txt](/fr/llms.txt), un index des pages, ou [llms-full.txt](/fr/llms-full.txt), toutes les pages en un seul fichier.
