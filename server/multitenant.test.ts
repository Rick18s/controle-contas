import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

type TestUser = NonNullable<TrpcContext["user"]>;

function createContext(user: TestUser, activeOrganizationId?: number): TrpcContext {
  return {
    user,
    activeOrganizationId: activeOrganizationId ?? null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { cookie: () => {}, clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

async function createUser(username: string, name: string, createDefaultOrganization = true) {
  return db.createPasswordUser({
    username: `${username}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name,
    passwordHash: "test-hash",
    role: "user",
    createDefaultOrganization,
  });
}

describe("multi-tenant isolation", () => {
  it("blocks a user from reading another organization's month data", async () => {
    const owner = await createUser("owner", "Owner");
    const [ownerOrg] = await db.getOrganizationsForUser(owner.id);
    expect(ownerOrg).toBeTruthy();

    const ownerCaller = appRouter.createCaller(createContext(owner, ownerOrg!.id));
    const month = await ownerCaller.months.create({ label: "2099-01" });

    const intruder = await createUser("intruder", "Intruder");
    const [intruderOrg] = await db.getOrganizationsForUser(intruder.id);
    expect(intruderOrg).toBeTruthy();

    const intruderCaller = appRouter.createCaller(createContext(intruder, intruderOrg!.id));
    await expect(intruderCaller.cards.list({ monthId: month.id })).rejects.toThrow(/Mês não encontrado/);
  });

  it("prevents viewers from creating or changing financial data", async () => {
    const owner = await createUser("finance-owner", "Finance Owner");
    const [ownerOrg] = await db.getOrganizationsForUser(owner.id);
    expect(ownerOrg).toBeTruthy();

    const viewer = await createUser("viewer", "Viewer", false);
    await db.addUserToOrganization(viewer.id, ownerOrg!.id, "viewer");

    const viewerCaller = appRouter.createCaller(createContext(viewer, ownerOrg!.id));
    await expect(viewerCaller.months.create({ label: "2099-02" })).rejects.toThrow(/visualização/);
  });

  it("lets organization admins manage only members from their active organization", async () => {
    const admin = await createUser("org-admin", "Org Admin");
    const [adminOrg] = await db.getOrganizationsForUser(admin.id);
    expect(adminOrg).toBeTruthy();

    const outsider = await createUser("outsider", "Outsider");
    const adminCaller = appRouter.createCaller(createContext(admin, adminOrg!.id));

    await expect(adminCaller.users.resetPassword({ id: outsider.id, newPassword: "123456" })).rejects.toThrow(/não pertence/);
  });
});
