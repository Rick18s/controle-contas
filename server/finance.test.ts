import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 999,
    openId: "test-user-finance",
    username: null,
    passwordHash: null,
    active: 1,
    email: "test@finance.app",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };

  return { ctx };
}

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const clearedCookies: { name: string; options: Record<string, unknown> }[] = [];
    const ctx: TrpcContext = {
      user: {
        id: 1,
        openId: "sample-user",
    username: null,
    passwordHash: null,
    active: 1,
        email: "sample@example.com",
        name: "Sample User",
        loginMethod: "manus",
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {
        clearCookie: (name: string, options: Record<string, unknown>) => {
          clearedCookies.push({ name, options });
        },
      } as TrpcContext["res"],
    };

    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.options).toMatchObject({ maxAge: -1 });
  });
});

describe("finance - months router", () => {
  it("returns an empty list for a new test user (no DB)", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    // Without a real DB connection this should return []
    const months = await caller.months.list();
    expect(Array.isArray(months)).toBe(true);
  });
});

describe("finance - cards router input validation", () => {
  it("rejects invalid monthId type", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      // @ts-expect-error intentional invalid input
      caller.cards.list({ monthId: "not-a-number" })
    ).rejects.toThrow();
  });
});

describe("finance - items router input validation", () => {
  it("rejects invalid status value", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.items.update({
        id: 1,
        // @ts-expect-error intentional invalid status
        status: "invalido",
      })
    ).rejects.toThrow();
  });

  it("deducts and restores bank balance when expense payment status changes", async () => {
    const user = await db.createPasswordUser({
      username: `payment-user-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: "Payment User",
      passwordHash: "test-hash",
      role: "user",
    });
    const [organization] = await db.getOrganizationsForUser(user.id);
    const ctx: TrpcContext = {
      user,
      activeOrganizationId: organization!.id,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: () => {} } as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    const month = await caller.months.create({ label: "2099-03" });
    await caller.balances.update({ monthId: month.id, accountName: "Banco Teste", balance: "100.00" });
    const card = await caller.cards.create({ monthId: month.id, name: "Casa" });
    const item = await caller.items.create({ cardId: card.id, name: "Conta", value: "40.00" });

    await caller.items.update({ id: item.id, status: "pago", paidValue: "40.00", paidAccountName: "Banco Teste" });
    let balances = await caller.balances.list({ monthId: month.id });
    expect(balances.find(balance => balance.accountName === "Banco Teste")?.balance).toBe("60.00");

    await caller.items.update({ id: item.id, status: "pendente", paidValue: "0.00", paidAccountName: null });
    balances = await caller.balances.list({ monthId: month.id });
    expect(balances.find(balance => balance.accountName === "Banco Teste")?.balance).toBe("100.00");
  });

  it("applies quick fuel expenses to an existing planned budget item", async () => {
    const user = await db.createPasswordUser({
      username: `quick-fuel-user-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: "Quick Fuel User",
      passwordHash: "test-hash",
      role: "user",
    });
    const [organization] = await db.getOrganizationsForUser(user.id);
    const ctx: TrpcContext = {
      user,
      activeOrganizationId: organization!.id,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: () => {} } as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    const month = await caller.months.create({ label: "2099-04" });
    await caller.balances.update({ monthId: month.id, accountName: "Banco Teste", balance: "1000.00" });
    const card = await caller.cards.create({ monthId: month.id, name: "Casa" });
    await caller.items.create({ cardId: card.id, name: "[P2] Combustível", value: "1000.00" });

    const result = await caller.ai.quickAdd({ monthId: month.id, text: "gasolina 200", accountName: "Banco Teste" });
    expect(result.type).toBe("expense");
    expect("matchedExisting" in result && result.matchedExisting).toBe(true);

    const cards = await caller.cards.list({ monthId: month.id });
    const fuel = cards.flatMap(existingCard => existingCard.items).find(item => item.name.includes("Combustível"));
    expect(fuel?.value).toBe("1000.00");
    expect(fuel?.paidValue).toBe("200.00");
    expect(fuel?.status).toBe("parcial");

    const balances = await caller.balances.list({ monthId: month.id });
    expect(balances.find(balance => balance.accountName === "Banco Teste")?.balance).toBe("800.00");
  });

  it("tracks card-paid expenses without debiting a bank balance", async () => {
    const user = await db.createPasswordUser({
      username: `card-expense-user-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: "Card Expense User",
      passwordHash: "test-hash",
      role: "user",
    });
    const [organization] = await db.getOrganizationsForUser(user.id);
    const ctx: TrpcContext = {
      user,
      activeOrganizationId: organization!.id,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: () => {} } as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    const month = await caller.months.create({ label: "2099-07" });
    await caller.balances.update({ monthId: month.id, accountName: "Banco Teste", balance: "1000.00" });
    const card = await caller.cards.create({ monthId: month.id, name: "Casa" });
    const item = await caller.items.create({ cardId: card.id, name: "Combustível", value: "1000.00" });

    await caller.items.update({ id: item.id, status: "parcial", paidValue: "200.00", paymentMode: "card", paidAccountName: null });
    const cards = await caller.cards.list({ monthId: month.id });
    const fuel = cards.flatMap(existingCard => existingCard.items).find(existing => existing.id === item.id);
    expect(fuel?.paidValue).toBe("200.00");
    expect(fuel?.paymentMode).toBe("card");

    const balances = await caller.balances.list({ monthId: month.id });
    expect(balances.find(balance => balance.accountName === "Banco Teste")?.balance).toBe("1000.00");
  });

  it("restores the previous expense state from a saved snapshot", async () => {
    const user = await db.createPasswordUser({
      username: `restore-expense-user-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: "Restore Expense User",
      passwordHash: "test-hash",
      role: "user",
    });
    const [organization] = await db.getOrganizationsForUser(user.id);
    const ctx: TrpcContext = {
      user,
      activeOrganizationId: organization!.id,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: () => {} } as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    const month = await caller.months.create({ label: "2099-08" });
    await caller.balances.update({ monthId: month.id, accountName: "Banco Teste", balance: "1000.00" });
    const card = await caller.cards.create({ monthId: month.id, name: "Distribuição" });
    const item = await caller.items.create({ cardId: card.id, name: "Distribuição Pedro", value: "12500.00" });

    await caller.items.update({ id: item.id, status: "parcial", paidValue: "3230.00", paidAccountName: "Banco Teste", paymentMode: "bank" });
    await caller.items.update({ id: item.id, status: "pago", paidValue: "1500.00", value: "1500.00", paidAccountName: "Banco Teste", paymentMode: "bank" });
    await caller.items.restorePrevious({ id: item.id });

    const cards = await caller.cards.list({ monthId: month.id });
    const restored = cards.flatMap(existingCard => existingCard.items).find(existing => existing.id === item.id);
    expect(restored?.value).toBe("12500.00");
    expect(restored?.paidValue).toBe("3230.00");
    expect(restored?.status).toBe("parcial");

    const balances = await caller.balances.list({ monthId: month.id });
    expect(balances.find(balance => balance.accountName === "Banco Teste")?.balance).toBe("-2230.00");
  });
});

