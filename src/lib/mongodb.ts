import { MongoClient } from "mongodb";

const URI = process.env.MONGODB_URI_FRIDAY!;

// Survive Next.js hot-reloads in dev without multiplying connections
declare global {
  // eslint-disable-next-line no-var
  var _fridayClient: MongoClient | undefined;
}

function makeClient() {
  return new MongoClient(URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 10000,
  });
}

const client: MongoClient =
  process.env.NODE_ENV === "development"
    ? (global._fridayClient ??= makeClient())
    : makeClient();

let _connected = false;
export async function getFridayDb() {
  if (!_connected) {
    await client.connect();
    _connected = true;
    await ensureIndexes(client);
  }
  return client.db("friday");
}

async function ensureIndexes(c: MongoClient) {
  const db = c.db("friday");
  await Promise.all([
    db.collection("users").createIndex({ username: 1 }, { unique: true }),
    db.collection("users").createIndex({ email: 1 }, { sparse: true }),
    db.collection("otps").createIndex({ email: 1, purpose: 1 }),
    db.collection("otps").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("history").createIndex({ userId: 1, ts: -1 }),
    db.collection("tasks").createIndex({ userId: 1, status: 1, priority: -1 }),
  ]);
}
