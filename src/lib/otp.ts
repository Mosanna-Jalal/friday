import { getFridayDb } from "./mongodb";

export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function storeOTP(
  email: string,
  code: string,
  purpose: "login" | "register" | "reset",
): Promise<void> {
  const col = (await getFridayDb()).collection("otps");
  await col.deleteMany({ email: email.toLowerCase(), purpose });
  await col.insertOne({
    email: email.toLowerCase(),
    code,
    purpose,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    used: false,
    createdAt: new Date(),
  });
}

export async function verifyOTP(
  email: string,
  code: string,
  purpose: "login" | "register" | "reset",
): Promise<boolean> {
  const col = (await getFridayDb()).collection("otps");
  const doc = await col.findOne({
    email: email.toLowerCase(),
    code: code.trim(),
    purpose,
    used: false,
    expiresAt: { $gt: new Date() },
  });
  if (!doc) return false;
  await col.updateOne({ _id: doc._id }, { $set: { used: true } });
  return true;
}
