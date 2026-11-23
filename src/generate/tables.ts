/*
Zapatos: https://jawj.github.io/zapatos/
Copyright (C) 2020 - 2023 George MacKerron
Released under the MIT licence: see LICENCE file
*/

import * as pg from 'pg';
import { columnsForRelation } from './relations';
import type { Relation } from './relations';
import { tsTypeForPgType } from './pgTypes';
import type { EnumData } from './enums';
import { enumOrderOf, enumOrdersForSchema } from './enumOrder';
import { domainRootsInDatabase } from './domainRoots';
import type { CustomTypes, CustomTypeOrigins } from './tsOutput';
import { CompleteConfig } from './config';
import { jsdocText, stringLiteral, tsIdentifier } from './quote';

// still exported here, where 6.6.1 declared them: a declaration may name them as zapatos/dist/generate/tables
export { relationsInSchema } from './relations';
export type { Relation } from './relations';

// DomainRoots of ./domainRoots, declared here and not exported: a library's declarations that write the type of
// definitionForRelationInSchema() out cannot name ./domainRoots, which zapatos/generate does not export (TS2742), and
// they write this alias out in full
type DomainRoots = Record<string, { schema: string; name: string; isArray: boolean }>;

// TypeScript's own types that an enum may be named after: a placeholder naming one compiles without an import
const tsOwnTypes = new Set('any bigint boolean never number object string symbol undefined unknown'.split(' '));
const hasOwn = (o: object, key: string) => Object.prototype.hasOwnProperty.call(o, key);
const isEnumArray = (name: string, enums: EnumData) =>
  name.startsWith('_') && !hasOwn(enums, name) && hasOwn(enums, name.slice(1));
const contexts = ['Selectable', 'JSONSelectable', 'Whereable', 'Insertable', 'Updatable'] as const;
// pg_catalog's interval or its array: a type of yours of that name is typed by its name, as in 6.6.1, whatever the key
const isInterval = (type: { schema: string; name: string } | undefined) =>
  type?.schema === 'pg_catalog' && (type.name === 'interval' || type.name === '_interval');

// what the config states for a table or a column, never what Object.prototype answers for a name such as
// toString or __proto__: its function, whose caller throws, hid the '*' entry
const stated = (options: any, key: string) => {
  const value = options[key];
  return value === Object.prototype || value === (Object.prototype as any)[key] ? undefined : value;
};

// as Zapatos 6.6.1 read options[table] && options[table][column]: a falsy table entry is given back, so it hides '*'
const columnOptionsFor = (options: CompleteConfig['columnOptions'], table: string, column: string):
  CompleteConfig['columnOptions'][string][string] | undefined => {
  const tableOptions = stated(options, table);
  return tableOptions && stated(tableOptions, column);
};

// a text in a JSDoc, every line behind its `*`: a name, a type or a default may hold a line break, at which
// TypeScript ends a JSDoc line, \r as \n
const jsdocLines = (text: string, margin: string) => jsdocText(text).split(/\r\n?|\n/).join(`\n${margin}* `);

function quoteIfIllegalIdentifier(identifier: string) {
  // note: we'll redundantly quote a bunch of non-ASCII characters like this
  return identifier.match(/^[a-zA-Z_$][0-9a-zA-Z_$]*$/) ? identifier : stringLiteral(identifier, '"');
}

// Every key of a Whereable is optional, so a string passes as one when a column shares the name of a String member
// its type fits (`search` typed any, `length` a number), and with it any name in the table's SQL (#670). A string has
// an iterator, a Whereable none, and no column is a symbol. In SQLExpression, a union, so that no `keyof` changes;
// `undefined`, not `never`, so that an object stating its iterator undefined stays a Whereable, under
// exactOptionalPropertyTypes. Not in WhereableForTable (its `keyof` would change); the shortcuts' parameters take it
// from a lookup of their own in zapatos/db (#674)
const notIterable = '{ [Symbol.iterator]?: undefined }';

