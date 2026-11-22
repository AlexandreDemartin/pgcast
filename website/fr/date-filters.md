---
english: 465979252e30
---

# Filtres de date

Filtrer par date : un jour, une période, un jour dans un fuseau horaire. Joignez [`gte()`](/fr/conditions#conditions.gte) et [`lt()`](/fr/conditions#conditions.lt) avec [`and()`](/fr/conditions#conditions.and) sur une seule colonne, de minuit au minuit suivant, plutôt que [`between()`](/fr/conditions#conditions.between), et calculez les minuits avec `AT TIME ZONE` pour un jour qui n’est pas celui d’UTC.
{.lede}

## Un jour, ou toute période {#a-day-or-any-period}

Les séances du 1er mars 2030, en UTC :

<CastPanel example="date_filters">

<<< ../examples/date_filters.ts{ts twoslash}

<template #caption><span>Les séances 1000 à 19:30 et 1001 à 21:45, UTC.</span></template>
</CastPanel>

- `"starts_at" >= $1`<!-- probe: db.sql`${{ starts_at: db.conditions.and(db.conditions.gte('2030-03-01T00:00:00Z'), db.conditions.lt('2030-03-02T00:00:00Z')) }}` --> et `"starts_at" < $2`<!-- probe: db.sql`${{ starts_at: db.conditions.and(db.conditions.gte('2030-03-01T00:00:00Z'), db.conditions.lt('2030-03-02T00:00:00Z')) }}` -->, joints par `AND` : une période semi-ouverte, son début inclus et sa fin exclue. Une semaine ou un mois est la même paire, de son premier minuit au minuit qui la suit.
- Les bornes sont des dates explicites, pas `now()`, pour que la requête donne les mêmes lignes à chaque exécution. À partir de l’heure courante, utilisez [`now`](/fr/conditions#conditions.now) ou [`fromNow()`](/fr/conditions#conditions.fromNow).
- Une borne est une chaîne avec son décalage ou un `Date` ([Dates et heures](/fr/conditions#dates)). `starts_at` revient sous forme de chaîne dans le fuseau horaire de la session ([Dates et heures](/fr/runtime-config#dates-and-times)).

## Pourquoi pas `between()` {#why-not-between}

`between()` inclut les deux bornes : `"starts_at" BETWEEN ($1) AND ($2)`<!-- probe: db.sql`${{ starts_at: db.conditions.between('2030-03-01T00:00:00Z', '2030-03-02T00:00:00Z') }}` -->. Pour un jour, c’est une borne de trop dans les deux cas :

- Jusqu’au minuit suivant, il correspond aussi à une séance à 00:00 le 2 mars, qui appartient au jour suivant.
- Jusqu’à `'2030-03-01T23:59:59Z'`, il manque une séance à 23:59:59.5, car un `timestamptz` garde les fractions de seconde.

La paire semi-ouverte n’a aucun de ces problèmes, et chaque jour commence là où finit le précédent.

## Un jour dans un fuseau horaire {#a-day-in-a-time-zone}

Les séances du 2 mars 2030 pour un lecteur à Tokyo, dont le jour commence neuf heures avant celui d’UTC :

<CastPanel example="date_filters_zone">

<<< ../examples/date_filters_zone.ts{ts twoslash}

<template #caption><span>Les séances 1000 et 1001 : le 1er mars en UTC, tôt le 2 mars à Tokyo.</span></template>
</CastPanel>

- `($1::timestamp AT TIME ZONE $2)`<!-- probe: db.sql`(${db.param('2030-03-02')}::timestamp AT TIME ZONE ${db.param('Asia/Tokyo')})` -->, le jour puis le fuseau, chacun un paramètre, est l’instant de ce minuit à Tokyo : 15:00 UTC le 1er mars ([`AT TIME ZONE`](https://www.postgresql.org/docs/current/functions-datetime.html#FUNCTIONS-DATETIME-ZONECONVERT)).
- Le minuit suivant vient de la date suivante, `::date + 1`, et non de 24 heures plus tard : un jour de changement d’heure ne dure pas 24 heures. En `Europe/London`, le 31 mars 2030 va de 00:00 à 23:00 UTC.
- Un index sur `starts_at` sert les deux bornes. `` db.sql`(${'starts_at'} AT TIME ZONE ${db.param(zone)})::date` ``<!-- tsc: const zone = 'Asia/Tokyo'; db.select('screenings', db.sql`${…} = ${db.param('2030-03-02')}`) --> comparé au jour donne les mêmes lignes, mais convertit d’abord chaque ligne, ce que cet index ne peut pas servir.
- Postgres refuse la requête avec un fuseau qu’il ne connaît pas (22023), comme avec un jour qui n’existe pas, `'2030-02-30'` (22008).

## Voir aussi {#see-also}

- [Les comparaisons](/fr/conditions#comparisons) et [Les intervalles](/fr/conditions#ranges) : chaque condition et le SQL qu’elle écrit.
- [Dates et heures](/fr/conditions#dates), et leurs [types](/fr/runtime-config#dates-and-times) : ce qu’une borne peut être, et ce qui revient.
- [Fonctions de date et d’heure](https://www.postgresql.org/docs/current/functions-datetime.html), dans la doc de Postgres.
