// Copyright (C) 2026 Alexandre Demartin
// What Twoslash compiles each example against, shared by the code blocks (config.ts) and the cast panels
// (cast.data.ts): `zapatos/db` as installed in node_modules (the built library, `file:..`), and the generated
// `zapatos/schema` and `zapatos/custom`, ambient modules that a user's tsconfig would include. Twoslash reads no
// tsconfig, so the generated files go in as extra files of its virtual file system.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TwoslashOptions } from 'twoslash';
import type { MarkdownOptions } from 'vitepress';

type Node = { tagName?: string; properties?: Record<string, unknown>; children?: Node[] };

const custom = new URL('../zapatos/custom/', import.meta.url);

export const twoslashOptions: TwoslashOptions = {
  vfsRoot: dirname(fileURLToPath(new URL('../package.json', import.meta.url))),  // with no final slash: one hides errors
  extraFiles: {
    'zapatos-schema.d.ts': readFileSync(new URL('../zapatos/schema.d.ts', import.meta.url), 'utf8'),
    // custom/ exists only once the schema has a type the generator leaves to the user
    ...Object.fromEntries((existsSync(custom) ? readdirSync(custom) : []).map(file =>
      [`zapatos-custom-${file}`, readFileSync(new URL(file, custom), 'utf8')])),
  },
  // `db` itself says only "import db": no dashed underline under each `db.`
  filterNode: node => !(node.type === 'hover' && /^import \w+$/.test(node.text)),
};

/**
 * A hover type with each module of `node_modules` by its name, as the reader imports it: TypeScript's hover gives a
 * module that a type refers to by its file's path on the build machine (`typeof import("/home/runner/…/node_modules/
 * @types/pg/index")` is `typeof import("pg")`). `check-paths.mjs` fails the build on a path that is left.
 */
export const moduleNames = (type: string) => type.replace(
  /import\("[^"]*\/node_modules\/(@types\/)?([^"]+?)(?:\/index)?(?:\.d\.[cm]?ts)?"\)/g,
  (_, types, name) => `import("${types ? name.replace(/^([^/]+?)__/, '@$1/') : name}")`);  // @types/a__b is @a/b

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
