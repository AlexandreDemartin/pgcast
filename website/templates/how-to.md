# Pagination

The task, and when you need it, in one sentence. The reader already knows the basics of the [tutorial](/tutorial).
{.lede}

## Order, then limit

The shortest way to get it done, first:

<CastPanel example="paginate">

<<< ./examples/paginate.ts{ts twoslash}

</CastPanel>

Each option used links to its entry: [`order`](/select#select), [`limit`](/select#select). What they do in detail stays there.

## Fetch the next page

The next step of the task, or a variation it often needs. Steps in the order the reader takes them.

::: warning Security
Only where there is a real risk: what could go wrong, and how to avoid it.
:::

## See also

- [`select()`](/select#select): every option, the SQL it writes.
- [Why pgcast](/why): why it works this way.
