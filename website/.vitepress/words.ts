// Copyright (C) 2026 Alexandre Demartin
// The site's two languages (README.md § Languages): English at the root, French under `/fr/`, and the words of the
// theme and of the build in each. A page's language is its path's (`langOf`); the theme reads it from VitePress's
// `localeIndex` (theme/words.ts). A word added for one language is added for the other: `Words` holds both to it.

export type Lang = 'en' | 'fr';

export const langs: Lang[] = ['en', 'fr'];

/** The language of a page, from its path in the site's source: `fr/select.md` is French, `select.md` English. */
export const langOf = (relativePath: string): Lang => relativePath.startsWith('fr/') ? 'fr' : 'en';

/**
 * The reader's language, once picked in the switcher (theme/LanguageSwitch.vue), in `localStorage`: the home (`/`) opens
 * in it, else in the browser's, before the first paint (config.ts, `languageHome`).
 */
export const languageKey = 'pgcast-language';

/** What a language puts before a root-relative link: `/fr/select`, `/select`. */
export const prefixOf = (lang: Lang) => lang === 'en' ? '' : `/${lang}`;

const en = {
  label: 'English',
  code: 'EN',  // the language switcher's (theme/LanguageSwitch.vue)
  lang: 'en-GB',
  ogLocale: 'en_GB',
  description: 'Zero-abstraction Postgres for TypeScript: types cast from your database schema.',
  socialAlt: 'pgcast. Your types, cast from your database.',
  // config.ts
  search: 'Search',
  searchDocs: 'Search the docs',
  editLink: 'Edit this page on GitHub',
  previous: 'Previous',
  next: 'Next',
  lastUpdated: 'Last updated',
  onThisPage: 'On this page',
  colourTheme: 'Colour theme',
  changeLanguage: 'Change language',
  returnToTop: 'Return to top',
  menu: 'Menu',
  skipToContent: 'Skip to content',
  playground: 'Playground',
  copyCode: 'Copy code',
  permalink: (title: string) => `Permalink to “${title}”`,
  // theme/
  versionShown: 'Version shown in these docs',
  castPanel: 'What you write, what Postgres runs, what TypeScript knows',
  youWrite: 'You write',
  postgresRuns: 'Postgres runs',
  typescriptKnows: 'TypeScript knows',
  values: 'values',
  openInPlayground: 'Open in playground',
  openInPlaygroundOf: (section: string) => `Open in playground: ${section}`,
  example: (n: number) => `example ${n}`,  // a panel's name, when its section has several
  atAGlance: 'At a glance',
  packageManager: 'Package manager',
  copyCommand: (name: string) => `Copy the ${name} command`,
  copied: 'Copied',
  notCopied: 'Not copied',
  copyPage: 'Copy page',
  moreWays: 'More ways to use this page',
  thisPage: 'This page',
  copyPageDesc: 'Copy page as Markdown for LLMs',
  viewMarkdown: 'View as Markdown',
  viewMarkdownDesc: 'Open this page as plain text',
  openIn: (chat: string) => `Open in ${chat}`,
  newTab: '(new tab)',
  askIn: (chat: string) => `Ask about this page in ${chat}`,
  prompt: (url: string) => `Read ${url} so I can ask questions about it.`,
  theme: { auto: 'system', light: 'light', dark: 'dark' },
  themeTitle: (mode: string) => `Theme: ${mode}`,
  themeLabel: (mode: string) => `Colour theme: ${mode}. Change it`,
  notFound: {
    eyebrow: '-- 404: 0 rows',
    title: 'Page not found',
    lede: "Sorry: there's nothing at this address. The page may have moved, or the link may have a typo. Try a " +
      'search, or start again from one of these.',
    home: 'Home',
  },
  footer: {
    maintained: 'pgcast is maintained by',
    zapatos: 'Zapatos and its original documentation are by',
    licence: 'MIT licence. What changed in each version: the',
    changelog: 'changelog',
  },
  // the diagrams' texts (theme/CatalogFlow.vue, RetryFlow.vue, ValuesFlow.vue)
  diagrams: {
    catalog: {
        title: 'Types read from the catalog, once',
        desc: "Postgres's catalog, pg_catalog and information_schema, is read by pgcast's generator, npx pgcast, which " +
          'writes zapatos/schema.d.ts. From then on, TypeScript checks your code against that file alone, without ' +
          'connecting again.',
        catalog: "Postgres's catalog",
        asks: "pgcast's generator asks it",
        writes: 'and writes the answers down',
        code: 'Your code',
        checked: 'checked against that file alone, no connection',
        caption: 'The generator reads the catalog once; from then on, TypeScript checks your code against the file it wrote.',
      },
    retry: {
        title: 'A transaction retried on 40001 or 40P01',
        desc: 'An attempt: START TRANSACTION, the whole callback on the transaction\'s client, then COMMIT. If all three ' +
          'resolve, transaction() resolves with the callback\'s value. If one rejects with 40001 or 40P01 and an attempt ' +
          'is left, pgcast sends ROLLBACK, waits, 25 to 250 ms by default, and runs a new attempt. On any other error, or ' +
          'the last attempt\'s, it sends ROLLBACK and transaction() rejects with that error.',
        attempt: 'An attempt',
        callback: "the whole callback, on the transaction's client",
        resolve: 'all three resolve',
        gives: " gives the callback's value",
        retried: '40001 or 40P01, and an attempt left',
        wait: 'a wait, 25 to 250 ms by default, then again',
        other: "any other error, or the last attempt's",
        rejects: ' rejects with it',
        caption: 'On 40001 or 40P01, pgcast rolls back, waits and runs the whole attempt again; on any other error, it rolls back and rejects.',
      },
    values: {
        title: 'A value travels beside the SQL, never inside it',
        desc: "The caller's title, x' OR 'a' = 'a, goes to pgcast's select('films', { title }). pgcast sends two things " +
          'apart: the SQL text, ending WHERE ("title" = $1), and the values, ["x\' OR \'a\' = \'a"]. Postgres parses the ' +
          'text first, then binds $1, which by then can only be data: a title no film has, so no row.',
        title2: "The caller's title",
        compiles: 'pgcast compiles',
        sql: 'SQL text',
        values: 'values, beside it',
        parses: '1. parses the text',
        binds: ['2. binds ', ', which by then can only be data'],
        none: '3. finds no film with that title: no row',
        caption: 'The SQL text and the values travel apart: Postgres parses the text before it binds a value.',
      },
  },
  // llms.ts
  source: 'Source',
  runs: 'Postgres runs:',
  valuesLine: 'Values:',
  knows: 'TypeScript knows:',
  write: 'You write:',
  // [page].paths.ts
  coming: (changelog: string) => `::: info Coming
This page isn't written yet. Until it is, George MacKerron's [Zapatos docs](https://jawj.github.io/zapatos/) cover what 6.6.1 does, and the [changelog](${changelog}) what pgcast changes.
:::`,
  // the playground (theme/Playground.vue, theme/PlaygroundEditor.vue)
  playgroundWords: {
    phoneShared: 'The playground edits and runs code on a computer. On a phone, here is the code of this link, read-only.',
    phone: "The playground edits code on a computer. On a phone, here is the tutorial's first query, read-only, with its SQL and its type.",
    broken: (kb: number) => `This link's code could not be read (damaged, or over ${kb} KB), so here is the tutorial's first query.`,
    linkCode: 'The code of this link',
    loading: 'Loading the editor…',
    opened: 'This code comes from a link: it runs only when you press Run, or once you edit it.',
    running: 'Running on Postgres…',
    starting: 'Starting Postgres in this page: about 5 MB to download, the first time…',
    noConst: '// no `const <name> = …` to give the type of',
    stopped: 'The code stopped here: it does not catch this error.',
    noRows: (error: string) => `No rows come back as you type, so the code stopped after its query (Run gives it Postgres): ${error}`,
    noQuery: 'This code sends no query.',
    editor: 'The query, in TypeScript: edit it to update its SQL and its type; Ctrl+Enter, or Command+Enter on a ' +
      'Mac, runs it on Postgres. Tab indents; Ctrl+M, or Ctrl+Shift+M on a Mac, makes Tab move focus out of the editor',
    tooLong: (kb: number) => `Too long to share: a link holds ${kb} KB of code at most.`,
    linkCopied: 'Link copied: it opens this code, which runs only when its reader presses Run.',
    linkInBar: 'The link is in the address bar: copy it from there.',
    run: 'Run',
    share: 'Share',
    returns: 'returns',
    rejects: 'rejects',
    with: 'with',
    colon: ':',
    rows: (n: number) => `${n} row${n === 1 ? '' : 's'}`,
    more: (n: number) => `// and ${n} more`,
  },
};

