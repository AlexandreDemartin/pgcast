// Copyright (C) 2026 Alexandre Demartin

import type { CompleteConfig } from '@pgcast/pgcast/generate';
import type { Client, Connection, FieldDef, MessageConfig, QueryParse } from 'pg';
import { DatabaseError } from 'pg';
import type { ResultField } from './values';
import { refineOrigins } from './origins';

type Field = ResultField & Pick<FieldDef, 'tableID' | 'columnID'>;

export class RejectedParse extends Error {
  constructor(readonly serverError: DatabaseError) { super(serverError.message); }
}

interface Description {
  fields: Field[] | null;
  parameterOIDs: number[];
}

// pg 8.6 and 8.23 take one message here. The declarations require a second argument.
interface StatementMessages {
  parse(message: QueryParse): void;
  describe(message: MessageConfig): void;
}

/**
 * Describe one statement with Parse, Describe and Sync in a read-only transaction with a one-second lock timeout.
 * The caller owns a dedicated, connected client with query_timeout disabled, listens for its error event and
 * describes statements in sequence. After BEGIN succeeds, each description awaits ROLLBACK.
 * A failure sending Parse, Describe or Sync ends the client. Transaction commands follow pg's client.query
 * error handling. After any rejection, the owner discards the client unless it chooses to reuse it.
 * Return parameter OIDs and ordered fields with their names, type OIDs, table OIDs and attribute numbers.
 * With schema rules, refine field types with a fresh snapshot while Parse holds its locks.
 * An expression can have zero for both origin fields.
 * NoData (e.g. DELETE without RETURNING) gives null fields. A zero-column row gives an empty array.
 */
export async function describeQuery(client: Client, text: string, schemas?: CompleteConfig['schemas'], variant = false): Promise<Description> {
  const { connectionParameters } = client as Client & { connectionParameters: { query_timeout: number | false } };
  if (connectionParameters.query_timeout) throw new Error('Disable query_timeout on the client used to describe statements');
  await client.query('BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY');
  let succeeded = false;
  try {
    await client.query("SET LOCAL lock_timeout = '1s'");
    const dateStyle = (await client.query('SHOW DateStyle')).rows[0].DateStyle;
    const intervalStyle = (await client.query('SHOW IntervalStyle')).rows[0].IntervalStyle;
    const description = await new Promise<Description>((resolve, reject) => {
      let fields: Field[] | null | undefined, parameterOIDs: number[] | undefined;
      let parsed = false;
      const parseComplete = () => { parsed = true; };
      const parameters = (message: { dataTypeIDs: number[] }) => { parameterOIDs = message.dataTypeIDs; },
        noData = () => { fields = null; };

      client.query({
        submit(connection: Connection) {
          connection.on('parseComplete', parseComplete);
          connection.on('parameterDescription', parameters);
          connection.on('noData', noData);
          const statement = connection as Connection & StatementMessages;
          try {
            statement.parse({ name: '', text, types: [] });
            statement.describe({ type: 'S', name: '' });
            connection.sync();
          } catch (error) {
            // Postgres may already have received part of the statement exchange.
            const failure = error instanceof Error ? error : new Error(String(error));
            // pg 8.6 delivers the returned error on nextTick. An earlier socket error clears its active query.
            process.nextTick(() => connection.stream.destroy(failure));
            return failure;
          }
        },
        handleRowDescription(message: { fields: Field[] }) {
          fields = message.fields.map(({ name, dataTypeID, tableID, columnID }) => ({ name, dataTypeID, tableID, columnID }));
        },
        handleReadyForQuery() { this.callback(); },
        // On ErrorResponse pg clears its active query, so ReadyForQuery will not reach this object.
        handleError(error: Error) {
          // Only type-resolution errors during Parse can rule out a parameter form.
          const rejected = variant && !parsed && error instanceof DatabaseError && error.code &&
            ['42883', '42804', '42846', '42725', '42P18'].includes(error.code);
          this.callback(rejected ? new RejectedParse(error) : error);
        },
        callback(error?: Error) {
          client.connection.removeListener('parseComplete', parseComplete);
          client.connection.removeListener('parameterDescription', parameters);
          client.connection.removeListener('noData', noData);
          if (error) reject(error);
          else if (fields === undefined || !parameterOIDs) reject(new Error('Postgres returned an incomplete statement description'));
          else resolve({ fields, parameterOIDs });
        },
      });
    });
    for (const { dataTypeID } of description.fields ?? []) {
      // pg-types uses the same date and interval parsers for array elements.
      if (!dateStyle.startsWith('ISO,') && [1082, 1114, 1184, 1182, 1115, 1185].includes(dataTypeID)) {
        throw new Error('Set DateStyle to ISO for date and timestamp fields');
      }
      if (intervalStyle !== 'postgres' && [1186, 1187].includes(dataTypeID)) {
        throw new Error('Set IntervalStyle to postgres for interval fields');
      }
    }
    if (schemas && description.fields) await refineOrigins(client, text, description.fields, schemas);
    succeeded = true;
    return description;
  } finally {
    await client.query('ROLLBACK').catch(error => {
      if (succeeded || variant) throw error;
    });
  }
}