export const definitionForRelationInSchema = async (
  rel: Relation,
  schemaName: string,
  enums: EnumData,
  customTypes: CustomTypes,  // an 'out' parameter
  config: CompleteConfig,
  queryFn: (q: pg.QueryConfig) => Promise<pg.QueryResult<any>>,
  customTypeOrigins: CustomTypeOrigins = Object.create(null),  // an 'out' parameter too
  enumsForSchema = async (schema: string) => (await enumOrdersForSchema(schema, queryFn))[enumOrderOf(config)],
  columnsTypedByEnumName?: string[],  // an 'out' parameter too: what typeEnumsAcrossSchemas would change
  // an 'out' parameter too: what a placeholder imports from zapatos/schema, '' for nothing, null for an enum's labels written out
  customTypeImports: Record<string, string | null> = Object.create(null),
  uniqueIndexesNotArbiters?: string[],  // an 'out' parameter too: what uniqueIndexConstraintsOnly would leave out
  domainsNotByContext?: string[],  // an 'out' parameter too: what domainsTypedByContext would change
  domainRoots: () => Promise<DomainRoots> = () => domainRootsInDatabase(queryFn),
  domainsUnderDomains?: string[],  // an 'out' parameter too: what domainsTypedByContext would type over a domain
  // Direct callers can still collect the columns the 6.x parser notes named when the setting was omitted.
  enumArraysNotAsText?: [column: string, customType: string | null][],
  intervalsAsText?: string[],
  // an 'out' parameter too: for each placeholder, the column that holds it, and the text and import that each of its
  // types gives it, as that type alone would (#42)
  customTypeHolders: Record<string, {
    relation: string; index: number; type: string; byType: Record<string, { type: string; imports: string | null }>;
  }> = Object.create(null),
) => {
  const
    rows = await columnsForRelation(rel, schemaName, queryFn),
    otherSchemas = [...new Set<string>(rows.map(row => row.udtSchema))].filter(schema => schema !== schemaName),
    otherEnums: Record<string, EnumData> = Object.fromEntries(await Promise.all(
      otherSchemas.map(async schema => [schema, await enumsForSchema(schema)]))),
    typeEnumsAcrossSchemas = config.typeEnumsAcrossSchemas ?? true,
    enumArraysAsText = config.enumArraysTypedAsText ?? true,
    domainsByContext = config.domainsTypedByContext ?? true,
    valuesAsAliases = config.valuesTypedAsAliases ?? false,
    inlineIn = (schema: string) => typeEnumsAcrossSchemas && schema !== schemaName,
    // a domain over a domain, or an array of a domain, is `any` to tsTypeForPgType: the base type under its domains
    // types it, read once per run if a column is `any`; an enum of another schema by its labels, never by its name in
    // this one, which may be another enum's
    isAny = (row: any) => tsTypeForPgType(row.udtName, inlineIn(row.udtSchema) ? otherEnums[row.udtSchema] : enums,
      'Selectable', config, inlineIn(row.udtSchema)) === 'any',
    roots: DomainRoots = rows.some(isAny) ? await domainRoots() : {},
    // intervalsTypedAsObjects types pg_catalog's interval only
    textIntervals = (config.intervalsTypedAsObjects ?? true) ? { ...config, intervalsTypedAsObjects: false } : config,
    configIn = (schema: string) => schema === 'pg_catalog' ? config : textIntervals,
    rootIn = (schema: string, name: string): DomainRoots[string] | undefined => roots[JSON.stringify([schema, name])],
    // a domain over a domain over an array of a domain has that array as its root, which has a root of its own
    rootOf = (row: any) => {
      const root = isAny(row) ? rootIn(row.udtSchema, row.udtName) : undefined;
      return root && !root.isArray ? rootIn(root.schema, root.name) ?? root : root;
    },
    rootSchemas = [...new Set(rows.map(row => rootOf(row)?.schema ?? schemaName))].filter(s => s !== schemaName),
    rootEnums: Record<string, EnumData> = Object.fromEntries(await Promise.all(
      rootSchemas.map(async schema => [schema, otherEnums[schema] ?? await enumsForSchema(schema)]))),
    selectables: string[] = [],
    JSONSelectables: string[] = [],
    whereables: string[] = [],
    insertables: string[] = [],
    updatables: string[] = [];

  rows.forEach((row, index) => {
    const
      { column, isGenerated, isNullable, hasDefault, udtName, domainName, udtSchema, domainSchema } = row,
      // with typeEnumsAcrossSchemas, an enum is looked up in the schema of its type; otherwise by name, in this one
      acrossSchemas = udtSchema !== schemaName,
      inlineEnums = typeEnumsAcrossSchemas && acrossSchemas,
      typeEnums = inlineEnums ? otherEnums[udtSchema] : enums,
      udtConfig = configIn(udtSchema);
    let
      selectableType = tsTypeForPgType(udtName, typeEnums, 'Selectable', udtConfig, inlineEnums),
      JSONSelectableType = tsTypeForPgType(udtName, typeEnums, 'JSONSelectable', udtConfig, inlineEnums),
      whereableType = tsTypeForPgType(udtName, typeEnums, 'Whereable', udtConfig, inlineEnums),
      insertableType = tsTypeForPgType(udtName, typeEnums, 'Insertable', udtConfig, inlineEnums),
      updatableType = tsTypeForPgType(udtName, typeEnums, 'Updatable', udtConfig, inlineEnums);

    // an interval, an array of one or a domain over either, whose placeholder holds what pg returns, as generated; under
    // another domain, or in an array of a domain, only where domainsTypedByContext types it by its base type, read as
    // below: an array of a domain over interval[] is then no type it knows
    const base = intervalsAsText && rootOf(row);
    if (intervalsAsText && config.intervalsTypedAsObjects == null &&  // left out, or null from JSON: false is a choice, a parser of your own
      (isInterval({ schema: udtSchema, name: udtName }) || domainsByContext &&
        isInterval(base && { schema: base.schema, name: (base.isArray ? '_' : '') + base.name }))) {
      const type = domainName !== null ? `${domainSchema}.${domainName}` : udtName === 'interval' ? udtName :
        udtName === '_interval' ? 'interval[]' : `${udtSchema}.${udtName.slice(1)}[]`;
      intervalsAsText.push(`${schemaName}.${rel.name}.${column} (${type})`);
    }

    if (columnsTypedByEnumName && !typeEnumsAcrossSchemas && acrossSchemas &&
      tsTypeForPgType(udtName, otherEnums[udtSchema], 'Selectable', udtConfig, true) !== selectableType) {
      const isArray = udtName.charAt(0) === '_' && !Object.prototype.hasOwnProperty.call(otherEnums[udtSchema], udtName);
      columnsTypedByEnumName.push(`${schemaName}.${rel.name}.${column} (${udtSchema}.${isArray ? udtName.slice(1) + '[]' : udtName})`);
    }

    // pg has no parser for the array type of an enum, whose OID is the database's own: it returns its text, '{a,b}'.
    // The enum is looked up in the schema of its type, which a built-in's array names too (pg_catalog)
    const
      ownEnums = acrossSchemas ? otherEnums[udtSchema] : enums,
      enumArray = selectableType !== 'any' && isEnumArray(udtName, ownEnums);
    if (enumArraysNotAsText && enumArray && config.enumArraysTypedAsText == null) {  // left out, or null from JSON
      enumArraysNotAsText.push([`${schemaName}.${rel.name}.${column} (${domainName === null ?
        `${udtSchema}.${udtName.slice(1)}[]` : `${domainSchema}.${domainName}`})`,
      domainName === null ? null : transformCustomType(domainName, config)]);
    }

    const
      columnDoc = createColumnDoc(config, schemaName, rel, row),
      schemaPrefix = config.unprefixedSchema === schemaName ? '' : `${schemaName}.`,
      prefixedRelName = schemaPrefix + rel.name,
      columnOptions =
        columnOptionsFor(config.columnOptions, prefixedRelName, column) ??
        columnOptionsFor(config.columnOptions, "*", column),
      isInsertable = rel.insertable && !isGenerated && columnOptions?.insert !== 'excluded',
      isUpdatable = rel.insertable && !isGenerated && columnOptions?.update !== 'excluded',
      insertablyOptional = isNullable || hasDefault || columnOptions?.insert === 'optional' ? '?' : '',
      orNull = isNullable ? ' | null' : '',
      orDefault = isNullable || hasDefault ? ' | db.DefaultType' : '',
      possiblyQuotedColumn = quoteIfIllegalIdentifier(column);

    // Now, 4 cases: 
    //   1. null domain, known udt        <-- standard case
    //   2. null domain, unknown udt      <-- custom type:       create type file, with placeholder 'any'
    //   3. non-null domain, known udt    <-- alias type:        create type file, with udt-based placeholder
    //   4. non-null domain, unknown udt  <-- alias custom type: create type file, with placeholder 'any'

    // Note: arrays of domains or custom types are treated as their own custom types

    if (selectableType === 'any' || domainName !== null) {  // cases 2, 3, 4
      const
        customType: string = domainName ?? udtName,
        prefixedCustomType = transformCustomType(customType, config),
        origins = customTypeOrigins[prefixedCustomType] ??= {},
        qualifiedType = `"${domainName === null ? udtSchema : domainSchema}"."${customType}"`,
        // a placeholder that two types of one name share (#42) holds the type of the column read last, by schema, then
        // relation, then column, as 6.6.1 did in one relation, in whichever order the relations are read; each type
        // reads only what its own columns wrote. A run that shares no holders reads what customTypes holds, as before
        relation = `${schemaName}\0${rel.name}`,  // \0: no name holds it, so "a" sorts before "a b"
        holder = customTypeHolders[prefixedCustomType] ??= { relation, index, type: qualifiedType, byType: {
          [qualifiedType]: { type: customTypes[prefixedCustomType], imports: customTypeImports[prefixedCustomType] },
        } },
        own: { type: string; imports: string | null } | undefined = holder.byType[qualifiedType],
        ownType = own?.type,
        ownImport = own?.imports,
        // an enum of this schema, by name, is not in scope in a placeholder: it imports the enum or its namespace;
        // a name that may be a global type (`Date`, `string`) compiles as it is, as in 6.6.1
        enumName = selectableType.replace(/\[\]$/, ''),
        importsEnum = !inlineEnums && enumName === enumName.toLowerCase() && !tsOwnTypes.has(enumName) &&
          Object.keys(typeEnums).some(name => tsIdentifier(name, 'type') === enumName),
        namespace = tsIdentifier(schemaName, 'namespace'),
        imported = importsEnum ? (schemaPrefix ? namespace : enumName) : '',
        // relations that would import differently keep 6.6.1's text, with no import, in whichever order they are read
        agrees = (ownImport ?? imported) === imported,
        hasEnum = hasOwn(typeEnums, udtName) || udtName.charAt(0) === '_' && hasOwn(typeEnums, udtName.slice(1)),
        // with typeEnumsAcrossSchemas, every relation reads the enum in its own schema: the labels that one of them
        // writes out type them all, and a relation that names the enum never replaces them
        labelled = inlineEnums && hasEnum,
        // without it, a relation of a schema with no enum of that name reads the type as `any`: that text wins, in
        // whichever order the relations are read
        keepsText = !inlineEnums && hasEnum && ownType === 'any';

      if (!keepsText && (labelled || ownImport !== null)) {
        holder.byType[qualifiedType] = {
          type: agrees && importsEnum && schemaPrefix ? `${namespace}.${selectableType}` : selectableType,
          imports: labelled ? null : agrees ? imported : '',
        };
      }
      if (holder.relation < relation || holder.relation === relation && holder.index <= index) {
        Object.assign(holder, { relation, index, type: qualifiedType });
      }
      ({ type: customTypes[prefixedCustomType], imports: customTypeImports[prefixedCustomType] } =
        holder.byType[holder.type]);
      origins[qualifiedType] = customType;

      // a domain over int8, numeric, bytea, money or a date: as generated, its placeholder holds what pg returns, though
      // a write takes more and, except for money, the shortcuts' JSON gives another type; with domainsTypedByContext,
      // each context takes its own type while the placeholder still holds exactly what the generator wrote
      // (db.DomainInContext), and the placeholder's otherwise. A domain over a domain, or an array of a domain, has an
      // `any` placeholder: all five take the type of the base type under its domains, but an array's Selectable, a
      // string, since pg returns an array of a type it does not know as its text
      const
        placeholder = 'c.' + prefixedCustomType,
        root = rootOf(row),
        inlineRoot = root !== undefined && root.schema !== schemaName,
        // root.isArray marks an array of domains. A domain over an enum array has the array's own name at its root.
        enumsAtRoot = inlineRoot ? rootEnums[root.schema] : enums,
        rootTypes = root && contexts.map(context => context === 'Selectable' &&
          (root.isArray || enumArraysAsText && isEnumArray(root.name, enumsAtRoot)) ? 'string' :
          tsTypeForPgType((root.isArray ? '_' : '') + root.name, enumsAtRoot, context, configIn(root.schema), inlineRoot)),
        underDomains = rootTypes && rootTypes[1] !== 'any' ? rootTypes : undefined,
        byContext = domainName !== null && selectableType !== 'any' &&
          [JSONSelectableType, whereableType, insertableType, updatableType].some(type => type !== selectableType),
        typedByContext = (byContext || underDomains !== undefined) && domainsByContext,
        inContext = (type: string) => typedByContext ? `db.DomainInContext<${placeholder}, ${selectableType}, ${type}>` : placeholder;

      if (byContext && !typedByContext) domainsNotByContext?.push(`${schemaName}.${rel.name}.${column} (${domainSchema}.${domainName})`);
      if (domainsUnderDomains && underDomains && !typedByContext) {
        const type = domainName === null ? `${udtSchema}.${udtName.slice(1)}[]` : `${domainSchema}.${domainName}`;
        domainsUnderDomains.push(`${schemaName}.${rel.name}.${column} (${type})`);
      }
      const generated = selectableType;
      [selectableType, JSONSelectableType, whereableType, insertableType, updatableType] = underDomains?.map(inContext) ??
        [placeholder, ...[JSONSelectableType, whereableType, insertableType, updatableType].map(inContext)];
      // a domain over an array of an enum: pg's text while its placeholder holds what the generator wrote
      if (enumArray && enumArraysAsText) selectableType = `db.DomainInContext<${placeholder}, ${generated}, string>`;

    } else if (enumArray && enumArraysAsText) selectableType = 'string';

    selectables.push(`${columnDoc}${possiblyQuotedColumn}: ${selectableType}${orNull};`);
    JSONSelectables.push(`${columnDoc}${possiblyQuotedColumn}: ${JSONSelectableType}${orNull};`);

    // with valuesTypedAsAliases, the aliases of src/db/utils.ts, each the union written out below; `null` and
    // `db.DefaultType` as their second type argument
    const extra = orNull + orDefault === '' ? '' : `, ${(orNull + orDefault).replace(/^ \| /, '')}`;

    const basicWhereableTypes = `${whereableType} | db.Parameter<${whereableType}> | db.SQLFragment | db.ParentColumn`;
    whereables.push(`${columnDoc}${possiblyQuotedColumn}?: ${valuesAsAliases ? `db.WhereableValue<${whereableType}>` :
      `${basicWhereableTypes} | db.SQLFragment<any, ${basicWhereableTypes}>`};`);

    // db.SQLFragment<any>: the default RunResult (any[]) refused a fragment typed sql<…, string> or a shortcut (#654)
    const insertableTypes = valuesAsAliases ? `db.InsertableValue<${insertableType}${extra}>` :
      `${insertableType} | db.Parameter<${insertableType}>${orNull}${orDefault} | db.SQLFragment<any>`;
    if (isInsertable) insertables.push(`${columnDoc}${possiblyQuotedColumn}${insertablyOptional}: ${insertableTypes};`);

    const
      updatableTypes = `${updatableType} | db.Parameter<${updatableType}>${orNull}${orDefault} | db.SQLFragment`,
      updatableValue = valuesAsAliases ? `db.UpdatableValue<${updatableType}${extra}>` :
        `${updatableTypes} | db.SQLFragment<any, ${updatableTypes}>`;
    if (isUpdatable) updatables.push(`${columnDoc}${possiblyQuotedColumn}?: ${updatableValue};`);
  });

  // an index sits in its table's schema: matched on its name alone, it also took another schema's unique index.
  // ON CONFLICT ON CONSTRAINT takes the index of a UNIQUE or PRIMARY KEY constraint of the table (a foreign key's
  // conindid is the referenced table's), but not DEFERRABLE (55000), nor WITHOUT OVERLAPS, an exclusion constraint
  // to Postgres, which refuses it with DO UPDATE (42809): https://www.postgresql.org/docs/current/sql-insert.html
  // Nor an index not yet valid (42P10), such as a partitioned table's constraint added with ALTER TABLE ONLY, until
  // each partition's index is attached: https://www.postgresql.org/docs/current/ddl-partitioning.html
  const
    result = await queryFn({
      text: `
        SELECT DISTINCT i.indexname
        , idx.indisvalid AND NOT idx.indisexclusion AND EXISTS (
            SELECT 1 FROM pg_catalog.pg_constraint con
            WHERE con.conindid = c.oid AND con.conrelid = idx.indrelid
            AND con.contype IN ('p', 'u') AND NOT con.condeferrable
          ) AS "isArbiter"
        FROM pg_catalog.pg_indexes i
        JOIN pg_catalog.pg_namespace n ON n.nspname = i.schemaname
        JOIN pg_catalog.pg_class c ON c.relname = i.indexname AND c.relnamespace = n.oid
        JOIN pg_catalog.pg_index idx ON idx.indexrelid = c.oid AND idx.indisunique
        WHERE i.tablename = $1 AND i.schemaname = $2
        ORDER BY i.indexname`,
      values: [rel.name, schemaName]
    }),
    constraintsOnly = config.uniqueIndexConstraintsOnly ?? true,
    uniqueIndexes = result.rows.filter(ui => ui.isArbiter || !constraintsOnly);

  if (uniqueIndexesNotArbiters && !constraintsOnly) {
    uniqueIndexesNotArbiters.push(...result.rows.filter(ui => !ui.isArbiter).map(ui => `${schemaName}.${rel.name}.${ui.indexname}`));
  }

  let constraintDef = '';
  if (config.constraintNames === true) {
    const { rows } = await queryFn({
      text: `
        SELECT con.conname
        FROM pg_catalog.pg_constraint con
        JOIN pg_catalog.pg_class r ON r.oid = con.conrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = r.relnamespace
        WHERE r.relname = $1 AND n.nspname = $2 AND con.contype IN ('p', 'u', 'f', 'c', 'x')`,
      values: [rel.name, schemaName]
    });
    const extraNames = new Set<string>([...result.rows.map(ui => ui.indexname), ...rows.map(con => con.conname)]);
    for (const ui of uniqueIndexes) extraNames.delete(ui.indexname);
    const members = [...extraNames].sort().map(name => stringLiteral(name));
    if (uniqueIndexes.length > 0) members.unshift('UniqueIndex');
    constraintDef = `\n  export type Constraint = ${members.join(' | ') || 'never'};`;
  }

  const
    schemaPrefix = schemaName === config.unprefixedSchema ? '' : `${schemaName}.`,
    friendlyRelTypes: Record<Relation['type'], string> = {
      table: 'Table',
      fdw: 'Foreign table',
      view: 'View',
      mview: 'Materialized view',
    },
    friendlyRelType = friendlyRelTypes[rel.type],
    tableComment = config.schemaJSDoc ? `
/**
 * ${jsdocLines(`**${schemaPrefix}${rel.name}**`, ' ')}
 * - ${friendlyRelType} in database
 */` : ``,
    // SQLExpression's Whereable refuses a primitive (notIterable, above)
    tableDef = `${tableComment}
export namespace ${tsIdentifier(rel.name, 'namespace')} {
  export type Table = ${stringLiteral(schemaPrefix + rel.name)};
  export interface Selectable {
    ${selectables.join('\n    ')}
  }
  export interface JSONSelectable {
    ${JSONSelectables.join('\n    ')}
  }
  export interface Whereable {
    ${whereables.join('\n    ')}
  }
  export interface Insertable {
    ${insertables.length > 0 ? insertables.join('\n    ') : `[key: string]: never;`}
  }
  export interface Updatable {
    ${updatables.length > 0 ? updatables.join('\n    ') : `[key: string]: never;`}
  }
  export type UniqueIndex = ${uniqueIndexes.length > 0 ?
        uniqueIndexes.map(ui => stringLiteral(ui.indexname)).join(' | ') :
        'never'};${constraintDef}
  export type Column = keyof Selectable;
  export type OnlyCols<T extends readonly Column[]> = Pick<Selectable, T[number]>;
  export type SQLExpression = Table | db.ColumnNames<Updatable | (keyof Updatable)[]> | db.ColumnValues<Updatable> | (Whereable & ${notIterable}) | Column | db.ParentColumn | db.GenericSQLExpression;
  export type SQL = SQLExpression | SQLExpression[];
}`;
  return tableDef;
};

