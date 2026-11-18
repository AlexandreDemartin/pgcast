import * as db from 'zapatos/db';
// ---cut---
const sent: string[] = [];
const showPool = {  // what a driver's adapter gives, or a test's fake
  connect: async () => ({
    query: async (query: { text: string; values?: unknown[] }) => {
      sent.push(query.text);
      return { rows: [{ result: 0 }], command: query.text.replace(/ .*/, '') };
    },
    release: () => { sent.push('release()'); },
  }),
};

const taken = await db.serializable(showPool, txnClient =>
  db.count('seat_bookings', { screening_id: 1000 }).run(txnClient));
