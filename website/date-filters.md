# Date filters

Filter by date: a day, a period, a day in a time zone. Join [`gte()`](/conditions#conditions.gte) and [`lt()`](/conditions#conditions.lt) with [`and()`](/conditions#conditions.and) on one column, from midnight to the next midnight, rather than [`between()`](/conditions#conditions.between), and compute the midnights with `AT TIME ZONE` for a day that is not UTC's.
{.lede}

## A day, or any period

The screenings of 1 March 2030, in UTC:

<CastPanel example="date_filters">

<<< ./examples/date_filters.ts{ts twoslash}

<template #caption><span>Screenings 1000 at 19:30 and 1001 at 21:45, UTC.</span></template>
</CastPanel>

- `"starts_at" >= $1`<!-- probe: db.sql`${{ starts_at: db.conditions.and(db.conditions.gte('2030-03-01T00:00:00Z'), db.conditions.lt('2030-03-02T00:00:00Z')) }}` --> and `"starts_at" < $2`<!-- probe: db.sql`${{ starts_at: db.conditions.and(db.conditions.gte('2030-03-01T00:00:00Z'), db.conditions.lt('2030-03-02T00:00:00Z')) }}` -->, joined by `AND`: a half-open period, its start in and its end out. A week or a month is the same pair, from its first midnight to the one after it.
- The bounds are explicit dates, not `now()`, so the query gives the same rows whenever it runs. From the current time, use [`now`](/conditions#conditions.now) or [`fromNow()`](/conditions#conditions.fromNow).
- A bound is a string with its offset or a `Date` ([Dates and times](/conditions#dates)). `starts_at` comes back as a string in the session's time zone ([Dates and times](/runtime-config#dates-and-times)).

## Why not `between()`

`between()` keeps both bounds: `"starts_at" BETWEEN ($1) AND ($2)`<!-- probe: db.sql`${{ starts_at: db.conditions.between('2030-03-01T00:00:00Z', '2030-03-02T00:00:00Z') }}` -->. For a day, that is one bound too many either way:

- Up to the next midnight, it also matches a screening at 00:00 on 2 March, which is the next day's.
- Up to `'2030-03-01T23:59:59Z'`, it misses one at 23:59:59.5, as a `timestamptz` keeps fractions of a second.

The half-open pair has neither problem, and each day starts where the last one ends.

## A day in a time zone

The screenings of 2 March 2030 for a reader in Tokyo, whose day starts nine hours before UTC's:

<CastPanel example="date_filters_zone">

<<< ./examples/date_filters_zone.ts{ts twoslash}

<template #caption><span>Screenings 1000 and 1001: on 1 March in UTC, early on 2 March in Tokyo.</span></template>
</CastPanel>

- `($1::timestamp AT TIME ZONE $2)`<!-- probe: db.sql`(${db.param('2030-03-02')}::timestamp AT TIME ZONE ${db.param('Asia/Tokyo')})` -->, the day then the zone, each a parameter, is the instant of that midnight in Tokyo: 15:00 UTC on 1 March ([`AT TIME ZONE`](https://www.postgresql.org/docs/current/functions-datetime.html#FUNCTIONS-DATETIME-ZONECONVERT)).
- The next midnight comes from the next date, `::date + 1`, not 24 hours later: a day that changes the clocks is not 24 hours long. In `Europe/London`, 31 March 2030 runs from 00:00 to 23:00 UTC.
- An index on `starts_at` serves the two bounds. `` db.sql`(${'starts_at'} AT TIME ZONE ${db.param(zone)})::date` ``<!-- tsc: const zone = 'Asia/Tokyo'; db.select('screenings', db.sql`${…} = ${db.param('2030-03-02')}`) --> compared with the day gives the same rows, but converts each row first, which that index can't serve.
- A zone Postgres does not know makes it refuse the query (22023), as does a day that does not exist, `'2030-02-30'` (22008).

## See also

- [Comparisons](/conditions#comparisons) and [Ranges](/conditions#ranges): each condition and the SQL it writes.
- [Dates and times](/conditions#dates), and their [types](/runtime-config#dates-and-times): what a bound can be, and what comes back.
- [Date/time functions](https://www.postgresql.org/docs/current/functions-datetime.html), in the Postgres docs.
