// Copyright (C) 2026 Alexandre Demartin
// The docs outline, in the four groups of docs/design/art-direction.md: the sidebar, and the "Coming" pages
// ([page].paths.ts) of the entries that have no page yet.

export const outline = [
  {
    text: 'Getting started',
    items: [
      { text: 'Install', link: '/install' },
      { text: 'Configure', link: '/configure' },
      { text: 'Generate your schema', link: '/generate' },
      { text: 'Import it', link: '/import' },
    ],
  },
  {
    text: 'Guide',
    items: [
      { text: 'The <code>sql</code> template', link: '/sql-template' },
      { text: '<code>select()</code>', link: '/select' },
      { text: '<code>insert()</code> and <code>upsert()</code>', link: '/insert' },
      { text: 'Conditions', link: '/conditions' },
      { text: 'Lateral joins', link: '/lateral' },
      { text: 'Transactions', link: '/transactions' },
      { text: 'Errors', link: '/errors' },
    ],
  },
  {
    text: 'pgcast',
    items: [
      { text: 'Switching from Zapatos', link: '/switching' },
      { text: 'Opt-ins <small class="since">6.7</small>', link: '/opt-ins' },
      { text: 'Security notes', link: '/security' },
      { text: 'Versions', link: '/versions' },
    ],
  },
  {
    text: 'Reference',
    items: [
      { text: 'Run-time configuration', link: '/runtime-config' },
      { text: 'Utility types', link: '/utility-types' },
    ],
  },
];
