import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";
import { getFridayDb } from "./mongodb";

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

export async function findUserByUsername(username: string) {
  const db = await getFridayDb();
  return db.collection("users").findOne({ username: username.toLowerCase().trim() });
}

export async function findUserByEmail(email: string) {
  const db = await getFridayDb();
  return db.collection("users").findOne({ email: email.toLowerCase().trim() });
}

export async function createUser(
  username: string,
  password: string,
  displayName: string,
  role: "admin" | "user" = "user",
  email?: string,
) {
  const db = await getFridayDb();
  const passwordHash = await bcrypt.hash(password, 10);
  const result = await db.collection("users").insertOne({
    username: username.toLowerCase().trim(),
    passwordHash,
    displayName,
    role,
    email: email ? email.toLowerCase().trim() : null,
    createdAt: new Date(),
  });
  return result.insertedId;
}

export async function updatePassword(userId: string, newPassword: string): Promise<void> {
  const db = await getFridayDb();
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.collection("users").updateOne(
    { _id: new ObjectId(userId) },
    { $set: { passwordHash } },
  );
}

let _adminSeeded = false;
export async function ensureAdminExists() {
  if (_adminSeeded) return;
  const db = await getFridayDb();
  const count = await db.collection("users").countDocuments();
  if (count === 0) {
    await createUser("gbmadmin", "gbmgpt", "MJ", "admin", "mjiraqui322@gmail.com");
  }
  _adminSeeded = true;
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
