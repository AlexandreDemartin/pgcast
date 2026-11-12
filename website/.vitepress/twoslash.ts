// Copyright (C) 2026 Alexandre Demartin
// What Twoslash compiles each example against, shared by the code blocks (config.ts) and the cast panels
// (cast.data.ts): `zapatos/db` as installed in node_modules (the built library, `file:..`), and the generated
// `zapatos/schema`, an ambient module that a user's tsconfig would include. Twoslash reads no tsconfig, so the
// generated file goes in as an extra file of its virtual file system.
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TwoslashOptions } from 'twoslash';
import type { MarkdownOptions } from 'vitepress';

type Node = { tagName?: string; properties?: Record<string, unknown>; children?: Node[] };

export const twoslashOptions: TwoslashOptions = {
  vfsRoot: dirname(fileURLToPath(new URL('../package.json', import.meta.url))),  // with no final slash: one hides errors
  extraFiles: {
    'zapatos-schema.d.ts': readFileSync(new URL('../zapatos/schema.d.ts', import.meta.url), 'utf8'),
  },
  // `db` itself says only "import db": no dashed underline under each `db.`
  filterNode: node => !(node.type === 'hover' && /^import \w+$/.test(node.text)),
};

/**
 * Each hover type takes the keyboard's focus (docs/design/art-direction.md § Hover types): the menu's trigger, the
 * `<span>` that floating-vue listens on, gets a `tabindex`; the menu opens on focus (theme/index.ts).
 */
export const focusableHovers: NonNullable<MarkdownOptions['codeTransformers']>[number] = {
  name: 'pgcast:focusable-hovers',
  root(hast) {
    const visit = (node: Node) => {
      if (node.tagName === 'v-menu' && String(node.properties?.class).includes('twoslash-hover')) {
        const trigger = node.children?.find(child => child.tagName === 'span');
        if (trigger) trigger.properties = { ...trigger.properties, tabindex: '0' };
      }
      node.children?.forEach(visit);
    };
    visit(hast as Node);
  },
};
