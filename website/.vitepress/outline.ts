// Copyright (C) 2026 Alexandre Demartin
// The docs outline, in the four groups of Diátaxis (decision 004): the sidebar, the nav bar (config.ts), each
// group's landing page (theme/GroupPages.vue), and the "Coming" pages ([page].paths.ts) of the entries with no page yet.

export const outline = [
  {
    text: 'Tutorial',
    nav: 'Tutorial',
    link: '/tutorial',
    items: [
      { text: 'Install', link: '/install' },
      { text: 'Your first typed query', link: '/first-query' },
    ],
  },
  {
    text: 'How-to guides',
    nav: 'Guides',
    link: '/guides',
    items: [
      { text: 'Switch from Zapatos', link: '/switching' },
      { text: 'Join through a lateral', link: '/lateral' },
      { text: 'Paginate a list', link: '/paginate' },
      { text: 'Insert and upsert in batches', link: '/batches' },
      { text: 'Retry a transaction', link: '/retries' },
      { text: 'Use custom types and domains', link: '/custom-types' },
      { text: 'Write raw SQL safely', link: '/raw-sql' },
      { text: 'Handle errors', link: '/handle-errors' },
      { text: 'Use an AI assistant', link: '/ai-assistant' },
    ],
  },
  {
    text: 'Reference',
    nav: 'Reference',
    link: '/reference',
    items: [
      { text: 'The <code>sql</code> template', link: '/sql-template' },
      { text: '<code>select()</code> and the aggregates', link: '/select' },
      { text: '<code>insert()</code>, <code>update()</code> and the other writes', link: '/insert' },
      { text: '<code>db.conditions</code>', link: '/conditions' },
      { text: '<code>transaction()</code> and errors', link: '/transaction' },
      { text: 'Run-time configuration and utility types', link: '/runtime-config' },
      { text: 'The generator: config and CLI', link: '/generator' },
    ],
  },
  {
    text: 'Explanation',
    link: '/explanation',
    items: [
      { text: 'Why pgcast', link: '/why' },
      { text: 'How types are cast from the catalog', link: '/catalog-types' },
      { text: 'Versions, opt-ins and warnings<small class="since">6.7</small>', link: '/versions' },
      { text: 'The security model', link: '/security' },
    ],
  },
];
