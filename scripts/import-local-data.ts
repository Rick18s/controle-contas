import "dotenv/config";
import fs from "fs";
import path from "path";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  bankBalances,
  expenseCards,
  expenseItems,
  goals,
  incomeEntries,
  months,
  organizationMembers,
  organizations,
  users,
} from "../drizzle/schema";

type Snapshot = {
  users?: Array<Record<string, any>>;
  organizations?: Array<Record<string, any>>;
  organizationMembers?: Array<Record<string, any>>;
  months?: Array<Record<string, any>>;
  cards?: Array<Record<string, any>>;
  items?: Array<Record<string, any>>;
  income?: Array<Record<string, any>>;
  balances?: Array<Record<string, any>>;
  goals?: Array<Record<string, any>>;
};

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL precisa estar configurado para importar os dados.");
}

const args = new Set(process.argv.slice(2));
const replaceExisting = args.has("--replace");
const snapshotFile = path.resolve(process.cwd(), "data", "local-data.json");

if (!fs.existsSync(snapshotFile)) {
  throw new Error(`Arquivo não encontrado: ${snapshotFile}`);
}

const snapshot = JSON.parse(fs.readFileSync(snapshotFile, "utf8")) as Snapshot;
const db = drizzle(databaseUrl);

function asDate(value: unknown) {
  if (!value) return new Date();
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function money(value: unknown) {
  if (value === null || value === undefined || value === "") return "0.00";
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : String(value);
}

async function clearImportedData() {
  await db.delete(expenseItems);
  await db.delete(expenseCards);
  await db.delete(incomeEntries);
  await db.delete(bankBalances);
  await db.delete(goals);
  await db.delete(months);
  await db.delete(organizationMembers);
  await db.delete(organizations);
  await db.delete(users);
}

if (replaceExisting) {
  await clearImportedData();
}

for (const user of snapshot.users ?? []) {
  await db.insert(users).values({
    id: user.id,
    openId: user.openId,
    username: user.username ?? null,
    passwordHash: user.passwordHash ?? null,
    active: user.active ?? 1,
    name: user.name ?? null,
    email: user.email ?? null,
    loginMethod: user.loginMethod ?? null,
    role: user.role ?? "user",
    createdAt: asDate(user.createdAt),
    updatedAt: asDate(user.updatedAt),
    lastSignedIn: asDate(user.lastSignedIn),
  }).onDuplicateKeyUpdate({
    set: {
      username: user.username ?? null,
      passwordHash: user.passwordHash ?? null,
      active: user.active ?? 1,
      name: user.name ?? null,
      email: user.email ?? null,
      loginMethod: user.loginMethod ?? null,
      role: user.role ?? "user",
      updatedAt: asDate(user.updatedAt),
      lastSignedIn: asDate(user.lastSignedIn),
    },
  });
}

for (const organization of snapshot.organizations ?? []) {
  await db.insert(organizations).values({
    id: organization.id,
    name: organization.name,
    ownerUserId: organization.ownerUserId,
    createdAt: asDate(organization.createdAt),
  }).onDuplicateKeyUpdate({
    set: {
      name: organization.name,
      ownerUserId: organization.ownerUserId,
    },
  });
}

for (const member of snapshot.organizationMembers ?? []) {
  await db.insert(organizationMembers).values({
    id: member.id,
    organizationId: member.organizationId,
    userId: member.userId,
    role: member.role ?? "viewer",
    createdAt: asDate(member.createdAt),
  }).onDuplicateKeyUpdate({
    set: {
      organizationId: member.organizationId,
      userId: member.userId,
      role: member.role ?? "viewer",
    },
  });
}

for (const month of snapshot.months ?? []) {
  await db.insert(months).values({
    id: month.id,
    userId: month.userId,
    organizationId: month.organizationId,
    label: month.label,
    createdAt: asDate(month.createdAt),
  }).onDuplicateKeyUpdate({
    set: {
      userId: month.userId,
      organizationId: month.organizationId,
      label: month.label,
    },
  });
}

for (const card of snapshot.cards ?? []) {
  await db.insert(expenseCards).values({
    id: card.id,
    monthId: card.monthId,
    name: card.name,
    icon: card.icon ?? "📋",
    sortOrder: card.sortOrder ?? 0,
  }).onDuplicateKeyUpdate({
    set: {
      monthId: card.monthId,
      name: card.name,
      icon: card.icon ?? "📋",
      sortOrder: card.sortOrder ?? 0,
    },
  });
}

for (const item of snapshot.items ?? []) {
  await db.insert(expenseItems).values({
    id: item.id,
    cardId: item.cardId,
    name: item.name,
    dueDate: item.dueDate ?? "",
    value: money(item.value),
    paidValue: money(item.paidValue),
    paidAccountName: item.paidAccountName ?? null,
    status: item.status ?? "pendente",
    sortOrder: item.sortOrder ?? 0,
  }).onDuplicateKeyUpdate({
    set: {
      cardId: item.cardId,
      name: item.name,
      dueDate: item.dueDate ?? "",
      value: money(item.value),
      paidValue: money(item.paidValue),
      paidAccountName: item.paidAccountName ?? null,
      status: item.status ?? "pendente",
      sortOrder: item.sortOrder ?? 0,
    },
  });
}

for (const entry of snapshot.income ?? []) {
  await db.insert(incomeEntries).values({
    id: entry.id,
    monthId: entry.monthId,
    name: entry.name,
    value: money(entry.value),
    received: entry.received ?? 0,
    receivedAccountName: entry.receivedAccountName ?? null,
    sortOrder: entry.sortOrder ?? 0,
  }).onDuplicateKeyUpdate({
    set: {
      monthId: entry.monthId,
      name: entry.name,
      value: money(entry.value),
      received: entry.received ?? 0,
      receivedAccountName: entry.receivedAccountName ?? null,
      sortOrder: entry.sortOrder ?? 0,
    },
  });
}

for (const balance of snapshot.balances ?? []) {
  await db.insert(bankBalances).values({
    id: balance.id,
    monthId: balance.monthId,
    accountName: balance.accountName,
    balance: money(balance.balance),
    sortOrder: balance.sortOrder ?? 0,
  }).onDuplicateKeyUpdate({
    set: {
      monthId: balance.monthId,
      accountName: balance.accountName,
      balance: money(balance.balance),
      sortOrder: balance.sortOrder ?? 0,
    },
  });
}

for (const goal of snapshot.goals ?? []) {
  await db.insert(goals).values({
    id: goal.id,
    organizationId: goal.organizationId,
    name: goal.name,
    term: goal.term ?? "medium",
    targetValue: money(goal.targetValue),
    savedValue: money(goal.savedValue),
    sortOrder: goal.sortOrder ?? 0,
  }).onDuplicateKeyUpdate({
    set: {
      organizationId: goal.organizationId,
      name: goal.name,
      term: goal.term ?? "medium",
      targetValue: money(goal.targetValue),
      savedValue: money(goal.savedValue),
      sortOrder: goal.sortOrder ?? 0,
    },
  });
}

const [userRows] = await db.select().from(users);
const [orgRows] = await db.select().from(organizations);
const [monthRows] = await db.select().from(months);

console.log("Importação concluída.");
console.log(`Usuários no banco: ${userRows ? "ok" : "0"}`);
console.log(`Organizações importadas: ${(snapshot.organizations ?? []).length}; meses importados: ${(snapshot.months ?? []).length}.`);
console.log(`Use ${replaceExisting ? "sem" : "com"} --replace se precisar refazer a carga ${replaceExisting ? "incrementalmente" : "limpando o banco antes"}.`);
