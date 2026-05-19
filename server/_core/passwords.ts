import { scryptSync, timingSafeEqual, randomBytes } from "node:crypto";

const KEY_LENGTH = 64;

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `scrypt:${salt}:${key}`;
}

export function verifyPassword(password: string, storedHash: string | null | undefined) {
  if (!storedHash) return false;
  const [algorithm, salt, key] = storedHash.split(":");
  if (algorithm !== "scrypt" || !salt || !key) return false;

  const expected = Buffer.from(key, "hex");
  const actual = scryptSync(password, salt, expected.length);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
