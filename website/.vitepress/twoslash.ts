// Copyright (C) 2026 Alexandre Demartin
// What Twoslash compiles each example against, shared by the code blocks (config.ts) and the cast panels
// (cast.data.ts): `zapatos/db` as installed in node_modules (the built library, `file:..`), and the generated
// `zapatos/schema` and `zapatos/custom`, ambient modules that a user's tsconfig would include. Twoslash reads no
// tsconfig, so the generated files go in as extra files of its virtual file system.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTwoslasher, type TwoslashInstance, type TwoslashOptions } from 'twoslash';
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
 * Twoslash on `twoslashOptions`, for the pages' code blocks, that also throws when a block's `// @errors: <code> <code>`
 * lists a code its code does not raise: Twoslash throws only on one it does not list, so a refused line that has
 * become valid would still build (README.md § Examples). Any other line holding `@errors` in a comment throws too, as
 * Twoslash would leave it a comment and check nothing. It checks itself first.
 */
export function createCheckedTwoslasher(): TwoslashInstance {
  const
    twoslasher = createTwoslasher(twoslashOptions),
    checked = ((code, ...rest) => {
      const marked = code.split('\n').filter(line => /\/\/.*@errors/i.test(line));
      if (marked.length > 1 || marked.some(line => !/^\/\/ @errors: \d+( \d+)*$/.test(line)))
        throw new Error(`a block meant to fail has one line \`// @errors: <code> <code>\`, at the start of the line: ${
          marked.join(' | ')}`);
      const
        result = twoslasher(code, ...rest),
        raised = new Set(result.errors.map(({ code }) => code)),
        missing = result.meta.handbookOptions.errors.filter(code => !raised.has(code));
      if (missing.length > 0) throw new Error(`the block lists \`// @errors: ${
        result.meta.handbookOptions.errors.join(' ')}\`, but its code does not raise TS${missing.join(', TS')}`);
      return result;
    }) as TwoslashInstance;
  checked.getCacheMap = twoslasher.getCacheMap;

  const throws = (code: string) => { try { checked(code, 'ts'); } catch { return true; } return false; };
  if (throws("// @errors: 2322\nconst n: number = '';"))
    throw new Error('twoslash.ts: a block that raises the code it lists failed: check createCheckedTwoslasher');
  for (const code of [
    "// @errors: 2322\nconst n: number = 1;",  // the code listed is not raised
    "// @errors: 2322 2345\nconst n: number = '';",  // one of the codes listed is not raised
    ...['// @errors 2322', '//@errors: 2322', '  // @errors: 2322', '// @errors: 2322, 2345', '// @Errors: 2322']
      .map(marker => `${marker}\nconst n: number = 1;`),  // near misses, which Twoslash would leave as comments
  ]) if (!throws(code)) throw new Error(`twoslash.ts: this block went through: ${JSON.stringify(code)}`);
  return checked;
}

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