export type Words = typeof en;

const fr: Words = {
  label: 'Français',
  code: 'FR',
  lang: 'fr-FR',
  ogLocale: 'fr_FR',
  description: 'Postgres sans abstraction pour TypeScript : des types castés depuis le schéma de votre base de données.',
  socialAlt: 'pgcast. Vos types, castés depuis votre base de données.',
  search: 'Rechercher',
  searchDocs: 'Rechercher dans la doc',
  editLink: 'Modifier cette page sur GitHub',
  previous: 'Précédent',
  next: 'Suivant',
  lastUpdated: 'Dernière mise à jour',
  onThisPage: 'Sur cette page',
  colourTheme: 'Thème de couleur',
  changeLanguage: 'Changer de langue',
  returnToTop: 'Revenir en haut',
  menu: 'Menu',
  skipToContent: 'Aller au contenu',
  playground: 'Playground',
  copyCode: 'Copier le code',
  permalink: (title: string) => `Lien vers «\u00a0${title}\u00a0»`,
  versionShown: 'Version décrite dans cette doc',
  castPanel: 'Ce que vous écrivez, ce que Postgres exécute, ce que TypeScript sait',
  youWrite: 'Vous écrivez',
  postgresRuns: 'Postgres exécute',
  typescriptKnows: 'TypeScript sait',
  values: 'valeurs',
  openInPlayground: 'Ouvrir dans le playground',
  openInPlaygroundOf: (section: string) => `Ouvrir dans le playground\u00a0: ${section}`,
  example: (n: number) => `exemple ${n}`,
  atAGlance: 'En bref',
  packageManager: 'Gestionnaire de paquets',
  copyCommand: (name: string) => `Copier la commande ${name}`,
  copied: 'Copié',
  notCopied: 'Non copié',
  copyPage: 'Copier la page',
  moreWays: 'Autres façons d’utiliser cette page',
  thisPage: 'Cette page',
  copyPageDesc: 'Copier la page en Markdown pour les LLM',
  viewMarkdown: 'Voir en Markdown',
  viewMarkdownDesc: 'Ouvrir cette page en texte brut',
  openIn: (chat: string) => `Ouvrir dans ${chat}`,
  newTab: '(nouvel onglet)',
  askIn: (chat: string) => `Poser des questions sur cette page dans ${chat}`,
  prompt: (url: string) => `Lis ${url} pour que je puisse te poser des questions dessus.`,
  theme: { auto: 'système', light: 'clair', dark: 'sombre' },
  themeTitle: (mode: string) => `Thème\u00a0: ${mode}`,
  themeLabel: (mode: string) => `Thème de couleur\u00a0: ${mode}. Le changer`,
  notFound: {
    eyebrow: '-- 404 : 0 ligne',
    title: 'Page introuvable',
    lede: 'Désolé : il n’y a rien à cette adresse. La page a peut-être changé de place, ou le lien contient une ' +
      'faute de frappe. Essayez une recherche, ou repartez de l’une de celles-ci.',
    home: 'Accueil',
  },
  footer: {
    maintained: 'pgcast est maintenu par',
    zapatos: 'Zapatos et sa documentation d’origine sont l’œuvre de',
    licence: 'Licence MIT. Ce qui change à chaque version : le',
    changelog: 'changelog',
  },
  diagrams: {
    catalog: {
        title: 'Des types lus dans le catalogue, une fois',
        desc: 'Le catalogue de Postgres, pg_catalog et information_schema, est lu par le générateur de pgcast, npx ' +
          'pgcast, qui écrit zapatos/schema.d.ts. Dès lors, TypeScript vérifie votre code avec ce seul fichier, sans ' +
          'se reconnecter.',
        catalog: 'Le catalogue de Postgres',
        asks: 'le générateur de pgcast l’interroge',
        writes: 'et note ses réponses',
        code: 'Votre code',
        checked: 'vérifié avec ce seul fichier, sans connexion',
        caption: 'Le générateur lit le catalogue une fois ; dès lors, TypeScript vérifie votre code avec le fichier qu’il a écrit.',
      },
    retry: {
        title: 'Une transaction relancée sur 40001 ou 40P01',
        desc: 'Une tentative : START TRANSACTION, tout le callback sur le client de la transaction, puis COMMIT. Si les ' +
          'trois réussissent, transaction() se résout avec la valeur du callback. Si l’un est rejeté avec 40001 ou ' +
          '40P01 et qu’il reste une tentative, pgcast envoie ROLLBACK, attend, de 25 à 250 ms par défaut, et lance une ' +
          'nouvelle tentative. Sur toute autre erreur, ou celle de la dernière tentative, il envoie ROLLBACK et ' +
          'transaction() est rejetée avec cette erreur.',
        attempt: 'Une tentative',
        callback: 'tout le callback, sur le client de la transaction',
        resolve: 'les trois réussissent',
        gives: ' rend la valeur du callback',
        retried: '40001 ou 40P01, une tentative restante',
        wait: 'une pause, 25 à 250 ms par défaut, puis encore',
        other: 'une autre erreur, ou celle du dernier essai',
        rejects: ' est rejetée avec elle',
        caption: 'Sur 40001 ou 40P01, pgcast annule, attend et relance toute la tentative ; sur toute autre erreur, il annule et rejette.',
      },
    values: {
        title: 'Une valeur voyage à côté du SQL, jamais dedans',
        desc: 'Le titre de l’appelant, x\' OR \'a\' = \'a, va au select(\'films\', { title }) de pgcast. pgcast envoie ' +
          'deux choses séparées : le texte SQL, qui finit par WHERE ("title" = $1), et les valeurs, ["x\' OR \'a\' = ' +
          '\'a"]. Postgres analyse d’abord le texte, puis lie $1, qui ne peut alors être qu’une donnée : un titre ' +
          'qu’aucun film n’a, donc aucune ligne.',
        title2: 'Le titre de l’appelant',
        compiles: 'pgcast compile',
        sql: 'Texte SQL',
        values: 'valeurs, à côté',
        parses: '1. analyse le texte',
        binds: ['2. lie ', ', qui n’est alors qu’une donnée'],
        none: '3. aucun film n’a ce titre : aucune ligne',
        caption: 'Le texte SQL et les valeurs voyagent séparément : Postgres analyse le texte avant de lier une valeur.',
      },
  },
  source: 'Source',
  runs: 'Postgres exécute :',
  valuesLine: 'Valeurs :',
  knows: 'TypeScript sait :',
  write: 'Vous écrivez :',
  coming: (changelog: string) => `::: info À venir
Cette page n’est pas encore écrite. En attendant, la [doc de Zapatos](https://jawj.github.io/zapatos/) de George MacKerron couvre ce que fait la 6.6.1, et le [changelog](${changelog}) ce que pgcast change.
:::`,
  playgroundWords: {
    phoneShared: 'Le playground modifie et exécute du code sur un ordinateur. Sur un téléphone, voici le code de ce lien, en lecture seule.',
    phone: 'Le playground modifie du code sur un ordinateur. Sur un téléphone, voici la première requête du tutoriel, en lecture seule, avec son SQL et son type.',
    broken: (kb: number) => `Le code de ce lien n’a pas pu être lu (abîmé, ou de plus de ${kb} Ko)\u00a0: voici donc la première requête du tutoriel.`,
    linkCode: 'Le code de ce lien',
    loading: 'Chargement de l’éditeur…',
    opened: 'Ce code vient d’un lien : il ne s’exécute que quand vous appuyez sur Exécuter, ou une fois que vous le modifiez.',
    running: 'Exécution sur Postgres…',
    starting: 'Démarrage de Postgres dans cette page : environ 5 Mo à télécharger, la première fois…',
    noConst: '// pas de `const <nom> = …` dont donner le type',
    stopped: 'Le code s’est arrêté ici : il n’intercepte pas cette erreur.',
    noRows: (error: string) => `Aucune ligne ne revient pendant la saisie, donc le code s’est arrêté après sa requête (Exécuter lui donne Postgres)\u00a0: ${error}`,
    noQuery: 'Ce code n’envoie aucune requête.',
    editor: 'La requête, en TypeScript : modifiez-la pour mettre à jour son SQL et son type ; Ctrl+Entrée, ou ' +
      'Commande+Entrée sur un Mac, l’exécute sur Postgres. Tab indente ; Ctrl+M, ou Ctrl+Maj+M sur un Mac, fait sortir ' +
      'le focus de l’éditeur avec Tab',
    tooLong: (kb: number) => `Trop long pour être partagé\u00a0: un lien contient ${kb} Ko de code au plus.`,
    linkCopied: 'Lien copié : il ouvre ce code, qui ne s’exécute que quand la personne qui le reçoit appuie sur Exécuter.',
    linkInBar: 'Le lien est dans la barre d’adresse : copiez-le depuis là.',
    run: 'Exécuter',
    share: 'Partager',
    returns: 'renvoie',
    rejects: 'rejette',
    with: 'avec',
    colon: '\u00a0:',
    rows: (n: number) => `${n} ligne${n > 1 ? 's' : ''}`,
    more: (n: number) => `// et ${n} de plus`,
  },
};

export const words: Record<Lang, Words> = { en, fr };