const transformCustomType = (customType: string, config: CompleteConfig) => {
  const
    ctt = config.customTypesTransform,
    underscoredType = customType.replace(/\W+/g, '_'),
    legalisedType = customType.replace(/\W+/g, '');

  return ctt === 'my_type' ? legalisedType :
    ctt === 'PgMyType' ? ('Pg_' + legalisedType).replace(/_[^_]/g, m => m.charAt(1).toUpperCase()) :
      ctt === 'PgMy_type' ? 'Pg' + underscoredType.charAt(0).toUpperCase() + underscoredType.slice(1) :
        ctt(customType);
};

const
  tableMappedUnion = (arr: Relation[], suffix: string) =>
    arr.length === 0 ? 'never' : arr.map(rel => `${tsIdentifier(rel.name, 'namespace')}.${suffix}`).join(' | '),
  tableMappedArray = (arr: Relation[], suffix: string) =>
    '[' + arr.map(rel => `${tsIdentifier(rel.name, 'namespace')}.${suffix}`).join(', ') + ']';

export const crossTableTypesForTables = (tables: Relation[]) => `${tables.length === 0 ?
  '\n// `never` rather than `any` types would be more accurate in this no-tables case, but they stop `shortcuts.ts` compiling\n' : ''
  }
export type Table = ${tableMappedUnion(tables, 'Table')};
export type Selectable = ${tableMappedUnion(tables, 'Selectable')};
export type JSONSelectable = ${tableMappedUnion(tables, 'JSONSelectable')};
export type Whereable = ${tableMappedUnion(tables, 'Whereable')};
export type Insertable = ${tableMappedUnion(tables, 'Insertable')};
export type Updatable = ${tableMappedUnion(tables, 'Updatable')};
export type UniqueIndex = ${tableMappedUnion(tables, 'UniqueIndex')};
export type Column = ${tableMappedUnion(tables, 'Column')};

export type AllBaseTables = ${tableMappedArray(tables.filter(rel => rel.type === 'table'), 'Table')};
export type AllForeignTables = ${tableMappedArray(tables.filter(rel => rel.type === 'fdw'), 'Table')};
export type AllViews = ${tableMappedArray(tables.filter(rel => rel.type === 'view'), 'Table')};
export type AllMaterializedViews = ${tableMappedArray(tables.filter(rel => rel.type === 'mview'), 'Table')};
export type AllTablesAndViews = ${tableMappedArray(tables, 'Table')};`;

