// Copyright (C) 2026 Alexandre Demartin
// The mould beside the home's hero: a table's `CREATE TABLE` in schema.sql, and its `Selectable` in the schema that
// pgcast generates from it (zapatos/schema.d.ts), its JSDoc left out. Both read at build, never typed by hand; a
// column in one and not in the other fails the build: regenerate with `npm run docs:schema`.
import { readFileSync } from 'node:fs';
import { createMarkdownRenderer, defineLoader } from 'vitepress';
import { lineIndents, markLines, sqlParameters, syntax } from './syntax.ts';

export interface Mould {
  sql: string;  // highlighted HTML
  type: string;  // highlighted HTML, each line's index in `--n`: the type pours in line by line (theme/style.css)
}

declare const data: Record<string, Mould>;
export { data };

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

export default defineLoader({
  watch: ['../schema.sql', '../zapatos/schema.d.ts'],
  async load() {
    const
      md = await createMarkdownRenderer(process.cwd(), { theme: syntax, codeTransformers: [sqlParameters, lineIndents] }),
      highlight = (code: string, lang: string) => md.renderAsync('```' + lang + '\n' + code + '\n```'),
      schema = read('zapatos/schema.d.ts').split('\n'),
      moulds: Record<string, Mould> = {};

    for (const [sql, table] of read('schema.sql').matchAll(/^CREATE TABLE (\w+)\n[\s\S]*?\);$/gm)) {
      const
        columns = [...sql.matchAll(/^[(,] (?!PRIMARY KEY|UNIQUE|CHECK|FOREIGN KEY|CONSTRAINT)(\w+) /gm)].map(m => m[1]),
        namespace = schema.indexOf(`  export namespace ${table} {`),
        start = schema.indexOf('    export interface Selectable {', namespace),
        end = schema.indexOf('    }', start),
        fields = schema.slice(start + 1, end).filter(line => !/^\s*(\/\*\*|\*)/.test(line)),
        names = fields.map(line => /^\s*(\w+)\??:/.exec(line)?.[1]);

      if (namespace < 0 || [...columns].sort().join() !== [...names].sort().join())
        throw new Error(`mould.data.ts: ${table}'s columns in schema.sql are not its Selectable's in zapatos/schema.d.ts: ` +
          'run `npm run docs:schema`');
      const type = [schema[namespace], schema[start], ...fields, schema[end], '  }'].map(line => line!.slice(2)).join('\n');
      moulds[table!] = { sql: await highlight(sql, 'sql'), type: markLines(await highlight(type, 'ts'), n => ({ style: `--n:${n}` })) };
    }
    return moulds;
  },
});
