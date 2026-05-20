import { integer, pgEnum, pgTable, text, timestamp, varchar, decimal, smallint, serial } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
export const memberRoleEnum = pgEnum("member_role", ["admin", "finance", "viewer"]);
export const statusEnum = pgEnum("status", ["pago", "parcial", "pendente"]);
export const termEnum = pgEnum("term", ["short", "medium", "long"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  username: varchar("username", { length: 80 }).unique(),
  passwordHash: text("passwordHash"),
  active: smallint("active").default(1).notNull(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRoleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  ownerUserId: integer("ownerUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Organization = typeof organizations.$inferSelect;

export const organizationMembers = pgTable("organization_members", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  userId: integer("userId").notNull(),
  role: memberRoleEnum("memberRole").default("viewer").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type OrganizationMember = typeof organizationMembers.$inferSelect;

// Financial months (e.g. "2026-05" for May 2026)
export const months = pgTable("months", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  organizationId: integer("organizationId").default(1).notNull(),
  label: varchar("label", { length: 7 }).notNull(), // "YYYY-MM"
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Month = typeof months.$inferSelect;

// Expense cards (categories like Casa, Escritório, etc.)
export const expenseCards = pgTable("expense_cards", {
  id: serial("id").primaryKey(),
  monthId: integer("monthId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  icon: varchar("icon", { length: 10 }).default("📋"),
  sortOrder: integer("sortOrder").default(0),
});

export type ExpenseCard = typeof expenseCards.$inferSelect;

// Expense items within cards
export const expenseItems = pgTable("expense_items", {
  id: serial("id").primaryKey(),
  cardId: integer("cardId").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  dueDate: varchar("dueDate", { length: 100 }).default(""),
  value: decimal("value", { precision: 12, scale: 2 }).default("0.00").notNull(),
  paidValue: decimal("paidValue", { precision: 12, scale: 2 }).default("0.00").notNull(),
  paidAccountName: varchar("paidAccountName", { length: 100 }),
  status: statusEnum("status").default("pendente").notNull(),
  sortOrder: integer("sortOrder").default(0),
});

export type ExpenseItem = typeof expenseItems.$inferSelect;

// Income entries per month
export const incomeEntries = pgTable("income_entries", {
  id: serial("id").primaryKey(),
  monthId: integer("monthId").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  value: decimal("value", { precision: 12, scale: 2 }).default("0.00").notNull(),
  received: smallint("received").default(0).notNull(), // 0=pending, 1=received
  receivedAccountName: varchar("receivedAccountName", { length: 100 }),
  sortOrder: integer("sortOrder").default(0),
});

export type IncomeEntry = typeof incomeEntries.$inferSelect;

// Bank balances per month
export const bankBalances = pgTable("bank_balances", {
  id: serial("id").primaryKey(),
  monthId: integer("monthId").notNull(),
  accountName: varchar("accountName", { length: 100 }).notNull(),
  balance: decimal("balance", { precision: 12, scale: 2 }).default("0.00").notNull(),
  sortOrder: integer("sortOrder").default(0),
});

export type BankBalance = typeof bankBalances.$inferSelect;

// Goals and Investments
export const goals = pgTable("goals", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  term: termEnum("term").default("medium").notNull(),
  targetValue: decimal("targetValue", { precision: 12, scale: 2 }).default("0.00").notNull(),
  savedValue: decimal("savedValue", { precision: 12, scale: 2 }).default("0.00").notNull(),
  sortOrder: integer("sortOrder").default(0),
});

export type Goal = typeof goals.$inferSelect;
