// Copyright (C) 2026 Alexandre Demartin

const date = 'Date | number', point = '{ x: number; y: number }',
  strings = 'PgArray<string>', numbers = 'PgArray<number>', dates = 'PgArray<Date | number>';

/** Types returned by pg's registered text parsers, keyed by the field OID on the wire. */
export const textTypes: Readonly<Record<number, string | undefined>> = Object.freeze({
  16: 'boolean', 17: 'Buffer', 20: 'string', 21: 'number', 23: 'number', 26: 'number',
  114: 'JSONValue', 600: point, 700: 'number', 701: 'number', 718: '{ x: number; y: number; radius: number }',
  1082: date, 1114: date, 1184: date, 1186: 'PostgresInterval', 3802: 'JSONValue',

  // An array's parser chooses its leaf type independently of the scalar parser (notably numeric[]).
  199: 'PgArray<JSONValue>', 651: strings, 791: strings, 1000: 'PgArray<boolean>', 1001: 'PgArray<Buffer>',
  1005: numbers, 1007: numbers, 1008: strings, 1009: strings, 1014: strings, 1015: strings, 1016: strings,
  1017: 'PgArray<' + point + '>', 1021: numbers, 1022: numbers, 1028: numbers, 1040: strings, 1041: strings,
  1115: dates, 1182: dates, 1183: strings, 1185: dates, 1187: 'PgArray<PostgresInterval>', 1231: numbers,
  1270: strings, 2951: strings, 3807: 'PgArray<JSONValue>', 3907: strings,
});