describe("finance - income router input validation", () => {
  it("rejects missing monthId on create", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      // @ts-expect-error intentional missing field
      caller.income.create({ name: "Test" })
    ).rejects.toThrow();
  });

  it("registers partial receipts and updates the bank balance only by the received amount", async () => {
    const user = await db.createPasswordUser({
      username: `partial-income-user-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: "Partial Income User",
      passwordHash: "test-hash",
      role: "user",
    });
    const [organization] = await db.getOrganizationsForUser(user.id);
    const ctx: TrpcContext = {
      user,
      activeOrganizationId: organization!.id,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: () => {} } as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    const month = await caller.months.create({ label: "2099-05" });
    await caller.balances.update({ monthId: month.id, accountName: "Banco Teste", balance: "0.00" });
    const income = await caller.income.create({ monthId: month.id, name: "Cliente", value: "1000.00", received: 0 });

    await caller.income.registerReceipt({ id: income.id, amount: "300.00", accountName: "Banco Teste" });
    let entries = await caller.income.list({ monthId: month.id });
    let entry = entries.find(existing => existing.id === income.id);
    expect(entry?.received).toBe(0);
    expect(entry?.receivedValue).toBe("300.00");
    let balances = await caller.balances.list({ monthId: month.id });
    expect(balances.find(balance => balance.accountName === "Banco Teste")?.balance).toBe("300.00");

    await caller.income.registerReceipt({ id: income.id, amount: "700.00", accountName: "Banco Teste" });
    entries = await caller.income.list({ monthId: month.id });
    entry = entries.find(existing => existing.id === income.id);
    expect(entry?.received).toBe(1);
    expect(entry?.receivedValue).toBe("1000.00");
    balances = await caller.balances.list({ monthId: month.id });
    expect(balances.find(balance => balance.accountName === "Banco Teste")?.balance).toBe("1000.00");

    await caller.income.setReceived({ id: income.id, received: 0 });
    entries = await caller.income.list({ monthId: month.id });
    entry = entries.find(existing => existing.id === income.id);
    expect(entry?.received).toBe(0);
    expect(entry?.receivedValue).toBe("0.00");
    balances = await caller.balances.list({ monthId: month.id });
    expect(balances.find(balance => balance.accountName === "Banco Teste")?.balance).toBe("0.00");
  });

  it("allows partial receipts from the same income to land in different bank accounts", async () => {
    const user = await db.createPasswordUser({
      username: `multi-bank-income-user-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: "Multi Bank Income User",
      passwordHash: "test-hash",
      role: "user",
    });
    const [organization] = await db.getOrganizationsForUser(user.id);
    const ctx: TrpcContext = {
      user,
      activeOrganizationId: organization!.id,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: () => {} } as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    const month = await caller.months.create({ label: "2099-06" });
    const income = await caller.income.create({ monthId: month.id, name: "Distribuição de Lucro", value: "25000.00", received: 0 });

    await caller.income.registerReceipt({ id: income.id, amount: "12500.00", accountName: "Conta Pedro" });
    await caller.income.registerReceipt({ id: income.id, amount: "12500.00", accountName: "Conta Débora" });

    const entries = await caller.income.list({ monthId: month.id });
    const entry = entries.find(existing => existing.id === income.id);
    expect(entry?.received).toBe(1);
    expect(entry?.receivedValue).toBe("25000.00");
    expect(entry?.receivedAccountName).toBe("Múltiplos bancos");
    expect(entry?.receiptAccounts).toEqual([
      { accountName: "Conta Débora", amount: 12500 },
      { accountName: "Conta Pedro", amount: 12500 },
    ]);

    let balances = await caller.balances.list({ monthId: month.id });
    expect(balances.find(balance => balance.accountName === "Conta Pedro")?.balance).toBe("12500.00");
    expect(balances.find(balance => balance.accountName === "Conta Débora")?.balance).toBe("12500.00");

    await caller.income.setReceived({ id: income.id, received: 0 });
    balances = await caller.balances.list({ monthId: month.id });
    expect(balances.find(balance => balance.accountName === "Conta Pedro")?.balance).toBe("0.00");
    expect(balances.find(balance => balance.accountName === "Conta Débora")?.balance).toBe("0.00");
  });
});
