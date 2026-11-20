// Copyright (C) 2026 Alexandre Demartin

import type { Client, Connection, FieldDef, MessageConfig, QueryParse } from 'pg';

type Field = Pick<FieldDef, 'name' | 'dataTypeID' | 'tableID' | 'columnID'>;
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
 * describes statements in sequence. Each description awaits ROLLBACK. A send failure or a lost connection
 * ends the client. Its owner must discard it.
 * Return parameter OIDs and ordered fields with their names, type OIDs, table OIDs and attribute numbers.
 * An expression can have zero for both origin fields.
 * NoData (e.g. DELETE without RETURNING) gives null fields. A zero-column row gives an empty array.
 */
export async function describeQuery(client: Client, text: string): Promise<Description> {
  const { connectionParameters } = client as Client & { connectionParameters: { query_timeout: number | false } };
  if (connectionParameters.query_timeout) throw new Error('Disable query_timeout on the client used to describe statements');
  await client.query('BEGIN READ ONLY');
  let description: Description | undefined;
  try {
    await client.query("SET LOCAL lock_timeout = '1s'");
    description = await new Promise<Description>((resolve, reject) => {
      let fields: Field[] | null | undefined, parameterOIDs: number[] | undefined;
      const parameters = (message: { dataTypeIDs: number[] }) => { parameterOIDs = message.dataTypeIDs; },
        noData = () => { fields = null; };

      client.query({
        submit(connection: Connection) {
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
        handleError(error: Error) { this.callback(error); },
        callback(error?: Error) {
          client.connection.removeListener('parameterDescription', parameters);
          client.connection.removeListener('noData', noData);
          if (error) reject(error);
          else if (fields === undefined || !parameterOIDs) reject(new Error('Postgres returned an incomplete statement description'));
          else resolve({ fields, parameterOIDs });
        },
      });
    });
  } finally {
    await client.query('ROLLBACK').catch(error => {
      if (description) throw error;
    });
  }
  return description;
}
