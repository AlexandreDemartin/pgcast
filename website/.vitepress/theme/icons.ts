// Copyright (C) 2026 Alexandre Demartin
// The site's icons, one drawing per meaning (docs/design/art-direction.md § Icons): lines on a 24px grid, drawn with a
// 2px round stroke in `currentColor`. Icon.vue draws one in a component; `svg()` gives the same markup as a string, for
// what is written at build (callouts.ts, the pager's labels in config.ts).

export const icons = {
  copy: '<rect x="8" y="8" width="14" height="14" rx="2"/><path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  external: '<path d="M7 17 17 7M8 7h9v9"/>',  // opens in a new tab
  arrowLeft: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  arrowRight: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7L11.8 5.2"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  tip: '<path d="M9 18h6M10 22h4"/><path d="M15 14c.2-1 .7-1.7 1.5-2.5A6 6 0 1 0 7.5 11.5c.8.8 1.3 1.5 1.5 2.5"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',  // a clock: the site's info notes say "Coming"
  warning: '<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3z"/><path d="M12 9v4M12 17h.01"/>',
  danger: '<path d="M8.7 2h6.6L22 8.7v6.6L15.3 22H8.7L2 15.3V8.7z"/><path d="M12 8v4M12 16h.01"/>',
  system: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  light: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  dark: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
} as const;

export type IconName = keyof typeof icons;

/** The attributes every icon shares; `aria-hidden`, as the text beside it names what it does. */
export const attributes = {
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round',
  'stroke-linejoin': 'round', 'aria-hidden': 'true',
} as const;

/** An icon as HTML, for markup written at build: `<svg class="icon" …>…</svg>`. */
export function svg(name: IconName) {
  const attrs = Object.entries(attributes).map(([key, value]) => ` ${key}="${value}"`).join('');
  return `<svg class="icon"${attrs}>${icons[name]}</svg>`;
}
