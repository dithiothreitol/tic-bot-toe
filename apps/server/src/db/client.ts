import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import * as schema from './schema';

export type Database = ReturnType<typeof drizzle<typeof schema>>;

export interface DbHandle {
  db: Database;
  /** Close the underlying connection pool. */
  close: () => Promise<void>;
  /** Apply migrations from the given folder. */
  migrate: (folder: string) => Promise<void>;
}

export function createDb(url: string, options: { max?: number } = {}): DbHandle {
  const client = postgres(url, { max: options.max ?? 10 });
  const db = drizzle(client, { schema });
  return {
    db,
    close: () => client.end({ timeout: 5 }),
    migrate: (folder: string) => migrate(db, { migrationsFolder: folder }),
  };
}
