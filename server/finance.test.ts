import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

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
