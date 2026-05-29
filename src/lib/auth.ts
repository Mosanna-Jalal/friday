import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { MongoClient, ObjectId } from "mongodb";

export const COOKIE_NAME = "friday_session";

const secret = () =>
  new TextEncoder().encode(
    process.env.FRIDAY_JWT_SECRET || "friday-jwt-secret-change-in-prod"
  );

export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
  role: "admin" | "user";
};

let _client: MongoClient | null = null;
async function getDb() {
  const uri = process.env.MONGODB_URI_FRIDAY;
  if (!uri) throw new Error("MONGODB_URI_FRIDAY not set");
  if (!_client) {
    _client = new MongoClient(uri);
    await _client.connect();
  }
  return _client.db("friday");
}

export async function findUserByUsername(username: string) {
  const db = await getDb();
  return db.collection("users").findOne({ username: username.toLowerCase().trim() });
}

export async function createUser(
  username: string,
  password: string,
  displayName: string,
  role: "admin" | "user" = "user"
) {
  const db = await getDb();
  const passwordHash = await bcrypt.hash(password, 12);
  const result = await db.collection("users").insertOne({
    username: username.toLowerCase().trim(),
    passwordHash,
    displayName,
    role,
    createdAt: new Date(),
  });
  return result.insertedId;
}

export async function ensureAdminExists() {
  const db = await getDb();
  const count = await db.collection("users").countDocuments();
  if (count === 0) {
    await createUser("gbmadmin", "gbmgpt", "MJ", "admin");
  }
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export async function signToken(user: SessionUser): Promise<string> {
  return new SignJWT({
    sub: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(secret());
}

export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      id: payload.sub as string,
      username: payload.username as string,
      displayName: payload.displayName as string,
      role: payload.role as "admin" | "user",
    };
  } catch {
    return null;
  }
}
