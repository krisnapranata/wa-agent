import { DatabaseService } from '../database/database.service';

/**
 * Penyimpanan session/auth Baileys di tabel MySQL `wa_auth_state`.
 * Cocok untuk container production yang filesystem-nya tidak permanen.
 */
export async function useMysqlAuthState(db: DatabaseService, baileys: any, sessionId: string) {
  const { initAuthCreds, BufferJSON, proto } = baileys;
  const k = (name: string) => `${sessionId}:${name}`;

  const readData = async (name: string): Promise<any> => {
    const rows = await db.query<{ data: string }>('SELECT data FROM wa_auth_state WHERE id = ?', [k(name)]);
    return rows.length ? JSON.parse(rows[0].data, BufferJSON.reviver) : null;
  };
  const writeData = async (name: string, value: any) => {
    await db.execute(
      'INSERT INTO wa_auth_state (id, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)',
      [k(name), JSON.stringify(value, BufferJSON.replacer)],
    );
  };
  const removeData = async (name: string) => {
    await db.execute('DELETE FROM wa_auth_state WHERE id = ?', [k(name)]);
  };

  const creds = (await readData('creds')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type: string, ids: string[]) => {
          const out: Record<string, any> = {};
          if (!ids.length) return out;
          const names = ids.map((id) => k(`${type}-${id}`));
          const rows = await db.query<{ id: string; data: string }>(
            'SELECT id, data FROM wa_auth_state WHERE id IN (?)',
            [names],
          );
          const map = new Map(rows.map((r) => [r.id, r.data]));
          for (const id of ids) {
            const raw = map.get(k(`${type}-${id}`));
            let value = raw ? JSON.parse(raw, BufferJSON.reviver) : null;
            if (type === 'app-state-sync-key' && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            out[id] = value;
          }
          return out;
        },
        set: async (data: Record<string, Record<string, any>>) => {
          const tasks: Promise<any>[] = [];
          for (const category of Object.keys(data)) {
            for (const id of Object.keys(data[category])) {
              const value = data[category][id];
              const name = `${category}-${id}`;
              tasks.push(value ? writeData(name, value) : removeData(name));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => writeData('creds', creds),
    clear: async () => {
      await db.execute('DELETE FROM wa_auth_state WHERE id LIKE ?', [`${sessionId}:%`]);
    },
  };
}