export const crossSchemaTypesForAllTables = (allTables: Relation[], unprefixedSchema: string | null) =>
  ['Selectable', 'JSONSelectable', 'Whereable', 'Insertable', 'Updatable', 'UniqueIndex', 'Column', 'SQL'].map(thingable => `
export type ${thingable}ForTable<T extends Table> = ${allTables.length === 0 ? 'any' : `{${allTables.map(rel => `
  ${stringLiteral((rel.schema === unprefixedSchema ? '' : `${rel.schema}.`) + rel.name, '"')}: ${rel.schema === unprefixedSchema ? '' : `${tsIdentifier(rel.schema, 'namespace')}.`}${tsIdentifier(rel.name, 'namespace')}.${thingable};`).join('')}
}[T]`};
`).join('');

const
  schemaMappedUnion = (arr: string[], suffix: string) =>
    arr.length === 0 ? 'any' : arr.map(s => `${tsIdentifier(s, 'namespace')}.${suffix}`).join(' | '),
  schemaMappedArray = (arr: string[], suffix: string) =>
    '[' + arr.map(s => `...${tsIdentifier(s, 'namespace')}.${suffix}`).join(', ') + ']';

export const crossSchemaTypesForSchemas = (schemas: string[]) => `
export type Schema = ${schemas.map(s => stringLiteral(s)).join(' | ')};
export type Table = ${schemaMappedUnion(schemas, 'Table')};
export type Selectable = ${schemaMappedUnion(schemas, 'Selectable')};
export type JSONSelectable = ${schemaMappedUnion(schemas, 'JSONSelectable')};
export type Whereable = ${schemaMappedUnion(schemas, 'Whereable')};
export type Insertable = ${schemaMappedUnion(schemas, 'Insertable')};
export type Updatable = ${schemaMappedUnion(schemas, 'Updatable')};
export type UniqueIndex = ${schemaMappedUnion(schemas, 'UniqueIndex')};
export type Column = ${schemaMappedUnion(schemas, 'Column')};

export type AllSchemas = [${schemas.map(s => stringLiteral(s)).join(', ')}];
export type AllBaseTables = ${schemaMappedArray(schemas, 'AllBaseTables')};
export type AllForeignTables = ${schemaMappedArray(schemas, 'AllForeignTables')};
export type AllViews = ${schemaMappedArray(schemas, 'AllViews')};
export type AllMaterializedViews = ${schemaMappedArray(schemas, 'AllMaterializedViews')};
export type AllTablesAndViews = ${schemaMappedArray(schemas, 'AllTablesAndViews')};
`;

