// Copyright (C) 2026 Alexandre Demartin
// The docs outline, in the four groups of Diátaxis (decision 004): the sidebar, the nav bar (config.ts), each
// group's landing page (theme/GroupPages.vue), and the "Coming" pages ([page].paths.ts) of the entries with no page yet.
// Each entry has its text in each language (words.ts): `outlineIn('fr')` is the French site's, its links under `/fr/`.
import { prefixOf, type Lang } from './words.ts';

type Text = Record<Lang, string>;
type Entry = { text: Text; link: string };
type Group = Entry & { nav?: Text; collapsed: boolean; items: Entry[] };

const groups: Group[] = [
  {
    text: { en: 'Tutorial', fr: 'Tutoriel' },
    nav: { en: 'Tutorial', fr: 'Tutoriel' },
    link: '/tutorial',
    collapsed: false,  // open: the way in, read first
    items: [
      { text: { en: 'Install', fr: 'Installation' }, link: '/install' },
      { text: { en: 'First query', fr: 'Première requête' }, link: '/first-query' },
    ],
  },
  {
    text: { en: 'How-to guides', fr: 'Guides pratiques' },
    nav: { en: 'Guides', fr: 'Guides' },
    link: '/guides',
    collapsed: true,  // folded: a reader comes for one task, from the search or a link
    items: [
      { text: { en: 'Joins', fr: 'Jointures' }, link: '/lateral' },
      { text: { en: 'Pagination', fr: 'Pagination' }, link: '/paginate' },
      { text: { en: 'Batches', fr: 'Batches' }, link: '/batches' },
      { text: { en: 'Retries', fr: 'Retries' }, link: '/retries' },
      { text: { en: 'Custom types', fr: 'Types personnalisés' }, link: '/custom-types' },
      { text: { en: 'Raw SQL', fr: 'SQL brut' }, link: '/raw-sql' },
      { text: { en: 'Errors', fr: 'Erreurs' }, link: '/handle-errors' },
      { text: { en: 'Testing', fr: 'Tests' }, link: '/testing' },
      { text: { en: 'AI assistants', fr: 'Assistants IA' }, link: '/ai-assistant' },
      { text: { en: 'Switch from Zapatos', fr: 'Venir de Zapatos' }, link: '/switching' },
    ],
  },
  {
    text: { en: 'Reference', fr: 'Référence' },
    nav: { en: 'Reference', fr: 'Référence' },
    link: '/reference',
    collapsed: false,  // open: what a reader looks up every day
    items: [
      { text: { en: 'SQL template', fr: 'Template SQL' }, link: '/sql-template' },
      { text: { en: 'Select', fr: 'Lectures' }, link: '/select' },
      { text: { en: 'Writes', fr: 'Écritures' }, link: '/insert' },
      { text: { en: 'Conditions', fr: 'Conditions' }, link: '/conditions' },
      { text: { en: 'Transactions', fr: 'Transactions' }, link: '/transaction' },
      { text: { en: 'Configuration', fr: 'Configuration' }, link: '/runtime-config' },
      { text: { en: 'Generator', fr: 'Générateur' }, link: '/generator' },
    ],
  },
  {
    text: { en: 'Explanation', fr: 'Explication' },
    link: '/explanation',
    collapsed: true,  // folded: read once, for the why
    items: [
      { text: { en: 'Why pgcast', fr: 'Pourquoi pgcast' }, link: '/why' },
      { text: { en: 'The catalog', fr: 'Le catalogue' }, link: '/catalog-types' },
      { text: { en: 'Versions<small class="since">6.7</small>', fr: 'Versions<small class="since">6.7</small>' }, link: '/versions' },
      { text: { en: 'Security', fr: 'Sécurité' }, link: '/security' },
    ],
  },
];

/** The outline in `lang`: each text in that language, each link under its prefix (`/fr/install`). */
export function outlineIn(lang: Lang) {
  const prefix = prefixOf(lang), entry = ({ text, link }: Entry) => ({ text: text[lang], link: prefix + link });
  return groups.map(({ nav, collapsed, items, ...group }) => ({
    ...entry(group),
    ...nav === undefined ? {} : { nav: nav[lang] },
    collapsed,
    items: items.map(entry),
  }));
}

/** The English outline, at the root. */
export const outline = outlineIn('en');
