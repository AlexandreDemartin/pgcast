// Copyright (C) 2026 Alexandre Demartin
// The docs outline, in the four groups of Diátaxis (decision 004): the sidebar, the nav bar (config.ts), each
// group's landing page (theme/GroupPages.vue), and the "Coming" pages ([page].paths.ts) of the entries with no page yet.

export const outline = [
  {
    text: 'Tutorial',
    nav: 'Tutorial',
    link: '/tutorial',
    collapsed: false,  // open: the way in, read first
    items: [
      { text: 'Install', link: '/install' },
      { text: 'First query', link: '/first-query' },
    ],
  },
  {
    text: 'How-to guides',
    nav: 'Guides',
    link: '/guides',
    collapsed: true,  // folded: a reader comes for one task, from the search or a link
    items: [
      { text: 'Switch from Zapatos', link: '/switching' },
      { text: 'Joins', link: '/lateral' },
      { text: 'Pagination', link: '/paginate' },
      { text: 'Batches', link: '/batches' },
      { text: 'Retries', link: '/retries' },
      { text: 'Custom types', link: '/custom-types' },
      { text: 'Raw SQL', link: '/raw-sql' },
      { text: 'Errors', link: '/handle-errors' },
      { text: 'Testing', link: '/testing' },
      { text: 'AI assistants', link: '/ai-assistant' },
    ],
  },
  {
    text: 'Reference',
    nav: 'Reference',
    link: '/reference',
    collapsed: false,  // open: what a reader looks up every day
    items: [
      { text: 'SQL template', link: '/sql-template' },
      { text: 'Select', link: '/select' },
      { text: 'Writes', link: '/insert' },
      { text: 'Conditions', link: '/conditions' },
      { text: 'Transactions', link: '/transaction' },
      { text: 'Configuration', link: '/runtime-config' },
      { text: 'Generator', link: '/generator' },
    ],
  },
  {
    text: 'Explanation',
    link: '/explanation',
    collapsed: true,  // folded: read once, for the why
    items: [
      { text: 'Why pgcast', link: '/why' },
      { text: 'The catalog', link: '/catalog-types' },
      { text: 'Versions<small class="since">6.7</small>', link: '/versions' },
      { text: 'Security', link: '/security' },
    ],
  },
];