const createColumnDoc = (config: CompleteConfig, schemaName: string, rel: Relation, columnDetails: Record<string, unknown>) => {
  if (!config.schemaJSDoc) return '';

  const
    schemaPrefix = schemaName === config.unprefixedSchema ? '' : `${schemaName}.`,
    { column,
      isGenerated,
      isNullable,
      hasDefault,
      defaultValue,
      udtName,
      domainName,
      description,
    } = columnDetails,
    // every line of a multi-line comment gets its ` * `: TypeScript ends a JSDoc line at \r as at \n
    lines = description ? jsdocText(description as string).split(/\r\n?|\n/) : [],
    // a tag (`@deprecated`) would read the generated lines after it as its own text, so the comment goes after them
    // from the line that starts it. TypeScript can start a tag, or an inline `{@link …}` that may run on through the
    // next line, only at an @ that follows a { or no printable ASCII character: the first line with one moves only if
    // it surely starts a tag, with an @ first but for spaces and tabs, or one after a space or tab and before a
    // printable character, past anything starting with `{@link` that is closed on the line with no quote, backtick,
    // /, backslash or line separator in it (TypeScript reads a string, a template, a comment or an escape there,
    // which can hide its }, and a line separator breaks the line); otherwise the JSDoc stays as it was
    tagAt = lines.findIndex(line => /(?<![!-z|-~])@/.test(line)),
    [text, tags] = tagAt < 0 || !/^[ \t]*@|^(?:\{@link[^}'"`/\\\u2028\u2029]*\}|(?!\{@link)[^])*?[ \t]@[!-~]/.test(lines[tagAt]) ?
      [lines, []] : [lines.slice(0, tagAt), lines.slice(tagAt)],
    commentDoc = text.length ? '\n    *\n    * ' + text.join('\n    * ') : '',
    tagsDoc = tags.length ? '\n    *\n    * ' + tags.join('\n    * ') : '',
    // a quoted name or a default (a string literal, a quoted name) holding a line break: ` * ` on every line
    [domain, udt, defaultLines] = [domainName, udtName ?? '(none)', defaultValue].map(t => jsdocLines(String(t), '    ')),
    doc = `/**
    * ${jsdocLines(`**${schemaPrefix}${rel.name}.${column}**`, '    ')}${commentDoc}
    * - ${domainName ? `\`${domain}\` (base type: \`${udt}\`)` : `\`${udt}\``} in database
    * - ${rel.type === 'mview' ? 'Materialized view column' : isGenerated ? 'Generated column' :
        `${isNullable ? 'Nullable' : '`NOT NULL`'}, ${hasDefault && defaultValue === null ? `identity column` : hasDefault ? `default: \`${defaultLines}\`` : `no default`}`}${tagsDoc}
    */
    `;
  return doc;
};
