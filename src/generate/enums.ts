/*
Zapatos: https://jawj.github.io/zapatos/
Copyright (C) 2020 - 2023 George MacKerron
Released under the MIT licence: see LICENCE file
*/

import * as pg from 'pg';
import { stringLiteral, tsIdentifier } from './quote';
import { enumOrdersForSchema } from './enumOrder';


export type EnumData = { [k: string]: string[] };

export const enumDataForSchema = async (schemaName: string, queryFn: (q: pg.QueryConfig) => Promise<pg.QueryResult<any>>) =>
  (await enumOrdersForSchema(schemaName, queryFn)).alphabetical;

export const enumTypesForEnumData = (enums: EnumData) => {
  const types = Object.keys(enums)
    .map(name => `
export type ${tsIdentifier(name, 'type')} = ${enums[name].map(v => stringLiteral(v)).join(' | ')};
export namespace every {
  export type ${tsIdentifier(name, 'type')} = [${enums[name].map(v => stringLiteral(v)).join(', ')}];
}`)
    .join('');

  return types;
};
