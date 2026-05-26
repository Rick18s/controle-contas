import { eq, and, asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import fs from "fs";
import path from "path";
import { ExpenseItem, ExpenseItemSnapshot, InsertUser, PasswordResetToken, User, users, passwordResetTokens, organizations, organizationMembers, months, expenseCards, expenseItems, expenseItemSnapshots, incomeEntries, bankBalances, bankTransactions, goals } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

function normalizeIncomeEntry<T extends { value: string; received: number; receivedValue?: string | null }>(entry: T): T & { receivedValue: string } {
  const receivedValue = entry.receivedValue ?? "0.00";
  return {
    ...entry,
    receivedValue: entry.received === 1 && Number.parseFloat(receivedValue) <= 0 ? entry.value : receivedValue,
  };
}

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const sql = neon(process.env.DATABASE_URL);
      _db = drizzle(sql);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  if (!_db) ensureMemoryLoaded();
  return _db;
}


export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    const existing = memoryUsers.find(existingUser => existingUser.openId === user.openId);
    if (existing) {
      const updates: Partial<User> = {};
      if (user.name !== undefined) updates.name = user.name;
      if (user.email !== undefined) updates.email = user.email;
      if (user.loginMethod !== undefined) updates.loginMethod = user.loginMethod;
      if (user.role !== undefined) updates.role = user.role;
      if (user.lastSignedIn !== undefined) updates.lastSignedIn = user.lastSignedIn;
      Object.assign(existing, updates);
      persistMemoryData();
    }
    return;
  }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onConflictDoUpdate({ target: users.openId, set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return memoryUsers.find(user => user.openId === openId);
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByUsername(username: string) {
  const normalized = username.trim().toLowerCase();
  const db = await getDb();
  if (!db) return memoryUsers.find(user => user.username?.toLowerCase() === normalized);
  const result = await db.select().from(users).where(eq(users.username, normalized)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  const db = await getDb();
  if (!db) return memoryUsers.find(user => user.email?.toLowerCase() === normalized);
  const result = await db.select().from(users).where(eq(users.email, normalized)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(userId: number) {
  const db = await getDb();
  if (!db) return memoryUsers.find(user => user.id === userId);
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result[0];
}

export async function createPasswordUser(data: { username: string; name: string; email?: string | null; passwordHash: string; role?: "user" | "admin"; active?: number; createDefaultOrganization?: boolean }) {
  const username = data.username.trim().toLowerCase();
  const openId = `password:${username}`;
  const now = new Date();
  const shouldCreateDefaultOrganization = data.createDefaultOrganization ?? true;
  const db = await getDb();
  if (!db) {
    const existing = memoryUsers.find(user => user.username === username || user.openId === openId);
    if (existing) throw new Error("Usuário já existe");
    const user: User = {
      id: memoryNextId++,
      openId,
      username,
      passwordHash: data.passwordHash,
      active: data.active ?? 1,
      name: data.name,
      email: data.email ?? null,
      loginMethod: "password",
      role: data.role ?? "user",
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    };
    memoryUsers.push(user);
    if (shouldCreateDefaultOrganization) {
      await ensureDefaultOrganizationForUser(user.id, user.name || username);
    }
    persistMemoryData();
    return user;
  }

  await db.insert(users).values({
    openId,
    username,
    passwordHash: data.passwordHash,
    active: data.active ?? 1,
    name: data.name,
    email: data.email ?? null,
    loginMethod: "password",
    role: data.role ?? "user",
    lastSignedIn: now,
  });
  const user = await getUserByOpenId(openId);
  if (!user) throw new Error("Não foi possível criar usuário");
  if (shouldCreateDefaultOrganization) {
    await ensureDefaultOrganizationForUser(user.id, user.name || username);
  }
  return user;
}

export async function updateUserPassword(userId: number, passwordHash: string) {
  const db = await getDb();
  if (!db) {
    const user = memoryUsers.find(existing => existing.id === userId);
    if (user) user.passwordHash = passwordHash;
    persistMemoryData();
    return;
  }
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

export async function createPasswordResetToken(userId: number, tokenHash: string, expiresAt: Date) {
  const db = await getDb();
  if (!db) {
    memoryPasswordResetTokens.push({
      id: memoryNextId++,
      userId,
      tokenHash,
      expiresAt,
      usedAt: null,
      createdAt: new Date(),
    });
    persistMemoryData();
    return;
  }
  await db.insert(passwordResetTokens).values({ userId, tokenHash, expiresAt });
}

export async function getValidPasswordResetToken(tokenHash: string) {
  const now = new Date();
  const db = await getDb();
  if (!db) {
    return memoryPasswordResetTokens.find(token => token.tokenHash === tokenHash && !token.usedAt && token.expiresAt > now);
  }
  const result = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.tokenHash, tokenHash)).limit(1);
  const token = result[0];
  if (!token || token.usedAt || token.expiresAt <= now) return undefined;
  return token;
}

export async function markPasswordResetTokenUsed(tokenId: number) {
  const db = await getDb();
  if (!db) {
    const token = memoryPasswordResetTokens.find(existing => existing.id === tokenId);
    if (token) token.usedAt = new Date();
    persistMemoryData();
    return;
  }
  await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, tokenId));
}

export async function updateUserStatus(userId: number, active: number) {
  const db = await getDb();
  if (!db) {
    const user = memoryUsers.find(existing => existing.id === userId);
    if (user) user.active = active;
    persistMemoryData();
    return;
  }
  await db.update(users).set({ active }).where(eq(users.id, userId));
}

export async function listPasswordUsers() {
  const db = await getDb();
  if (!db) return [...memoryUsers].sort((a, b) => a.id - b.id);
  return db.select().from(users).orderBy(asc(users.id));
}


type SeedItem = {
  name: string;
  dueDate?: string;
  value: string;
  paidValue?: string;
  status?: "pago" | "parcial" | "pendente";
};

const MAY_2026_SEED_CARDS: { name: string; icon: string; items: SeedItem[] }[] = [
  {
    name: "Casa",
    icon: "🏠",
    items: [
      { name: "Aluguel Casa", value: "700.00", paidValue: "700.00", status: "pago" },
      { name: "[P2] Feira", value: "1500.00" },
      { name: "[P2] Parcela Casa", value: "1100.00" },
      { name: "[P2] Combustível", value: "1000.00" },
      { name: "[P2] Ajuda de Custo Mãe", value: "1000.00" },
      { name: "[P2] Energia Casa", value: "226.92" },
      { name: "[P2] Condomínio", value: "222.70" },
      { name: "[P2] Internet Casa", value: "100.00" },
      { name: "[P4] Carro", value: "4646.48" },
      { name: "[P4] Dízimo", value: "2500.00", paidValue: "82.00", status: "parcial" },
      { name: "[P4] Faxina", value: "300.00", paidValue: "150.00", status: "parcial" },
    ],
  },
  {
    name: "Cartões",
    icon: "💳",
    items: [
      { name: "Itaú Pedro", value: "900.05", paidValue: "900.05", status: "pago" },
      { name: "Itaú Débora", value: "938.28", paidValue: "938.28", status: "pago" },
      { name: "[P3] PicPay Pedro", value: "3674.90" },
      { name: "[P3] Nubank Pedro", value: "1858.97" },
      { name: "[P3] Caixa Débora", value: "1291.41" },
      { name: "[P3] PicPay Débora c/ IPTU", value: "1269.16" },
      { name: "[P3] Inter Débora", value: "926.57" },
      { name: "[P3] Inter Pedro", value: "642.01" },
      { name: "[P3] Sofisa Pedro", value: "537.87" },
      { name: "[P3] C6 Pedro", value: "192.32" },
      { name: "[P3] Sofisa Débora", value: "165.08" },
      { name: "[P3] XP Pedro", value: "105.68" },
      { name: "[P3] Sam's Pedro", value: "95.89" },
    ],
  },
  {
    name: "Pessoal",
    icon: "✨",
    items: [
      { name: "Programação", value: "80.00", paidValue: "80.00", status: "pago" },
      { name: "Celular Mainha", value: "72.00", paidValue: "72.00", status: "pago" },
      { name: "Raquel", value: "46.70", paidValue: "46.70", status: "pago" },
      { name: "Canecas", value: "30.00", paidValue: "30.00", status: "pago" },
      { name: "[P4] Cabelo Pedro", value: "140.00", paidValue: "70.00", status: "parcial" },
      { name: "[P4] Cabelo Débora", value: "120.00" },
    ],
  },
];

const MAY_2026_SEED_INCOME: { name: string; value: string; received?: number }[] = [
  { name: "Distribuição de lucro recebida", value: "1230.00", received: 1 },
  { name: "Distribuição de lucro restante", value: "23770.00" },
];

const STARTER_CARDS: { name: string; icon: string; items: SeedItem[] }[] = [
  {
    name: "Casa",
    icon: "🏠",
    items: [
      { name: "Aluguel", value: "0.00" },
      { name: "Energia", value: "0.00" },
      { name: "Internet", value: "0.00" },
      { name: "Mercado", value: "0.00" },
    ],
  },
  {
    name: "Cartões",
    icon: "💳",
    items: [
      { name: "Cartão principal", value: "0.00" },
      { name: "Outro cartão", value: "0.00" },
    ],
  },
  {
    name: "Trabalho / Empresa",
    icon: "🏢",
    items: [
      { name: "Ferramentas", value: "0.00" },
      { name: "Impostos", value: "0.00" },
    ],
  },
  {
    name: "Pessoal",
    icon: "✨",
    items: [
      { name: "Cuidados pessoais", value: "0.00" },
      { name: "Lazer", value: "0.00" },
    ],
  },
  {
    name: "Outros",
    icon: "📦",
    items: [
      { name: "Despesa extra", value: "0.00" },
    ],
  },
];

type MemoryOrganization = { id: number; name: string; ownerUserId: number; createdAt: Date };
type MemoryOrganizationMember = { id: number; organizationId: number; userId: number; role: "admin" | "finance" | "viewer"; createdAt: Date };
type MemoryMonth = { id: number; userId: number; organizationId: number; label: string; createdAt?: Date };
type MemoryCard = { id: number; monthId: number; name: string; icon: string | null; sortOrder: number | null };
type MemoryItem = {
  id: number;
  cardId: number;
  name: string;
  dueDate: string | null;
  value: string;
  paidValue: string;
  paidAccountName?: string | null;
  paymentMode: "bank" | "card" | "budget";
  status: "pago" | "parcial" | "pendente";
  sortOrder: number | null;
};
type MemoryIncome = { id: number; monthId: number; name: string; value: string; receivedValue: string; received: number; receivedAccountName?: string | null; sortOrder: number | null };
type MemoryBalance = { id: number; monthId: number; accountName: string; balance: string; sortOrder: number | null };
type MemoryBankTransaction = {
  id: number;
  monthId: number;
  userId?: number | null;
  accountName: string;
  description: string;
  movementType: "income" | "expense" | "adjustment";
  amount: string;
  balanceAfter: string;
  sourceType?: string | null;
  sourceId?: number | null;
  fingerprint?: string | null;
  createdAt: Date;
};
type MemoryGoal = { id: number; organizationId: number; name: string; term: "short" | "medium" | "long"; targetValue: string; savedValue: string; sortOrder: number | null };
type MemoryPasswordResetToken = PasswordResetToken;
type MemoryExpenseItemSnapshot = ExpenseItemSnapshot;

let memoryNextId = 1;
const memoryMonths: MemoryMonth[] = [];
const memoryCards: MemoryCard[] = [];
const memoryItems: MemoryItem[] = [];
const memoryIncome: MemoryIncome[] = [];
const memoryBalances: MemoryBalance[] = [];
const memoryBankTransactions: MemoryBankTransaction[] = [];
const memoryUsers: User[] = [];
const memoryPasswordResetTokens: MemoryPasswordResetToken[] = [];
const memoryOrganizations: MemoryOrganization[] = [];
const memoryOrganizationMembers: MemoryOrganizationMember[] = [];
const memoryGoals: MemoryGoal[] = [];
const memoryExpenseItemSnapshots: MemoryExpenseItemSnapshot[] = [];

type MemorySnapshot = {
  memoryNextId?: number;
  users?: User[];
  passwordResetTokens?: MemoryPasswordResetToken[];
  organizations?: MemoryOrganization[];
  organizationMembers?: MemoryOrganizationMember[];
  months?: MemoryMonth[];
  cards?: MemoryCard[];
  items?: MemoryItem[];
  income?: MemoryIncome[];
  balances?: MemoryBalance[];
  bankTransactions?: MemoryBankTransaction[];
  goals?: MemoryGoal[];
  expenseItemSnapshots?: MemoryExpenseItemSnapshot[];
};

const isTestRuntime = process.env.VITEST === "true" || process.env.NODE_ENV === "test";
const memoryDataFile = path.resolve(process.cwd(), "data", "local-data.json");
let memoryLoaded = false;

function toDate(value: unknown) {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function replaceMemory<T>(target: T[], values: T[] | undefined) {
  target.splice(0, target.length, ...(values ?? []));
}

function normalizePaymentMode(value: string | null | undefined): "bank" | "card" | "budget" {
  return value === "card" || value === "budget" ? value : "bank";
}

function ensureMemoryLoaded() {
  if (memoryLoaded) return;
  memoryLoaded = true;
  if (isTestRuntime) return;
  if (!fs.existsSync(memoryDataFile)) return;

  try {
    const snapshot = JSON.parse(fs.readFileSync(memoryDataFile, "utf8")) as MemorySnapshot;
    memoryNextId = snapshot.memoryNextId ?? memoryNextId;
    replaceMemory(memoryUsers, (snapshot.users ?? []).map(user => ({
      ...user,
      createdAt: toDate(user.createdAt),
      updatedAt: toDate(user.updatedAt),
      lastSignedIn: user.lastSignedIn ? toDate(user.lastSignedIn) : null,
    })));
    replaceMemory(memoryPasswordResetTokens, (snapshot.passwordResetTokens ?? []).map(token => ({
      ...token,
      expiresAt: toDate(token.expiresAt),
      usedAt: token.usedAt ? toDate(token.usedAt) : null,
      createdAt: toDate(token.createdAt),
    })));
    replaceMemory(memoryOrganizations, (snapshot.organizations ?? []).map(org => ({ ...org, createdAt: toDate(org.createdAt) })));
    replaceMemory(memoryOrganizationMembers, (snapshot.organizationMembers ?? []).map(member => ({ ...member, createdAt: toDate(member.createdAt) })));
    replaceMemory(memoryMonths, (snapshot.months ?? []).map(month => ({ ...month, createdAt: month.createdAt ? toDate(month.createdAt) : undefined })));
    replaceMemory(memoryCards, snapshot.cards);
    replaceMemory(memoryItems, (snapshot.items ?? []).map(item => ({
      ...item,
      paymentMode: normalizePaymentMode(item.paymentMode),
    })));
    replaceMemory(memoryIncome, (snapshot.income ?? []).map(entry => ({
      ...entry,
      receivedValue: entry.received === 1 ? entry.value : "0.00",
    })));
    replaceMemory(memoryBalances, snapshot.balances);
    replaceMemory(memoryBankTransactions, (snapshot.bankTransactions ?? []).map(transaction => ({
      ...transaction,
      createdAt: toDate(transaction.createdAt),
    })));
    replaceMemory(memoryGoals, snapshot.goals);
    replaceMemory(memoryExpenseItemSnapshots, (snapshot.expenseItemSnapshots ?? []).map(snapshotEntry => ({
      ...snapshotEntry,
      createdAt: toDate(snapshotEntry.createdAt),
    })));
  } catch (error) {
    console.error("[Database] Failed to load local data snapshot:", error);
  }
}

function persistMemoryData() {
  ensureMemoryLoaded();
  if (isTestRuntime) return;
  const snapshot: MemorySnapshot = {
    memoryNextId,
    users: memoryUsers,
    passwordResetTokens: memoryPasswordResetTokens,
    organizations: memoryOrganizations,
    organizationMembers: memoryOrganizationMembers,
    months: memoryMonths,
    cards: memoryCards,
    items: memoryItems,
    income: memoryIncome,
    balances: memoryBalances,
    bankTransactions: memoryBankTransactions,
    goals: memoryGoals,
    expenseItemSnapshots: memoryExpenseItemSnapshots,
  };
  fs.mkdirSync(path.dirname(memoryDataFile), { recursive: true });
  const tempFile = `${memoryDataFile}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(snapshot, null, 2));
  fs.renameSync(tempFile, memoryDataFile);
}

export function persistMemoryNow() {
  persistMemoryData();
}

export async function ensureDefaultOrganizationForUser(userId: number, displayName: string) {
  const db = await getDb();
  if (!db) {
    const existingMembership = memoryOrganizationMembers.find(member => member.userId === userId);
    if (existingMembership) return memoryOrganizations.find(org => org.id === existingMembership.organizationId)!;
    const org = {
      id: memoryNextId++,
      name: displayName ? `${displayName} - Contas` : "Centro de Contas",
      ownerUserId: userId,
      createdAt: new Date(),
    };
    memoryOrganizations.push(org);
    memoryOrganizationMembers.push({ id: memoryNextId++, organizationId: org.id, userId, role: "admin", createdAt: new Date() });
    persistMemoryData();
    return org;
  }

  const membership = await db.select().from(organizationMembers).where(eq(organizationMembers.userId, userId)).limit(1);
  if (membership.length > 0) {
    const result = await db.select().from(organizations).where(eq(organizations.id, membership[0].organizationId)).limit(1);
    if (result.length > 0) return result[0];
  }
  const result = await db.insert(organizations).values({
    name: displayName ? `${displayName} - Contas` : "Centro de Contas",
    ownerUserId: userId,
  }).returning({ id: organizations.id });
  const organizationId = result[0].id;
  await db.insert(organizationMembers).values({ organizationId, userId, role: "admin" });
  const created = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  return created[0];
}

export async function getOrganizationsForUser(userId: number) {
  const db = await getDb();
  if (!db) {
    const memberOrgIds = memoryOrganizationMembers.filter(member => member.userId === userId).map(member => member.organizationId);
    return memoryOrganizations.filter(org => memberOrgIds.includes(org.id)).sort((a, b) => a.id - b.id);
  }
  const memberships = await db.select().from(organizationMembers).where(eq(organizationMembers.userId, userId));
  const orgs = [];
  for (const membership of memberships) {
    const result = await db.select().from(organizations).where(eq(organizations.id, membership.organizationId)).limit(1);
    if (result[0]) orgs.push(result[0]);
  }
  return orgs;
}

export async function createOrganization(ownerUserId: number, name: string) {
  const db = await getDb();
  if (!db) {
    const org = { id: memoryNextId++, name, ownerUserId, createdAt: new Date() };
    memoryOrganizations.push(org);
    memoryOrganizationMembers.push({ id: memoryNextId++, organizationId: org.id, userId: ownerUserId, role: "admin", createdAt: new Date() });
    persistMemoryData();
    return org;
  }
  const result = await db.insert(organizations).values({ name, ownerUserId }).returning({ id: organizations.id });
  const organizationId = result[0].id;
  await db.insert(organizationMembers).values({ organizationId, userId: ownerUserId, role: "admin" });
  const created = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  return created[0];
}

export async function addUserToOrganization(userId: number, organizationId: number, role: "admin" | "finance" | "viewer" = "viewer") {
  const db = await getDb();
  if (!db) {
    const existing = memoryOrganizationMembers.find(member => member.userId === userId && member.organizationId === organizationId);
    if (existing) {
      existing.role = role;
    } else {
      memoryOrganizationMembers.push({ id: memoryNextId++, organizationId, userId, role, createdAt: new Date() });
    }
    persistMemoryData();
    return;
  }
  const existing = await db.select().from(organizationMembers).where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.organizationId, organizationId))).limit(1);
  if (existing.length === 0) await db.insert(organizationMembers).values({ userId, organizationId, role });
  else await db.update(organizationMembers).set({ role }).where(eq(organizationMembers.id, existing[0].id));
}

export async function getOrganizationMembership(userId: number, organizationId: number) {
  const db = await getDb();
  if (!db) {
    return memoryOrganizationMembers.find(member => member.userId === userId && member.organizationId === organizationId);
  }
  const result = await db.select().from(organizationMembers)
    .where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.organizationId, organizationId)))
    .limit(1);
  return result[0];
}

export async function listOrganizationMembers(organizationId: number) {
  const db = await getDb();
  if (!db) {
    return memoryOrganizationMembers
      .filter(member => member.organizationId === organizationId)
      .map(member => {
        const user = memoryUsers.find(existingUser => existingUser.id === member.userId);
        return user ? { ...user, membershipId: member.id, membershipRole: member.role, organizationId: member.organizationId } : null;
      })
      .filter((member): member is User & { membershipId: number; membershipRole: "admin" | "finance" | "viewer"; organizationId: number } => Boolean(member));
  }

  const memberships = await db.select().from(organizationMembers).where(eq(organizationMembers.organizationId, organizationId));
  const result = [];
  for (const membership of memberships) {
    const user = await getUserById(membership.userId);
    if (user) {
      result.push({ ...user, membershipId: membership.id, membershipRole: membership.role, organizationId: membership.organizationId });
    }
  }
  return result;
}

export async function updateOrganizationMemberRole(organizationId: number, userId: number, role: "admin" | "finance" | "viewer") {
  const db = await getDb();
  if (!db) {
    const membership = memoryOrganizationMembers.find(member => member.organizationId === organizationId && member.userId === userId);
    if (membership) membership.role = role;
    persistMemoryData();
    return;
  }
  await db.update(organizationMembers)
    .set({ role })
    .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId)));
}

export async function removeUserFromOrganization(organizationId: number, userId: number) {
  const db = await getDb();
  if (!db) {
    const index = memoryOrganizationMembers.findIndex(member => member.organizationId === organizationId && member.userId === userId);
    if (index >= 0) memoryOrganizationMembers.splice(index, 1);
    persistMemoryData();
    return;
  }
  await db.delete(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId)));
}

export async function getActiveOrganizationForUser(userId: number, requestedOrganizationId?: number | null) {
  const organizations = await getOrganizationsForUser(userId);
  if (requestedOrganizationId) {
    const selected = organizations.find(org => org.id === requestedOrganizationId);
    if (selected) return selected;
  }
  if (organizations[0]) return organizations[0];
  return ensureDefaultOrganizationForUser(userId, "Centro de Contas");
}

export async function getDefaultOrganizationForUser(userId: number) {
  const existing = await getOrganizationsForUser(userId);
  if (existing[0]) return existing[0];
  const user = memoryUsers.find(existingUser => existingUser.id === userId);
  return ensureDefaultOrganizationForUser(userId, user?.name || "Centro de Contas");
}

function createMemoryMonth(userId: number, label: string, organizationId = userId) {
  const month = { id: memoryNextId++, userId, organizationId, label, createdAt: new Date() };
  memoryMonths.push(month);
  persistMemoryData();
  return month;
}

function ensureMemorySeed(userId: number, organizationId: number) {
  const existing = memoryMonths.find(month => month.organizationId === organizationId && month.label === "2026-05");
  if (existing) return existing;

  const month = createMemoryMonth(userId, "2026-05", organizationId);
  const accounts = [
    "Conta Pessoal — Pedro",
    "Conta Pessoal — Débora",
  ];
  accounts.forEach((accountName, sortOrder) => {
    const balance = accountName.includes("Pedro") ? "3.90" : "0.00";
    memoryBalances.push({ id: memoryNextId++, monthId: month.id, accountName, balance, sortOrder });
  });

  MAY_2026_SEED_CARDS.forEach((card, sortOrder) => {
    const memoryCard = { id: memoryNextId++, monthId: month.id, name: card.name, icon: card.icon, sortOrder };
    memoryCards.push(memoryCard);
    card.items.forEach((item, itemSortOrder) => {
      memoryItems.push({
        id: memoryNextId++,
        cardId: memoryCard.id,
        name: item.name,
        dueDate: item.dueDate ?? "",
        value: item.value,
        paidValue: item.paidValue ?? "0.00",
        paidAccountName: null,
        paymentMode: "bank",
        status: item.status ?? "pendente",
        sortOrder: itemSortOrder,
      });
    });
  });

  MAY_2026_SEED_INCOME.forEach((entry, sortOrder) => {
    memoryIncome.push({
      id: memoryNextId++,
      monthId: month.id,
      name: entry.name,
      value: entry.value,
      receivedValue: entry.received === 1 ? entry.value : "0.00",
      received: entry.received ?? 0,
      sortOrder,
    });
  });

  persistMemoryData();
  return month;
}

// ============ MONTHS ============

export async function getMonthsByOrganization(userId: number, organizationId: number) {
  const db = await getDb();
  if (!db) {
    return memoryMonths.filter(month => month.organizationId === organizationId).sort((a, b) => a.label.localeCompare(b.label));
  }
  const userMonths = await db.select().from(months).where(eq(months.organizationId, organizationId)).orderBy(asc(months.label));
  return userMonths;
}

export async function getMonthsByUser(userId: number) {
  const org = await getDefaultOrganizationForUser(userId);
  return getMonthsByOrganization(userId, org.id);
}

export async function createMonth(userId: number, label: string, organizationId?: number) {
  const orgId = organizationId ?? (await getDefaultOrganizationForUser(userId)).id;
  const db = await getDb();
  if (!db) return createMemoryMonth(userId, label, orgId);
  const result = await db.insert(months).values({ userId, organizationId: orgId, label }).returning({ id: months.id });
  return { id: result[0].id, userId, organizationId: orgId, label };
}

export async function getMonthById(monthId: number) {
  const db = await getDb();
  if (!db) return memoryMonths.find(month => month.id === monthId);
  const result = await db.select().from(months).where(eq(months.id, monthId)).limit(1);
  return result[0];
}

export async function deleteMonth(monthId: number) {
  const db = await getDb();
  if (!db) {
    const cardIds = memoryCards.filter(card => card.monthId === monthId).map(card => card.id);
    for (const cardId of cardIds) {
      const itemIndexes = memoryItems.map((item, index) => item.cardId === cardId ? index : -1).filter(index => index >= 0).reverse();
      itemIndexes.forEach(index => memoryItems.splice(index, 1));
    }
    [memoryCards, memoryIncome, memoryBalances, memoryBankTransactions, memoryMonths].forEach(collection => {
      const indexes = collection.map((entry, index) => "monthId" in entry ? entry.monthId === monthId ? index : -1 : entry.id === monthId ? index : -1).filter(index => index >= 0).reverse();
      indexes.forEach(index => collection.splice(index, 1));
    });
    persistMemoryData();
    return;
  }
  // Delete all related data
  const cards = await db.select().from(expenseCards).where(eq(expenseCards.monthId, monthId));
  for (const card of cards) {
    await db.delete(expenseItems).where(eq(expenseItems.cardId, card.id));
  }
  await db.delete(expenseCards).where(eq(expenseCards.monthId, monthId));
  await db.delete(incomeEntries).where(eq(incomeEntries.monthId, monthId));
  await db.delete(bankBalances).where(eq(bankBalances.monthId, monthId));
  await db.delete(bankTransactions).where(eq(bankTransactions.monthId, monthId));
  await db.delete(months).where(eq(months.id, monthId));
}

async function deleteMonthCollections(monthIds: number[]) {
  const uniqueMonthIds = Array.from(new Set(monthIds));
  for (const monthId of uniqueMonthIds) await deleteMonth(monthId);
}

export async function deleteUserAccount(userId: number) {
  const db = await getDb();
  if (!db) {
    const ownedOrganizationIds = memoryOrganizations.filter(org => org.ownerUserId === userId).map(org => org.id);
    const monthIds = memoryMonths
      .filter(month => month.userId === userId || ownedOrganizationIds.includes(month.organizationId))
      .map(month => month.id);

    await deleteMonthCollections(monthIds);

    for (let index = memoryGoals.length - 1; index >= 0; index -= 1) {
      if (ownedOrganizationIds.includes(memoryGoals[index].organizationId)) memoryGoals.splice(index, 1);
    }
    for (let index = memoryOrganizationMembers.length - 1; index >= 0; index -= 1) {
      const member = memoryOrganizationMembers[index];
      if (member.userId === userId || ownedOrganizationIds.includes(member.organizationId)) memoryOrganizationMembers.splice(index, 1);
    }
    for (let index = memoryOrganizations.length - 1; index >= 0; index -= 1) {
      if (ownedOrganizationIds.includes(memoryOrganizations[index].id)) memoryOrganizations.splice(index, 1);
    }
    for (let index = memoryPasswordResetTokens.length - 1; index >= 0; index -= 1) {
      if (memoryPasswordResetTokens[index].userId === userId) memoryPasswordResetTokens.splice(index, 1);
    }
    const userIndex = memoryUsers.findIndex(user => user.id === userId);
    if (userIndex >= 0) memoryUsers.splice(userIndex, 1);
    persistMemoryData();
    return;
  }

  const ownedOrganizations = await db.select().from(organizations).where(eq(organizations.ownerUserId, userId));
  const ownedOrganizationIds = ownedOrganizations.map(org => org.id);
  const monthRows = await db.select().from(months);
  const monthIds = monthRows
    .filter(month => month.userId === userId || ownedOrganizationIds.includes(month.organizationId))
    .map(month => month.id);

  await deleteMonthCollections(monthIds);

  for (const organizationId of ownedOrganizationIds) {
    await db.delete(goals).where(eq(goals.organizationId, organizationId));
    await db.delete(organizationMembers).where(eq(organizationMembers.organizationId, organizationId));
    await db.delete(organizations).where(eq(organizations.id, organizationId));
  }
  await db.delete(organizationMembers).where(eq(organizationMembers.userId, userId));
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}

// ============ EXPENSE CARDS ============

export async function getCardsByMonth(monthId: number) {
  const db = await getDb();
  if (!db) return memoryCards.filter(card => card.monthId === monthId).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return db.select().from(expenseCards).where(eq(expenseCards.monthId, monthId)).orderBy(asc(expenseCards.sortOrder));
}

export async function getCardById(cardId: number) {
  const db = await getDb();
  if (!db) return memoryCards.find(card => card.id === cardId);
  const result = await db.select().from(expenseCards).where(eq(expenseCards.id, cardId)).limit(1);
  return result[0];
}

export async function createCard(monthId: number, name: string, icon: string = "📋") {
  const db = await getDb();
  if (!db) {
    const card = { id: memoryNextId++, monthId, name, icon, sortOrder: memoryCards.filter(existing => existing.monthId === monthId).length };
    memoryCards.push(card);
    persistMemoryData();
    return card;
  }
  const result = await db.insert(expenseCards).values({ monthId, name, icon }).returning({ id: expenseCards.id });
  return { id: result[0].id, monthId, name, icon };
}

export async function updateCard(cardId: number, data: { name?: string; icon?: string }) {
  const db = await getDb();
  if (!db) {
    const card = memoryCards.find(existing => existing.id === cardId);
    if (card) Object.assign(card, data);
    persistMemoryData();
    return;
  }
  await db.update(expenseCards).set(data).where(eq(expenseCards.id, cardId));
}

export async function deleteCard(cardId: number) {
  const db = await getDb();
  if (!db) {
    for (let index = memoryItems.length - 1; index >= 0; index -= 1) {
      if (memoryItems[index].cardId === cardId) memoryItems.splice(index, 1);
    }
    const cardIndex = memoryCards.findIndex(card => card.id === cardId);
    if (cardIndex >= 0) memoryCards.splice(cardIndex, 1);
    persistMemoryData();
    return;
  }
  await db.delete(expenseItems).where(eq(expenseItems.cardId, cardId));
  await db.delete(expenseCards).where(eq(expenseCards.id, cardId));
}

// ============ EXPENSE ITEMS ============

export async function getItemsByCard(cardId: number) {
  const db = await getDb();
  if (!db) return memoryItems.filter(item => item.cardId === cardId).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return db.select().from(expenseItems).where(eq(expenseItems.cardId, cardId)).orderBy(asc(expenseItems.sortOrder));
}

export async function getItemById(itemId: number) {
  const db = await getDb();
  if (!db) return memoryItems.find(item => item.id === itemId);
  const result = await db.select().from(expenseItems).where(eq(expenseItems.id, itemId)).limit(1);
  return result[0];
}

export async function createItem(cardId: number, data: { name: string; dueDate?: string; value?: string; paidValue?: string; paidAccountName?: string | null; paymentMode?: "bank" | "card" | "budget"; status?: "pago" | "parcial" | "pendente" }) {
  const db = await getDb();
  if (!db) {
    const item = {
      id: memoryNextId++,
      cardId,
      name: data.name,
      dueDate: data.dueDate || "",
      value: data.value || "0.00",
      paidValue: data.paidValue || "0.00",
      paidAccountName: data.paidAccountName ?? null,
      paymentMode: data.paymentMode ?? "bank",
      status: data.status || "pendente",
      sortOrder: memoryItems.filter(existing => existing.cardId === cardId).length,
    };
    memoryItems.push(item);
    persistMemoryData();
    return { id: item.id };
  }
  const result = await db.insert(expenseItems).values({
    cardId,
    name: data.name,
    dueDate: data.dueDate || "",
    value: data.value || "0.00",
    paidValue: data.paidValue || "0.00",
    paidAccountName: data.paidAccountName ?? null,
    paymentMode: data.paymentMode ?? "bank",
    status: data.status || "pendente",
  }).returning({ id: expenseItems.id });
  return { id: result[0].id };
}

export async function updateItem(itemId: number, data: { name?: string; dueDate?: string; value?: string; paidValue?: string; paidAccountName?: string | null; paymentMode?: "bank" | "card" | "budget"; status?: "pago" | "parcial" | "pendente" }) {
  const db = await getDb();
  if (!db) {
    const item = memoryItems.find(existing => existing.id === itemId);
    if (item) Object.assign(item, data);
    persistMemoryData();
    return;
  }
  await db.update(expenseItems).set(data).where(eq(expenseItems.id, itemId));
}

export async function createExpenseItemSnapshot(item: ExpenseItem | MemoryItem, data: { monthId: number; userId?: number | null; reason?: string }) {
  const values = {
    itemId: item.id,
    cardId: item.cardId,
    monthId: data.monthId,
    userId: data.userId ?? null,
    name: item.name,
    dueDate: item.dueDate || "",
    value: item.value,
    paidValue: item.paidValue,
    paidAccountName: item.paidAccountName ?? null,
    paymentMode: normalizePaymentMode(item.paymentMode),
    status: item.status,
    reason: data.reason || "update",
  };
  const db = await getDb();
  if (!db) {
    const snapshot = { id: memoryNextId++, ...values, createdAt: new Date() };
    memoryExpenseItemSnapshots.push(snapshot);
    persistMemoryData();
    return { id: snapshot.id };
  }
  const result = await db.insert(expenseItemSnapshots).values(values).returning({ id: expenseItemSnapshots.id });
  return { id: result[0].id };
}

export async function getLatestExpenseItemSnapshot(itemId: number) {
  const db = await getDb();
  if (!db) {
    return memoryExpenseItemSnapshots
      .filter(snapshot => snapshot.itemId === itemId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id)[0];
  }
  const rows = await db.select()
    .from(expenseItemSnapshots)
    .where(eq(expenseItemSnapshots.itemId, itemId))
    .orderBy(asc(expenseItemSnapshots.id));
  return rows[rows.length - 1];
}

export async function deleteItem(itemId: number) {
  const db = await getDb();
  if (!db) {
    const index = memoryItems.findIndex(item => item.id === itemId);
    if (index >= 0) memoryItems.splice(index, 1);
    persistMemoryData();
    return;
  }
  await db.delete(expenseItems).where(eq(expenseItems.id, itemId));
}

// ============ INCOME ENTRIES ============

export async function getIncomeByMonth(monthId: number) {
  const db = await getDb();
  if (!db) return memoryIncome.filter(entry => entry.monthId === monthId).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const rows = await db.select().from(incomeEntries).where(eq(incomeEntries.monthId, monthId)).orderBy(asc(incomeEntries.sortOrder));
  return rows.map(normalizeIncomeEntry);
}

export async function getIncomeById(entryId: number) {
  const db = await getDb();
  if (!db) return memoryIncome.find(entry => entry.id === entryId);
  const result = await db.select().from(incomeEntries).where(eq(incomeEntries.id, entryId)).limit(1);
  return result[0] ? normalizeIncomeEntry(result[0]) : undefined;
}

export async function createIncome(monthId: number, data: { name: string; value?: string; receivedValue?: string; received?: number; receivedAccountName?: string | null }) {
  const value = data.value || "0.00";
  const receivedValue = data.receivedValue ?? (data.received === 1 ? value : "0.00");
  const db = await getDb();
  if (!db) {
    const entry = {
      id: memoryNextId++,
      monthId,
      name: data.name,
      value,
      receivedValue,
      received: data.received || 0,
      receivedAccountName: data.receivedAccountName ?? null,
      sortOrder: memoryIncome.filter(existing => existing.monthId === monthId).length,
    };
    memoryIncome.push(entry);
    persistMemoryData();
    return { id: entry.id };
  }
  const result = await db.insert(incomeEntries).values({
    monthId,
    name: data.name,
    value,
    receivedValue,
    received: data.received || 0,
    receivedAccountName: data.receivedAccountName ?? null,
  }).returning({ id: incomeEntries.id });
  return { id: result[0].id };
}

export async function updateIncome(entryId: number, data: { name?: string; value?: string; receivedValue?: string; received?: number; receivedAccountName?: string | null }) {
  const db = await getDb();
  if (!db) {
    const entry = memoryIncome.find(existing => existing.id === entryId);
    if (entry) Object.assign(entry, data);
    persistMemoryData();
    return;
  }
  await db.update(incomeEntries).set(data).where(eq(incomeEntries.id, entryId));
}

export async function deleteIncome(entryId: number) {
  const db = await getDb();
  if (!db) {
    const index = memoryIncome.findIndex(entry => entry.id === entryId);
    if (index >= 0) memoryIncome.splice(index, 1);
    persistMemoryData();
    return;
  }
  await db.delete(incomeEntries).where(eq(incomeEntries.id, entryId));
}

// ============ BANK BALANCES ============

export async function getBalancesByMonth(monthId: number) {
  const db = await getDb();
  if (!db) return memoryBalances.filter(balance => balance.monthId === monthId).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return db.select().from(bankBalances).where(eq(bankBalances.monthId, monthId)).orderBy(asc(bankBalances.sortOrder));
}

export async function getBalanceById(balanceId: number) {
  const db = await getDb();
  if (!db) return memoryBalances.find(balance => balance.id === balanceId);
  const rows = await db.select().from(bankBalances).where(eq(bankBalances.id, balanceId)).limit(1);
  return rows[0];
}

export async function upsertBalance(monthId: number, accountName: string, balance: string, sortOrder: number = 0) {
  const db = await getDb();
  if (!db) {
    const existing = memoryBalances.find(balanceEntry => balanceEntry.monthId === monthId && balanceEntry.accountName === accountName);
    if (existing) {
      existing.balance = balance;
      persistMemoryData();
      return existing.id;
    }
    const entry = { id: memoryNextId++, monthId, accountName, balance, sortOrder };
    memoryBalances.push(entry);
    persistMemoryData();
    return entry.id;
  }
  // Check if exists
  const existing = await db.select().from(bankBalances)
    .where(and(eq(bankBalances.monthId, monthId), eq(bankBalances.accountName, accountName)))
    .limit(1);
  if (existing.length > 0) {
    await db.update(bankBalances).set({ balance }).where(eq(bankBalances.id, existing[0].id));
    return existing[0].id;
  } else {
    const result = await db.insert(bankBalances).values({ monthId, accountName, balance, sortOrder }).returning({ id: bankBalances.id });
    return result[0].id;
  }
}

export async function deleteBalance(balanceId: number) {
  const db = await getDb();
  if (!db) {
    const index = memoryBalances.findIndex(balance => balance.id === balanceId);
    if (index >= 0) memoryBalances.splice(index, 1);
    persistMemoryData();
    return;
  }
  await db.delete(bankBalances).where(eq(bankBalances.id, balanceId));
}

// ============ BANK TRANSACTIONS ============

export async function listBankTransactions(monthId: number) {
  const db = await getDb();
  if (!db) {
    return memoryBankTransactions
      .filter(transaction => transaction.monthId === monthId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  return db.select().from(bankTransactions).where(eq(bankTransactions.monthId, monthId)).orderBy(asc(bankTransactions.id));
}

export async function listBankTransactionsBySource(monthId: number, sourceType: string, sourceId: number) {
  const db = await getDb();
  if (!db) {
    return memoryBankTransactions
      .filter(transaction => transaction.monthId === monthId && transaction.sourceType === sourceType && transaction.sourceId === sourceId)
      .sort((a, b) => a.id - b.id);
  }
  return db.select().from(bankTransactions)
    .where(and(
      eq(bankTransactions.monthId, monthId),
      eq(bankTransactions.sourceType, sourceType),
      eq(bankTransactions.sourceId, sourceId)
    ))
    .orderBy(asc(bankTransactions.id));
}

export async function getBankTransactionByFingerprint(monthId: number, fingerprint: string) {
  const db = await getDb();
  if (!db) {
    return memoryBankTransactions.find(transaction => transaction.monthId === monthId && transaction.fingerprint === fingerprint);
  }
  const result = await db.select().from(bankTransactions)
    .where(and(eq(bankTransactions.monthId, monthId), eq(bankTransactions.fingerprint, fingerprint)))
    .limit(1);
  return result[0];
}

export async function createBankTransaction(data: {
  monthId: number;
  userId?: number | null;
  accountName: string;
  description: string;
  movementType: "income" | "expense" | "adjustment";
  amount: string;
  balanceAfter: string;
  sourceType?: string | null;
  sourceId?: number | null;
  fingerprint?: string | null;
}) {
  const db = await getDb();
  const values = {
    monthId: data.monthId,
    userId: data.userId ?? null,
    accountName: data.accountName.trim(),
    description: data.description.trim() || "Movimentação",
    movementType: data.movementType,
    amount: data.amount,
    balanceAfter: data.balanceAfter,
    sourceType: data.sourceType ?? null,
    sourceId: data.sourceId ?? null,
    fingerprint: data.fingerprint ?? null,
  };

  if (!db) {
    const transaction = { id: memoryNextId++, ...values, createdAt: new Date() };
    memoryBankTransactions.push(transaction);
    persistMemoryData();
    return { id: transaction.id };
  }

  const result = await db.insert(bankTransactions).values(values).returning({ id: bankTransactions.id });
  return { id: result[0].id };
}

// ============ GOALS ============

export async function getGoalsByOrganization(organizationId: number) {
  const db = await getDb();
  if (!db) return memoryGoals.filter(goal => goal.organizationId === organizationId).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return db.select().from(goals).where(eq(goals.organizationId, organizationId)).orderBy(asc(goals.sortOrder));
}

export async function getGoalById(goalId: number) {
  const db = await getDb();
  if (!db) return memoryGoals.find(goal => goal.id === goalId);
  const result = await db.select().from(goals).where(eq(goals.id, goalId)).limit(1);
  return result[0];
}

export async function createGoal(organizationId: number, data: { name: string; term?: "short" | "medium" | "long"; targetValue?: string; savedValue?: string }) {
  const db = await getDb();
  if (!db) {
    const goal = {
      id: memoryNextId++,
      organizationId,
      name: data.name,
      term: data.term || "medium",
      targetValue: data.targetValue || "0.00",
      savedValue: data.savedValue || "0.00",
      sortOrder: memoryGoals.filter(existing => existing.organizationId === organizationId).length,
    };
    memoryGoals.push(goal);
    persistMemoryData();
    return { id: goal.id };
  }
  const result = await db.insert(goals).values({
    organizationId,
    name: data.name,
    term: data.term || "medium",
    targetValue: data.targetValue || "0.00",
    savedValue: data.savedValue || "0.00",
  }).returning({ id: goals.id });
  return { id: result[0].id };
}

export async function updateGoal(goalId: number, data: { name?: string; term?: "short" | "medium" | "long"; targetValue?: string; savedValue?: string }) {
  const db = await getDb();
  if (!db) {
    const goal = memoryGoals.find(existing => existing.id === goalId);
    if (goal) Object.assign(goal, data);
    persistMemoryData();
    return;
  }
  await db.update(goals).set(data).where(eq(goals.id, goalId));
}

export async function deleteGoal(goalId: number) {
  const db = await getDb();
  if (!db) {
    const index = memoryGoals.findIndex(goal => goal.id === goalId);
    if (index >= 0) memoryGoals.splice(index, 1);
    persistMemoryData();
    return;
  }
  await db.delete(goals).where(eq(goals.id, goalId));
}


type ParsedImportCard = { name: string; icon: string; items: SeedItem[] };
type ParsedImportIncome = { name: string; value: string; received?: number };

function normalizeMoneyInput(value: string) {
  const compact = value.replace(/R\$/gi, "").replace(/\s+/g, "").replace(/[^\d,.-]/g, "");
  if (!compact) return "0.00";
  let normalized = compact;
  if (normalized.includes(",")) normalized = normalized.replace(/\./g, "").replace(",", ".");
  else {
    const dotCount = (normalized.match(/\./g) || []).length;
    if (dotCount > 1) {
      const lastDot = normalized.lastIndexOf(".");
      normalized = normalized.slice(0, lastDot).replace(/\./g, "") + normalized.slice(lastDot);
    }
  }
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
}

function extractMoneyTokens(text: string) {
  const normalized = text.replace(/,\s+/g, ",");
  const matches = normalized.match(/(?:R\$\s*)?\d+(?:[.,]\d{2,3})*(?:[.,]\d{2})?/gi) || [];
  return matches.filter(token => !/\/\s*\d{1,2}/.test(token));
}

function firstMoneyValue(text: string) {
  const equalsMatch = text.match(/=\s*((?:R\$\s*)?\d+(?:[.,]\d{2,3})*(?:[.,]\d{2})?)/i);
  if (equalsMatch) return normalizeMoneyInput(equalsMatch[1]);
  const token = extractMoneyTokens(text)[0];
  return token ? normalizeMoneyInput(token) : "0.00";
}

function sumMoneyValues(text: string) {
  const tokens = extractMoneyTokens(text).filter(token => !token.trim().startsWith("$"));
  const sum = tokens.reduce((total, token) => total + Number.parseFloat(normalizeMoneyInput(token)), 0);
  return sum.toFixed(2);
}

function parseImportText(text: string): { cards: ParsedImportCard[]; income: ParsedImportIncome[] } {
  const cards: ParsedImportCard[] = [];
  const income: ParsedImportIncome[] = [];
  let mode: "expenses" | "income" = "expenses";
  let currentCard: ParsedImportCard | null = null;
  let nestedPrefix = "";
  let inCardsGroup = false;

  const getOrCreateCard = (name: string, icon = "📋") => {
    const trimmedName = name.trim();
    const existing = cards.find(card => card.name.toLowerCase() === trimmedName.toLowerCase());
    if (existing) return existing;
    const card = { name: trimmedName, icon, items: [] };
    cards.push(card);
    return card;
  };

  const addItem = (line: string) => {
    if (!currentCard) currentCard = getOrCreateCard("Despesas");
    const [rawName, ...restParts] = line.split(":");
    const rest = restParts.join(":").trim();
    let name = rawName.trim();
    if (nestedPrefix && !name.toLowerCase().startsWith(nestedPrefix.toLowerCase())) name = nestedPrefix + " - " + name;
    const value = firstMoneyValue(rest || line);
    const paidMatch = line.match(/pago[^\d]*(?:R\$\s*)?(\d+(?:[.,]\s*\d{2,3})*(?:[.,]\s*\d{2})?)/i);
    const fullyPaid = /(^|\s|-)pago(\s|$)/i.test(line) && !paidMatch;
    const paidValue = paidMatch ? normalizeMoneyInput(paidMatch[1]) : fullyPaid ? value : "0.00";
    const paidNumber = Number.parseFloat(paidValue);
    const valueNumber = Number.parseFloat(value);
    const status = paidNumber >= valueNumber && valueNumber > 0 ? "pago" : paidNumber > 0 ? "parcial" : "pendente";
    const dueDate = (line.match(/\b\d{1,2}\s*\/\s*\d{1,2}\b/)?.[0] || "").replace(/\s+/g, "");
    if (valueNumber > 0 || name.length > 0) currentCard.items.push({ name, dueDate, value, paidValue, status });
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const leadingSpaces = rawLine.match(/^\s*/)?.[0].length ?? 0;
    const line = rawLine.trim().replace(/^[*•-]\s*/, "").replace(/^\d+[.)]\s*/, "");
    if (!line) continue;
    if (/^(total|pago|restante)\b/i.test(line)) continue;
    if (/^entradas/i.test(line)) {
      mode = "income";
      currentCard = null;
      nestedPrefix = "";
      inCardsGroup = false;
      continue;
    }
    if (/^cartões:?$/i.test(line) || /^cartoes:?$/i.test(line)) {
      mode = "expenses";
      inCardsGroup = true;
      currentCard = null;
      nestedPrefix = "";
      continue;
    }
    const hasMoney = extractMoneyTokens(line).length > 0 || /=\s*\d/.test(line);
    const labelOnly = /:\s*$/.test(line) && !hasMoney;
    if (mode === "income") {
      if (!line.includes(":")) continue;
      const [rawName, ...restParts] = line.split(":");
      const rest = restParts.join(":");
      const name = rawName.trim();
      const value = /expenses/i.test(rest) ? sumMoneyValues(rest) : firstMoneyValue(rest);
      income.push({ name, value });
      continue;
    }
    if (line.startsWith("@")) {
      const person = line.replace(/^@/, "").trim();
      currentCard = getOrCreateCard(/d[eé]bora/i.test(person) ? "Cartões Débora" : "Cartões Pedro", "💳");
      nestedPrefix = "";
      inCardsGroup = true;
      continue;
    }
    if (labelOnly) {
      const label = line.replace(/:$/, "").trim();
      if (currentCard && leadingSpaces > 0 && !inCardsGroup) nestedPrefix = label;
      else {
        const icon = /casa/i.test(label) ? "🏠" : /cuidado/i.test(label) ? "✨" : /escrit/i.test(label) ? "🏢" : /cart/i.test(label) ? "💳" : "📋";
        currentCard = getOrCreateCard(label, icon);
        nestedPrefix = "";
        inCardsGroup = /cart/i.test(label);
      }
      continue;
    }
    if (line.includes(":")) addItem(line);
  }
  return { cards: cards.filter(card => card.items.length > 0), income };
}

async function clearMonthImportedData(monthId: number) {
  const db = await getDb();
  if (!db) {
    const cardIds = memoryCards.filter(card => card.monthId === monthId).map(card => card.id);
    for (let index = memoryItems.length - 1; index >= 0; index -= 1) if (cardIds.includes(memoryItems[index].cardId)) memoryItems.splice(index, 1);
    for (let index = memoryCards.length - 1; index >= 0; index -= 1) if (memoryCards[index].monthId === monthId) memoryCards.splice(index, 1);
    for (let index = memoryIncome.length - 1; index >= 0; index -= 1) if (memoryIncome[index].monthId === monthId) memoryIncome.splice(index, 1);
    persistMemoryData();
    return;
  }
  const cards = await db.select().from(expenseCards).where(eq(expenseCards.monthId, monthId));
  for (const card of cards) await db.delete(expenseItems).where(eq(expenseItems.cardId, card.id));
  await db.delete(expenseCards).where(eq(expenseCards.monthId, monthId));
  await db.delete(incomeEntries).where(eq(incomeEntries.monthId, monthId));
}

export async function importMonthText(monthId: number, text: string, replaceExisting: boolean) {
  const parsed = parseImportText(text);
  if (replaceExisting) await clearMonthImportedData(monthId);
  for (let cardIndex = 0; cardIndex < parsed.cards.length; cardIndex += 1) {
    const card = parsed.cards[cardIndex];
    const createdCard = await createCard(monthId, card.name, card.icon);
    const db = await getDb();
    if (db) await db.update(expenseCards).set({ sortOrder: cardIndex }).where(eq(expenseCards.id, createdCard.id));
    else {
      const memoryCard = memoryCards.find(existing => existing.id === createdCard.id);
      if (memoryCard) memoryCard.sortOrder = cardIndex;
    }
    for (let itemIndex = 0; itemIndex < card.items.length; itemIndex += 1) {
      const item = card.items[itemIndex];
      const createdItem = await createItem(createdCard.id, item);
      if (db) await db.update(expenseItems).set({ sortOrder: itemIndex }).where(eq(expenseItems.id, createdItem.id));
      else {
        const memoryItem = memoryItems.find(existing => existing.id === createdItem.id);
        if (memoryItem) memoryItem.sortOrder = itemIndex;
      }
    }
  }
  for (let incomeIndex = 0; incomeIndex < parsed.income.length; incomeIndex += 1) {
    const createdIncome = await createIncome(monthId, parsed.income[incomeIndex]);
    const db = await getDb();
    if (db) await db.update(incomeEntries).set({ sortOrder: incomeIndex }).where(eq(incomeEntries.id, createdIncome.id));
    else {
      const memoryEntry = memoryIncome.find(entry => entry.id === createdIncome.id);
      if (memoryEntry) memoryEntry.sortOrder = incomeIndex;
    }
  }
  if (!(await getDb())) persistMemoryData();
  return { cards: parsed.cards.length, income: parsed.income.length };
}

type CopyMonthOptions = {
  targetMonthId?: number;
  targetLabel?: string;
  includeExpenses?: boolean;
  includeIncome?: boolean;
  includeBalances?: boolean;
  replaceExisting?: boolean;
  resetPaymentStatus?: boolean;
};

async function clearMonthSections(monthId: number, options: { expenses?: boolean; income?: boolean; balances?: boolean }) {
  const db = await getDb();
  if (!db) {
    if (options.expenses) {
      const cardIds = memoryCards.filter(card => card.monthId === monthId).map(card => card.id);
      for (let index = memoryItems.length - 1; index >= 0; index -= 1) {
        if (cardIds.includes(memoryItems[index].cardId)) memoryItems.splice(index, 1);
      }
      for (let index = memoryCards.length - 1; index >= 0; index -= 1) {
        if (memoryCards[index].monthId === monthId) memoryCards.splice(index, 1);
      }
    }
    if (options.income) {
      for (let index = memoryIncome.length - 1; index >= 0; index -= 1) {
        if (memoryIncome[index].monthId === monthId) memoryIncome.splice(index, 1);
      }
    }
    if (options.balances) {
      for (let index = memoryBalances.length - 1; index >= 0; index -= 1) {
        if (memoryBalances[index].monthId === monthId) memoryBalances.splice(index, 1);
      }
    }
    persistMemoryData();
    return;
  }

  if (options.expenses) {
    const cards = await db.select().from(expenseCards).where(eq(expenseCards.monthId, monthId));
    for (const card of cards) await db.delete(expenseItems).where(eq(expenseItems.cardId, card.id));
    await db.delete(expenseCards).where(eq(expenseCards.monthId, monthId));
  }
  if (options.income) await db.delete(incomeEntries).where(eq(incomeEntries.monthId, monthId));
  if (options.balances) await db.delete(bankBalances).where(eq(bankBalances.monthId, monthId));
}

export async function copyMonthData(userId: number, sourceMonthId: number, options: CopyMonthOptions, organizationId?: number) {
  const includeExpenses = options.includeExpenses ?? true;
  const includeIncome = options.includeIncome ?? true;
  const includeBalances = options.includeBalances ?? true;
  const replaceExisting = options.replaceExisting ?? true;
  const resetPaymentStatus = options.resetPaymentStatus ?? false;

  const orgId = organizationId ?? (await getDefaultOrganizationForUser(userId)).id;
  const existingMonths = await getMonthsByOrganization(userId, orgId);
  let targetMonth = options.targetMonthId
    ? existingMonths.find(month => month.id === options.targetMonthId)
    : undefined;

  if (!targetMonth) {
    if (!options.targetLabel) throw new Error("Informe o mês destino");
    const existingByLabel = existingMonths.find(month => month.label === options.targetLabel);
    targetMonth = existingByLabel ?? await createMonth(userId, options.targetLabel, orgId);
  }

  if (!targetMonth) throw new Error("Não foi possível definir o mês destino");
  if (targetMonth.id === sourceMonthId) throw new Error("Escolha um mês destino diferente do mês atual");

  if (replaceExisting) {
    await clearMonthSections(targetMonth.id, {
      expenses: includeExpenses,
      income: includeIncome,
      balances: includeBalances,
    });
  }

  const db = await getDb();

  if (includeExpenses) {
    const sourceCards = await getCardsByMonth(sourceMonthId);
    for (let cardIndex = 0; cardIndex < sourceCards.length; cardIndex += 1) {
      const sourceCard = sourceCards[cardIndex];
      const targetCard = await createCard(targetMonth.id, sourceCard.name, sourceCard.icon || "📋");
      if (db) {
        await db.update(expenseCards).set({ sortOrder: sourceCard.sortOrder ?? cardIndex }).where(eq(expenseCards.id, targetCard.id));
      } else {
        const memoryCard = memoryCards.find(card => card.id === targetCard.id);
        if (memoryCard) memoryCard.sortOrder = sourceCard.sortOrder ?? cardIndex;
      }

      const sourceItems = await getItemsByCard(sourceCard.id);
      for (let itemIndex = 0; itemIndex < sourceItems.length; itemIndex += 1) {
        const sourceItem = sourceItems[itemIndex];
        const targetItem = await createItem(targetCard.id, {
          name: sourceItem.name,
          dueDate: sourceItem.dueDate || "",
          value: sourceItem.value,
          paidValue: resetPaymentStatus ? "0.00" : sourceItem.paidValue,
          paidAccountName: resetPaymentStatus ? null : sourceItem.paidAccountName,
          paymentMode: resetPaymentStatus ? "bank" : normalizePaymentMode(sourceItem.paymentMode),
          status: resetPaymentStatus ? "pendente" : sourceItem.status,
        });
        if (db) {
          await db.update(expenseItems).set({ sortOrder: sourceItem.sortOrder ?? itemIndex }).where(eq(expenseItems.id, targetItem.id));
        } else {
          const memoryItem = memoryItems.find(item => item.id === targetItem.id);
          if (memoryItem) memoryItem.sortOrder = sourceItem.sortOrder ?? itemIndex;
        }
      }
    }
  }

  if (includeIncome) {
    const sourceIncome = await getIncomeByMonth(sourceMonthId);
    for (let incomeIndex = 0; incomeIndex < sourceIncome.length; incomeIndex += 1) {
      const sourceEntry = sourceIncome[incomeIndex];
      const targetEntry = await createIncome(targetMonth.id, {
        name: sourceEntry.name,
        value: sourceEntry.value,
        receivedValue: resetPaymentStatus ? "0.00" : sourceEntry.receivedValue,
        received: resetPaymentStatus ? 0 : sourceEntry.received,
        receivedAccountName: resetPaymentStatus ? null : sourceEntry.receivedAccountName,
      });
      if (db) {
        await db.update(incomeEntries).set({ sortOrder: sourceEntry.sortOrder ?? incomeIndex }).where(eq(incomeEntries.id, targetEntry.id));
      } else {
        const memoryEntry = memoryIncome.find(entry => entry.id === targetEntry.id);
        if (memoryEntry) memoryEntry.sortOrder = sourceEntry.sortOrder ?? incomeIndex;
      }
    }
  }

  if (includeBalances) {
    const sourceBalances = await getBalancesByMonth(sourceMonthId);
    for (let balanceIndex = 0; balanceIndex < sourceBalances.length; balanceIndex += 1) {
      const sourceBalance = sourceBalances[balanceIndex];
      await upsertBalance(targetMonth.id, sourceBalance.accountName, sourceBalance.balance, sourceBalance.sortOrder ?? balanceIndex);
    }
  }

  if (!(await getDb())) persistMemoryData();
  return targetMonth;
}

export async function seedMay2026Data(userId: number, organizationId?: number) {
  const db = await getDb();
  if (!db) {
    const orgId = organizationId ?? (await getDefaultOrganizationForUser(userId)).id;
    return ensureMemorySeed(userId, orgId);
  }

  const orgId = organizationId ?? (await getDefaultOrganizationForUser(userId)).id;
  const existingMonths = await db.select().from(months)
    .where(and(eq(months.organizationId, orgId), eq(months.label, "2026-05")))
    .limit(1);
  const month = existingMonths[0] ?? await createMonth(userId, "2026-05", orgId);
  const existingCards = await getCardsByMonth(month.id);

  if (existingCards.length > 0) return month;

  await initDefaultBalances(month.id);

  for (let cardIndex = 0; cardIndex < MAY_2026_SEED_CARDS.length; cardIndex += 1) {
    const card = MAY_2026_SEED_CARDS[cardIndex];
    const createdCard = await createCard(month.id, card.name, card.icon);
    await db.update(expenseCards)
      .set({ sortOrder: cardIndex })
      .where(eq(expenseCards.id, createdCard.id));

    for (let itemIndex = 0; itemIndex < card.items.length; itemIndex += 1) {
      const item = card.items[itemIndex];
      const createdItem = await createItem(createdCard.id, {
        name: item.name,
        dueDate: item.dueDate ?? "",
        value: item.value,
        paidValue: item.paidValue ?? "0.00",
        status: item.status ?? "pendente",
      });
      await db.update(expenseItems)
        .set({ sortOrder: itemIndex })
        .where(eq(expenseItems.id, createdItem.id));
    }
  }

  const existingIncome = await getIncomeByMonth(month.id);
  if (existingIncome.length === 0) {
    for (let incomeIndex = 0; incomeIndex < MAY_2026_SEED_INCOME.length; incomeIndex += 1) {
      const entry = MAY_2026_SEED_INCOME[incomeIndex];
      const createdIncome = await createIncome(month.id, entry);
      await db.update(incomeEntries)
        .set({ sortOrder: incomeIndex })
        .where(eq(incomeEntries.id, createdIncome.id));
    }
  }

  return month;
}

function getCurrentMonthLabel() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

async function setSortOrder(tableName: "card" | "item" | "income", id: number, sortOrder: number) {
  const db = await getDb();
  if (db) {
    if (tableName === "card") await db.update(expenseCards).set({ sortOrder }).where(eq(expenseCards.id, id));
    if (tableName === "item") await db.update(expenseItems).set({ sortOrder }).where(eq(expenseItems.id, id));
    if (tableName === "income") await db.update(incomeEntries).set({ sortOrder }).where(eq(incomeEntries.id, id));
    return;
  }
  if (tableName === "card") {
    const card = memoryCards.find(entry => entry.id === id);
    if (card) card.sortOrder = sortOrder;
  }
  if (tableName === "item") {
    const item = memoryItems.find(entry => entry.id === id);
    if (item) item.sortOrder = sortOrder;
  }
  if (tableName === "income") {
    const income = memoryIncome.find(entry => entry.id === id);
    if (income) income.sortOrder = sortOrder;
  }
}

export async function seedStarterMonthData(userId: number, organizationId?: number) {
  const orgId = organizationId ?? (await getDefaultOrganizationForUser(userId)).id;
  const label = getCurrentMonthLabel();
  const existingMonths = await getMonthsByOrganization(userId, orgId);
  const month = existingMonths.find(existing => existing.label === label) ?? await createMonth(userId, label, orgId);
  const existingCards = await getCardsByMonth(month.id);
  const existingIncome = await getIncomeByMonth(month.id);
  const existingBalances = await getBalancesByMonth(month.id);

  if (existingBalances.length === 0) {
    await upsertBalance(month.id, "Conta principal", "0.00", 0);
  }

  if (existingIncome.length === 0) {
    const createdIncome = await createIncome(month.id, {
      name: "Receita principal",
      value: "0.00",
      received: 0,
    });
    await setSortOrder("income", createdIncome.id, 0);
  }

  if (existingCards.length === 0) {
    for (let cardIndex = 0; cardIndex < STARTER_CARDS.length; cardIndex += 1) {
      const starterCard = STARTER_CARDS[cardIndex];
      const createdCard = await createCard(month.id, starterCard.name, starterCard.icon);
      await setSortOrder("card", createdCard.id, cardIndex);
      for (let itemIndex = 0; itemIndex < starterCard.items.length; itemIndex += 1) {
        const createdItem = await createItem(createdCard.id, starterCard.items[itemIndex]);
        await setSortOrder("item", createdItem.id, itemIndex);
      }
    }
  }

  if (!(await getDb())) persistMemoryData();
  return month;
}

export async function initDefaultBalances(monthId: number) {
  const db = await getDb();
  if (!db) {
    if (memoryBalances.some(balance => balance.monthId === monthId)) return;
    const accounts = [
      "Conta Pessoal — Pedro",
      "Conta Pessoal — Débora",
    ];
    accounts.forEach((accountName, sortOrder) => {
      const balance = accountName.includes("Pedro") ? "3.90" : "0.00";
      memoryBalances.push({ id: memoryNextId++, monthId, accountName, balance, sortOrder });
    });
    persistMemoryData();
    return;
  }
  const existing = await db.select().from(bankBalances).where(eq(bankBalances.monthId, monthId));
  if (existing.length === 0) {
    const defaults = [
      { monthId, accountName: "Conta Pessoal — Pedro", balance: "3.90", sortOrder: 0 },
      { monthId, accountName: "Conta Pessoal — Débora", balance: "0.00", sortOrder: 1 },
    ];
    for (const d of defaults) {
      await db.insert(bankBalances).values(d);
    }
  }
}
