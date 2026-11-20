// Copyright (C) 2026 Alexandre Demartin

import { expectTypeOf } from 'expect-type';
import type { JSONValue } from 'zapatos/db';
import type { PgArray, Queries, Row } from './queries';

declare const row: Row<'values'>;
expectTypeOf(row).not.toBeAny();
expectTypeOf(row.settings).not.toBeAny();
expectTypeOf(row).toEqualTypeOf<{ items: PgArray<number> | null; id: number | null; settings: JSONValue | null }>();
expectTypeOf<Queries['delete']>().toEqualTypeOf<{ text: 'DELETE FROM public.users' }>();
expectTypeOf<Row<'delete'>>().toBeNever();
expectTypeOf<Row<'empty'>>().toEqualTypeOf<{}>();
expectTypeOf<Row<'delete' | 'values'>>().toEqualTypeOf<typeof row>();

expectTypeOf<Queries["odd\"\u2028\u2029"]["text"]>().toEqualTypeOf<"SELECT $q$' \"` ${} */ \\\n\u2028\u2029$q$ AS \"field\"\"\u2028\u2029\"">();
expectTypeOf<keyof Row<"odd\"\u2028\u2029">>().toEqualTypeOf<"field\"\u2028\u2029">();

export const flat: typeof row.items = [1, null];
export const nested: typeof row.items = [[1, null], [null, 2]];
export const nullable: typeof row.items = null;
if (row.items && typeof row.items[0] === 'number') row.items[0].toFixed();
// @ts-expect-error the query name must exist
export declare const absent: Row<'absent'>;
// @ts-expect-error the result has no title
row.title;
// @ts-expect-error an unproved column can be null
row.id.toFixed();
// @ts-expect-error the element can itself be an array
row.items?.[0]?.toFixed();
// @ts-expect-error nested integer arrays cannot contain a string
export const strings: typeof row.items = [[1, 'two']];
if (row.items !== null) {
  const items = row.items;
  // @ts-expect-error a narrowed array column cannot take a whole-column null
  const narrowed: typeof items = null;
  expectTypeOf(narrowed).toEqualTypeOf<PgArray<number>>();
}
// @ts-expect-error the stored text is literal
export const other: Queries['empty']['text'] = 'SELECT 2';
