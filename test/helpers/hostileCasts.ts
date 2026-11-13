// Copyright (C) 2026 Alexandre Demartin
//
// Types for param(x, cast) aimed at the rules of core.ts for a cast: written as is
// when `"${cast}"` is well-formed (one or more quoted identifiers joined by `.`, with
// whitespace around it, but no comment) or already quoted; split on `.` when it has no
// `"`; array bounds (`[]`, `[n]`) at the end written after it (hostileArrayCasts).
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
  // without a `"`, split on `.`, each part quoted
  dotted: 'pg_catalog.int4',
  dottedSemicolon: `int4; ${read}; --.int4`,
  dottedSquote: `pg_catalog.int4' || ${read} || '`,
  dottedComment: 'pg_catalog/*.*/int4',
  dottedDashes: 'pg_catalog--.int4',
  dottedDollar: '$1.int4',
  dottedBackslash: 'pg_catalog\\.int4',
  dottedNul: 'pg_catalog.in\0t4',
  dottedEmpty: 'pg_catalog..int4',
  // already quoted: written as is, so a `.` inside a quoted part stays in it
  dottedPrequoted: '"pg_catalog"."int4"',
  prequotedDot: '"pg_catalog.int4"',
};

// casts that end with array bounds; on a scalar such as '1', each is a missing type, a syntax error or 22P02
export const hostileArrayCasts = {
  array: 'int4[]',
  arrayBounds: 'int4[3][]',
  arrayDotted: 'pg_catalog.int4[]',
  arrayQualified: 'pg_catalog"."int4[]',
  arrayPrequoted: '"pg_catalog"."int4"[]',
  arrayOnly: '[]',
  arrayAfterQuote: 'int4"[]',
  arrayCloses: `int4") || ${read} || ("int4[]`,
  arrayInside: `int4[1]) || ${read} || CAST(1 AS int4[]`,
  arraySplice: `int4[1] || ${read} || ARRAY[1]`,
  arraySemicolon: `int4; ${read}; --[]`,
  arraySpace: 'int4[ ]',
  arrayNegative: 'int4[-1]',
  arrayUnclosed: 'int4[1',
  arrayNested: 'int4[[]]',
  arrayNul: 'int4[\0]',
  arrayBackslash: 'int4\\[]',
};
