// Copyright (C) 2026 Alexandre Demartin
//
// Types for param(x, cast) aimed at the rule of core.ts that writes a cast as is
// when `"${cast}"` is well-formed (one or more quoted identifiers joined by `.`, with
// whitespace around it, but no comment).
// Each must compile to one quoted type name, or to a well-formed name that adds
// nothing else to the SQL: test/unit/injection.test.ts compiles them,
// test/integration/injection.test.ts runs them. The SELECT in a payload is harmless.

const read = '(SELECT display_name FROM users WHERE id = 1)';

export const hostileCasts = {
  dquote: 'a"b',
  lone: '"',
  prequoted: '"a"',
  nul: 'a\0b',
  closes: `int4") || ${read} || ("int4`,
  qualified: 'pg_catalog"."int4',
  qualifiedCloses: `pg_catalog"."int4") || ${read} || ("int4`,
  threeParts: 'x"."pg_catalog"."int4',
  escaped: 'int4""',
  oddQuotes: 'int4"""',
  operator: 'int4" || "int4',
  comment: 'int4"/*."*/"int4',
  leadingDot: '.int4',
  trailingDot: 'pg_catalog".',
  emptyPart: 'pg_catalog".."int4',
  emptyLast: 'pg_catalog"."',
  empty: '',
  newlineInside: 'in\nt4',
  newlineOutside: 'pg_catalog"\n."int4',
  spacesAroundDot: 'pg_catalog" . "int4',
  tabsAroundDot: 'pg_catalog"\t.\t"int4',
  otherSpaces: 'pg_catalog"\r\n\f."int4',
  verticalTab: 'pg_catalog"\v."int4',
  commentBetween: 'pg_catalog"/**/."int4',
  lineCommentBetween: 'pg_catalog"--\n."int4',
  nulQualified: 'pg_catalog"."in\0t4',
};
