/*
Zapatos: https://jawj.github.io/zapatos/
Copyright (C) 2020 - 2023 George MacKerron
Released under the MIT licence: see LICENCE file
*/

import * as pg from 'pg';
import { enumLabel } from './enumLabel';
import { enumOrdersForSchema } from './enumOrder';


export type EnumData = { [k: string]: string[] };

export const enumDataForSchema = async (schemaName: string, queryFn: (q: pg.QueryConfig) => Promise<pg.QueryResult<any>>) =>
  ({ ...(await enumOrdersForSchema(schemaName, queryFn)).alphabetical });  // with Object.prototype, as in 6.6.1

export const enumTypesForEnumData = (enums: EnumData) => {
  const types = Object.keys(enums)
    .map(name => `
export type ${name} = ${enums[name].map(enumLabel).join(' | ')};
export namespace every {
  export type ${name} = [${enums[name].map(enumLabel).join(', ')}];
}`)
    .join('');

  return types;
};
