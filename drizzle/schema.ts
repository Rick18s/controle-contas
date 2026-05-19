import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, tinyint } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  username: varchar("username", { length: 80 }).unique(),
  passwordHash: text("passwordHash"),
  active: tinyint("active").default(1).notNull(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const organizations = mysqlTable("organizations", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  ownerUserId: int("ownerUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Organization = typeof organizations.$inferSelect;

export const organizationMembers = mysqlTable("organization_members", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("memberRole", ["admin", "finance", "viewer"]).default("viewer").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type OrganizationMember = typeof organizationMembers.$inferSelect;

// Financial months (e.g. "2026-05" for May 2026)
export const months = mysqlTable("months", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  organizationId: int("organizationId").default(1).notNull(),
  label: varchar("label", { length: 7 }).notNull(), // "YYYY-MM"
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Month = typeof months.$inferSelect;

// Expense cards (categories like Casa, Escritório, etc.)
export const expenseCards = mysqlTable("expense_cards", {
  id: int("id").autoincrement().primaryKey(),
  monthId: int("monthId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  icon: varchar("icon", { length: 10 }).default("📋"),
  sortOrder: int("sortOrder").default(0),
});

export type ExpenseCard = typeof expenseCards.$inferSelect;

// Expense items within cards
export const expenseItems = mysqlTable("expense_items", {
  id: int("id").autoincrement().primaryKey(),
  cardId: int("cardId").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  dueDate: varchar("dueDate", { length: 100 }).default(""),
  value: decimal("value", { precision: 12, scale: 2 }).default("0.00").notNull(),
  paidValue: decimal("paidValue", { precision: 12, scale: 2 }).default("0.00").notNull(),
  status: mysqlEnum("status", ["pago", "parcial", "pendente"]).default("pendente").notNull(),
  sortOrder: int("sortOrder").default(0),
});

export type ExpenseItem = typeof expenseItems.$inferSelect;

// Income entries per month
export const incomeEntries = mysqlTable("income_entries", {
  id: int("id").autoincrement().primaryKey(),
  monthId: int("monthId").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  value: decimal("value", { precision: 12, scale: 2 }).default("0.00").notNull(),
  received: tinyint("received").default(0).notNull(), // 0=pending, 1=received
  sortOrder: int("sortOrder").default(0),
});

export type IncomeEntry = typeof incomeEntries.$inferSelect;

// Bank balances per month
export const bankBalances = mysqlTable("bank_balances", {
  id: int("id").autoincrement().primaryKey(),
  monthId: int("monthId").notNull(),
  accountName: varchar("accountName", { length: 100 }).notNull(),
  balance: decimal("balance", { precision: 12, scale: 2 }).default("0.00").notNull(),
  sortOrder: int("sortOrder").default(0),
});

export type BankBalance = typeof bankBalances.$inferSelect;

// Goals and Investments
export const goals = mysqlTable("goals", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  term: mysqlEnum("term", ["short", "medium", "long"]).default("medium").notNull(),
  targetValue: decimal("targetValue", { precision: 12, scale: 2 }).default("0.00").notNull(),
  savedValue: decimal("savedValue", { precision: 12, scale: 2 }).default("0.00").notNull(),
  sortOrder: int("sortOrder").default(0),
});

export type Goal = typeof goals.$inferSelect;
