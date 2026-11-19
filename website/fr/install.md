---
english: 053c751ab17f
---

# Installation

À partir de la 6.7.0, vous installez pgcast sous son propre nom et importez `pgcast/db`. Un projet qui vient de Zapatos [installe la 6.x sous l’alias `zapatos`](/fr/switching#swap-the-package) et garde ses imports.
{.lede}

## Prérequis {#requirements}

- Postgres. La suite de tests tourne sur les versions 14, 16 et 18.
- Node et `pg` (node-postgres) pour exécuter des requêtes et lancer le générateur en JavaScript.
- À partir de la 7.0.0, les peer dependencies `typescript` et `@types/pg`, utilisées pour la vérification des types, sont facultatives. Ajoutez-les à vos `devDependencies` pour vérifier les types. TypeScript 5.7 ou plus récent est nécessaire pour vérifier les déclarations de `@types/node` et de `pg-protocol`, qu’installe `@types/pg`, ainsi que le type de retour de [`toBuffer()`](/fr/runtime-config#toBuffer), `Buffer<ArrayBuffer>`.

::: code-group

```sh [npm]
npm install --save-dev typescript @types/pg
```

```sh [pnpm]
pnpm add -D typescript @types/pg
```

```sh [yarn]
yarn add -D typescript @types/pg
```

```sh [bun]
bun add -d typescript @types/pg
```

:::

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
`skipLibCheck` ignore aussi votre `schema.d.ts` généré. Après une mise à jour de pgcast, un schéma que vous n’avez pas régénéré n’échoue plus sur `schemaVersionCanary` ([Quand le schéma change](/fr/first-query#when-the-schema-changes)) : lancez `npx pgcast` à chaque fois, et [`npx pgcast --check`](/fr/generator#check) en CI, qui échoue tant qu’un fichier généré est périmé.
:::

## Ajouter le paquet {#add-the-package}

### Sous son propre nom {#under-its-own-name}

::: code-group

```sh [npm]
npm install pgcast@npm:@pgcast/pgcast pg
```

```sh [pnpm]
pnpm add pgcast@npm:@pgcast/pgcast pg
```

```sh [yarn]
yarn add pgcast@npm:@pgcast/pgcast@^7 pg
```

```sh [bun]
bun add pgcast@npm:@pgcast/pgcast@^7 pg
```

:::

Indiquez ensuite `"moduleNames": "pgcast"` dans `pgcastconfig.json`, le fichier de configuration du générateur ([La CLI](/fr/generator#cli)), et importez `pgcast/db` et `pgcast/schema` ([`moduleNames`](/fr/generator#generate.moduleNames)).

La plage `^7` sélectionne les versions 7.x de pgcast. Depuis la version 2, Yarn exige une plage de versions dans un alias. Yarn 1 et les versions de Bun antérieures à la 1.4 n’enregistrent cette plage que si vous la précisez.

### Sous l’alias `zapatos` {#under-the-zapatos-alias}

Vous partez de Zapatos 6.6.1 ? Utilisez les [commandes qui limitent l’installation à la 6.x](/fr/switching#swap-the-package) pour voir les avertissements de migration de pgcast. Vous utilisez déjà pgcast 6.x ? Suivez le [guide de migration vers la 7.0](/fr/switching#from-7-0).

::: tip Pourquoi l’alias
Vos imports et le schéma généré nomment le paquet par son dossier dans `node_modules` : `pgcast/db` ou `zapatos/db`. Installé sous son seul nom, `@pgcast/pgcast`, il atterrit dans `node_modules/@pgcast/pgcast`, où ni l’un ni l’autre ne se résout. L’alias nomme le dossier, et `moduleNames` doit lui correspondre ([décision 002](https://github.com/AlexandreDemartin/pgcast/blob/master/docs/decisions/002-module-names.md)).
:::

Voilà pgcast dans votre projet. Ensuite, [Première requête](/fr/first-query) génère les types d’une base de données, puis exécute avec eux une lecture et une insertion.

Vous travaillez avec un assistant ? Il peut lire cette doc depuis [llms.txt](/fr/llms.txt), un index des pages, ou [llms-full.txt](/fr/llms-full.txt), toutes les pages en un seul fichier.
