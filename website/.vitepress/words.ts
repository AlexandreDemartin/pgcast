// Copyright (C) 2026 Alexandre Demartin
// The site's two languages (README.md § Languages): English at the root, French under `/fr/`, and the words of the
// theme and of the build in each. A page's language is its path's (`langOf`); the theme reads it from VitePress's
// `localeIndex` (theme/words.ts). A word added for one language is added for the other: `Words` holds both to it.

export type Lang = 'en' | 'fr';

export const langs: Lang[] = ['en', 'fr'];

/** The language of a page, from its path in the site's source: `fr/select.md` is French, `select.md` English. */
export const langOf = (relativePath: string): Lang => relativePath.startsWith('fr/') ? 'fr' : 'en';

/** What a language puts before a root-relative link: `/fr/select`, `/select`. */
export const prefixOf = (lang: Lang) => lang === 'en' ? '' : `/${lang}`;

const en = {
  label: 'English',
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
  lang: 'fr-FR',
  ogLocale: 'fr_FR',
  description: 'Postgres sans abstraction pour TypeScript : des types moulés sur le schéma de votre base.',
  socialAlt: 'pgcast. Vos types, moulés sur votre base.',
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
  versionShown: 'Version décrite dans cette doc',
  castPanel: 'Ce que vous écrivez, ce que Postgres exécute, ce que TypeScript sait',
  youWrite: 'Vous écrivez',
  postgresRuns: 'Postgres exécute',
  typescriptKnows: 'TypeScript sait',
  values: 'valeurs',
  openInPlayground: 'Ouvrir dans le playground',
  openInPlaygroundOf: (section: string) => `Ouvrir dans le playground : ${section}`,
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
  themeTitle: (mode: string) => `Thème : ${mode}`,
  themeLabel: (mode: string) => `Thème de couleur : ${mode}. Le changer`,
  notFound: {
    eyebrow: '-- 404 : 0 ligne',
    title: 'Page introuvable',
    lede: 'Désolé : il n’y a rien à cette adresse. La page a peut-être changé de place, ou le lien contient une ' +
      'faute de frappe. Essayez une recherche, ou repartez de l’une de celles-ci.',
    home: 'Accueil',
  },
  footer: {
    maintained: 'pgcast est maintenu par',
    zapatos: 'Zapatos et sa documentation d’origine sont l’œuvre de',
    licence: 'Licence MIT. Ce qui change à chaque version : le',
    changelog: 'changelog',
  },
  source: 'Source',
  runs: 'Postgres exécute :',
  valuesLine: 'Valeurs :',
  knows: 'TypeScript sait :',
  write: 'Vous écrivez :',
  coming: (changelog: string) => `::: info À venir
Cette page n’est pas encore écrite. En attendant, la [doc de Zapatos](https://jawj.github.io/zapatos/) de George MacKerron couvre ce que fait la 6.6.1, et le [changelog](${changelog}) ce que pgcast change.
:::`,
  playgroundWords: {
    phoneShared: 'Le playground modifie et exécute du code sur un ordinateur. Sur un téléphone, voici le code de ce lien, en lecture seule.',
    phone: 'Le playground modifie du code sur un ordinateur. Sur un téléphone, voici la première requête du tutoriel, en lecture seule, avec son SQL et son type.',
    broken: (kb: number) => `Le code de ce lien n’a pas pu être lu (abîmé, ou de plus de ${kb} Ko) : voici donc la première requête du tutoriel.`,
    linkCode: 'Le code de ce lien',
    loading: 'Chargement de l’éditeur…',
    opened: 'Ce code vient d’un lien : il ne s’exécute que quand vous appuyez sur Exécuter, ou une fois que vous le modifiez.',
    running: 'Exécution sur Postgres…',
    starting: 'Démarrage de Postgres dans cette page : environ 5 Mo à télécharger, la première fois…',
    noConst: '// pas de `const <nom> = …` dont donner le type',
    stopped: 'Le code s’est arrêté ici : il n’intercepte pas cette erreur.',
    noRows: (error: string) => `Aucune ligne ne revient pendant la saisie, donc le code s’est arrêté après sa requête (Exécuter lui donne Postgres) : ${error}`,
    noQuery: 'Ce code n’envoie aucune requête.',
    editor: 'La requête, en TypeScript : modifiez-la pour mettre à jour son SQL et son type ; Ctrl+Entrée, ou ' +
      'Commande+Entrée sur un Mac, l’exécute sur Postgres. Tab indente ; Ctrl+M, ou Ctrl+Maj+M sur un Mac, fait sortir ' +
      'le focus de l’éditeur avec Tab',
    tooLong: (kb: number) => `Trop long pour être partagé : un lien contient ${kb} Ko de code au plus.`,
    linkCopied: 'Lien copié : il ouvre ce code, qui ne s’exécute que quand la personne qui le reçoit appuie sur Exécuter.',
    linkInBar: 'Le lien est dans la barre d’adresse : copiez-le depuis là.',
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
