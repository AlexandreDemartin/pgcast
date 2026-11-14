// Copyright (C) 2026 Alexandre Demartin
// The package manager a reader picks, kept for every page and visit: the home's install block (InstallLine.vue) and
// each code group whose tabs are all package managers (install.md § Add the package) show it, and a pick in either is
// remembered for the other, in localStorage. Without storage, each starts at its first tab, npm, as before.

const
  key = 'pgcast-package-manager',
  managers = ['npm', 'pnpm', 'yarn', 'bun'];

/** The package manager last picked, if storage holds one. */
export function remembered(): string | undefined {
  try {
    const manager = localStorage.getItem(key);
    return manager !== null && managers.includes(manager) ? manager : undefined;
  } catch {
    return undefined;  // no storage (some private windows)
  }
}

export function remember(manager: string) {
  try { localStorage.setItem(key, manager); } catch { /* no storage: this page only */ }
}

/** A code group's tab labels, if they are all package managers. */
function managerLabels(group: Element) {
  const labels = [...group.querySelectorAll<HTMLLabelElement>(':scope > .tabs > label')];
  return labels.length > 0 && labels.every(label => managers.includes(label.dataset.title ?? '')) ? labels : undefined;
}

/**
 * Show the remembered package manager in each of the page's code groups of package managers. VitePress's own click
 * handler would scroll to the tab, so its markup is set here: the tab's radio checked, its block `active`.
 */
export function showRemembered() {
  const manager = remembered();
  if (manager === undefined) return;
  for (const group of document.querySelectorAll('.vp-code-group')) {
    const
      labels = managerLabels(group),
      i = labels?.findIndex(label => label.dataset.title === manager) ?? -1,
      input = labels?.[i]?.control,
      blocks = group.querySelector(':scope > .blocks')?.children;
    if (!(input instanceof HTMLInputElement) || !blocks?.[i]) continue;
    input.checked = true;
    [...blocks].forEach((block, j) => block.classList.toggle('active', j === i));
  }
}

/** Remember the package manager of a code group's tab when it is picked: its radio's `change`, by a click or arrows. */
export function rememberPicked(e: Event) {
  const input = e.target;
  if (!(input instanceof HTMLInputElement) || !input.matches('.vp-code-group > .tabs > input')) return;
  const label = input.labels?.[0];
  if (label && managerLabels(input.closest('.vp-code-group')!)) remember(label.dataset.title!);
}
