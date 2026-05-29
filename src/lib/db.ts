import { MongoClient } from "mongodb";

export type DbAlias = "alumni" | "attendance" | "fest" | "internal";

const URI_MAP: Record<DbAlias, string | undefined> = {
  alumni:     process.env.MONGODB_URI_ALUMNI,
  attendance: process.env.MONGODB_URI_ATTENDANCE,
  fest:       process.env.MONGODB_URI_FEST,
  internal:   process.env.MONGODB_URI_INTERNAL,
};

const DB_NAME_MAP: Record<DbAlias, string> = {
  alumni:     "gbm-alumni",
  attendance: "attendace-gbm-graph",
  fest:       "gbm-fest-2026",
  internal:   "gbm-internal-test",
};

// Cache clients per URI to avoid reconnecting on every request
const clientCache = new Map<string, MongoClient>();

async function getClient(uri: string): Promise<MongoClient> {
  let client = clientCache.get(uri);
  if (!client) {
    client = new MongoClient(uri);
    await client.connect();
    clientCache.set(uri, client);
  }
  return client;
}

export async function getDb(alias: DbAlias) {
  const uri = URI_MAP[alias];
  if (!uri) throw new Error(`No URI configured for database "${alias}".`);
  const client = await getClient(uri);
  return client.db(DB_NAME_MAP[alias]);
}

export async function listCollections(alias: DbAlias): Promise<string[]> {
  const db = await getDb(alias);
  const cols = await db.listCollections().toArray();
  return cols.map((c) => c.name);
}

export async function queryCollection(
  alias: DbAlias,
  collection: string,
  filter: Record<string, unknown>,
  limit: number,
): Promise<unknown[]> {
  const db = await getDb(alias);
  return db.collection(collection).find(filter).limit(limit).toArray();
}

export async function aggregateCollection(
  alias: DbAlias,
  collection: string,
  pipeline: Record<string, unknown>[],
): Promise<unknown[]> {
  const db = await getDb(alias);
  return db.collection(collection).aggregate(pipeline).toArray();
}
