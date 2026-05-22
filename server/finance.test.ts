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
});
