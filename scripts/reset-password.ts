import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import { users } from '../drizzle/schema';
import { scryptSync, randomBytes } from 'crypto';

const DATABASE_URL = "postgresql://neondb_owner:npg_Qmb9LFlX0KeN@ep-weathered-glade-aqb41qeu-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const sql = neon(DATABASE_URL);
const db = drizzle(sql);

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${key}`;
}

async function run() {
  console.log("Checking user pedro...");
  const userList = await db.select().from(users).where(eq(users.username, "pedro"));
  if (userList.length === 0) {
    console.log("User pedro not found.");
    return;
  }
  const user = userList[0];
  console.log("User found:", user.username, user.name, "Active:", user.active);

  const newHash = hashPassword("pedro123");
  await db.update(users).set({ passwordHash: newHash, active: 1 }).where(eq(users.username, "pedro"));
  console.log("Password for pedro reset to pedro123 and user set to active with correct scrypt prefix.");
}

run().catch(console.error);
