// Copyright (C) 2026 Alexandre Demartin

import type { Client, Connection, FieldDef } from 'pg';

type Field = Pick<FieldDef, 'name' | 'dataTypeID' | 'tableID' | 'columnID'>;
interface Description {
  fields: Field[] | null;
  parameterOIDs: number[];
}

/** Describe one statement on a dedicated, connected client. The caller owns it and describes statements in sequence. */
export async function describeQuery(client: Client, text: string): Promise<Description> {
  await client.query('BEGIN READ ONLY');
  try {
    await client.query("SET LOCAL lock_timeout = '1s'");
    return await new Promise<Description>((resolve, reject) => {
      let fields: Field[] | null | undefined, parameterOIDs: number[] | undefined;
      const parameters = (message: { dataTypeIDs: number[] }) => { parameterOIDs = message.dataTypeIDs; },
        noData = () => { fields = null; };

      client.query({
        submit(connection: Connection) {
          connection.on('parameterDescription', parameters);
          connection.on('noData', noData);
          connection.parse({ name: '', text, types: [] }, false);
          connection.describe({ type: 'S', name: '' }, false);
          connection.sync();
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
    await client.query('ROLLBACK');
  }
}
