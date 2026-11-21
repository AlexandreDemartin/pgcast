// Copyright (C) 2026 Alexandre Demartin

import { expectTypeOf } from 'expect-type';
import type { JSONValue } from 'zapatos/db';
import type { NotNull, PgArray, Queries, Row } from './queries';

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

declare const withId: NotNull<Row<'values'>, 'id'>;
expectTypeOf(withId).toEqualTypeOf<{ items: typeof row.items; id: number; settings: typeof row.settings }>();
// @ts-expect-error TS2322: id was narrowed
withId.id = null;
// @ts-expect-error TS2322: items can still be null
export const uncheckedItems: PgArray<number> = withId.items;
// @ts-expect-error TS2344: ids is not a column
export declare const misspelt: NotNull<Row<'values'>, 'ids'>;

declare const withItems: NotNull<Row<'values'>, 'items'>;
expectTypeOf(withItems.items).toEqualTypeOf<PgArray<number>>();
withItems.items = [1, null];
withItems.items = [[1, null], [null, 2]];
// @ts-expect-error TS2322: the whole array was narrowed
withItems.items = null;
// @ts-expect-error TS2322: nested leaves must be numbers or null
withItems.items = [[1, 'two']];

expectTypeOf<NotNull<Row<'values'>, 'id' | 'items'>>()
  .toEqualTypeOf<{ items: PgArray<number>; id: number; settings: typeof row.settings }>();
expectTypeOf<NotNull<Row<'values'>, never>>().toEqualTypeOf<typeof row>();
expectTypeOf<NotNull<typeof withId, 'id'>>().toEqualTypeOf<typeof withId>();

type Details = { readonly title?: string | null; year: number | null | undefined };
declare const details: NotNull<Details, 'title' | 'year'>;
expectTypeOf(details).toEqualTypeOf<{ readonly title?: string; year: number | undefined }>();
export const untitled: typeof details = { year: undefined };
// @ts-expect-error TS2540: title stays readonly
details.title = 'Arrival';
