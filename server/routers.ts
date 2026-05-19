import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import { adminProcedure, publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { hashPassword, verifyPassword } from "./_core/passwords";
import { z } from "zod";
import * as db from "./db";
import { getDb } from "./db";
import { months } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const ACTIVE_ORG_COOKIE = "active_organization_id";

function sanitizeUser(user: NonNullable<TrpcContextUser>) {
  return {
    id: user.id,
    openId: user.openId,
    username: user.username,
    name: user.name,
    email: user.email,
    loginMethod: user.loginMethod,
    role: user.role,
    active: user.active,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastSignedIn: user.lastSignedIn,
  };
}

type TrpcContextUser = Awaited<ReturnType<typeof db.getUserByOpenId>>;
type OrganizationRole = "admin" | "finance" | "viewer";

function sanitizeOrganizationMember(member: NonNullable<Awaited<ReturnType<typeof db.listOrganizationMembers>>[number]>) {
  return {
    ...sanitizeUser(member),
    membershipId: member.membershipId,
    membershipRole: member.membershipRole,
    organizationId: member.organizationId,
  };
}

async function getActiveOrganization(ctx: { user: NonNullable<TrpcContextUser>; activeOrganizationId: number | null }) {
  return db.getActiveOrganizationForUser(ctx.user.id, ctx.activeOrganizationId);
}

async function getActiveMembership(ctx: { user: NonNullable<TrpcContextUser>; activeOrganizationId: number | null }) {
  const organization = await getActiveOrganization(ctx);
  const membership = await db.getOrganizationMembership(ctx.user.id, organization.id);
  return { organization, membership };
}

async function requireCanEdit(ctx: { user: NonNullable<TrpcContextUser>; activeOrganizationId: number | null }) {
  const { organization, membership } = await getActiveMembership(ctx);
  if (!membership || (membership.role !== "admin" && membership.role !== "finance")) {
    throw new Error("Seu acesso é somente visualização");
  }
  return organization;
}

async function requireOrganizationAdmin(ctx: { user: NonNullable<TrpcContextUser>; activeOrganizationId: number | null }) {
  const { organization, membership } = await getActiveMembership(ctx);
  if (!membership || membership.role !== "admin") {
    throw new Error("Apenas administradores deste centro podem fazer isso");
  }
  return organization;
}

async function requireMonthInActiveOrganization(ctx: { user: NonNullable<TrpcContextUser>; activeOrganizationId: number | null }, monthId: number) {
  const organization = await getActiveOrganization(ctx);
  const month = await db.getMonthById(monthId);
  if (!month || month.organizationId !== organization.id) throw new Error("Mês não encontrado nesta organização");
  return { organization, month };
}

async function requireCardInActiveOrganization(ctx: { user: NonNullable<TrpcContextUser>; activeOrganizationId: number | null }, cardId: number) {
  const card = await db.getCardById(cardId);
  if (!card) throw new Error("Card não encontrado");
  await requireMonthInActiveOrganization(ctx, card.monthId);
  return card;
}

async function requireItemInActiveOrganization(ctx: { user: NonNullable<TrpcContextUser>; activeOrganizationId: number | null }, itemId: number) {
  const item = await db.getItemById(itemId);
  if (!item) throw new Error("Item não encontrado");
  await requireCardInActiveOrganization(ctx, item.cardId);
  return item;
}

async function requireIncomeInActiveOrganization(ctx: { user: NonNullable<TrpcContextUser>; activeOrganizationId: number | null }, incomeId: number) {
  const entry = await db.getIncomeById(incomeId);
  if (!entry) throw new Error("Entrada não encontrada");
  await requireMonthInActiveOrganization(ctx, entry.monthId);
  return entry;
}

async function requireUserInActiveOrganization(ctx: { user: NonNullable<TrpcContextUser>; activeOrganizationId: number | null }, userId: number) {
  const organization = await getActiveOrganization(ctx);
  const membership = await db.getOrganizationMembership(userId, organization.id);
  if (!membership) throw new Error("Usuário não pertence a este centro");
  return { organization, membership };
}

async function requireGoalInActiveOrganization(ctx: { user: NonNullable<TrpcContextUser>; activeOrganizationId: number | null }, goalId: number) {
  const organization = await getActiveOrganization(ctx);
  const goal = await db.getGoalById(goalId);
  if (!goal || goal.organizationId !== organization.id) throw new Error("Meta não encontrada neste centro");
  return goal;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.user) return null;
      const user = ctx.user;
      const organization = await getActiveOrganization({ user, activeOrganizationId: ctx.activeOrganizationId });
      const membership = await db.getOrganizationMembership(user.id, organization.id);
      const organizationRole = membership?.role ?? null;
      return {
        ...sanitizeUser(user),
        platformRole: user.role,
        isPlatformAdmin: user.role === "admin",
        activeOrganizationId: organization.id,
        organizationRole,
        canManageOrganization: organizationRole === "admin",
        canEditOrganization: organizationRole === "admin" || organizationRole === "finance",
      };
    }),
    login: publicProcedure
      .input(z.object({ username: z.string().min(1), password: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        if (ENV.isProduction && (!process.env.LOCAL_AUTH_USERNAME || !process.env.LOCAL_AUTH_PASSWORD || !process.env.JWT_SECRET)) {
          throw new Error("Configure LOCAL_AUTH_USERNAME, LOCAL_AUTH_PASSWORD e JWT_SECRET antes de publicar");
        }

        const username = input.username.trim();
        const expectedUsername = ENV.localAuthUsername;
        const expectedPassword = ENV.localAuthPassword;
        let user = await db.getUserByUsername(username);

        if (!user && username === expectedUsername && input.password === expectedPassword) {
          user = await db.createPasswordUser({
            username,
            name: "Pedro",
            passwordHash: hashPassword(input.password),
            role: "admin",
          });
        }

        if (!user || !verifyPassword(input.password, user.passwordHash)) {
          throw new Error("Usuário ou senha inválidos");
        }

        if (user.active !== 1) {
          throw new Error("Usuário desativado");
        }

        const now = new Date();
        await db.upsertUser({
          openId: user.openId,
          name: user.name,
          email: user.email,
          loginMethod: "password",
          role: user.role,
          lastSignedIn: now,
        });

        const token = await sdk.createSessionToken(user.openId, { name: user.name || username });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, cookieOptions);

        return sanitizeUser({ ...user, lastSignedIn: now });
      }),
    changePassword: protectedProcedure
      .input(z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(6) }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserByOpenId(ctx.user.openId);
        if (!user || !verifyPassword(input.currentPassword, user.passwordHash)) {
          throw new Error("Senha atual inválida");
        }
        await db.updateUserPassword(ctx.user.id, hashPassword(input.newPassword));
        return { success: true };
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    register: publicProcedure
      .input(z.object({ name: z.string().min(2), username: z.string().min(3), password: z.string().min(6) }))
      .mutation(async ({ ctx, input }) => {
        const username = input.username.trim().toLowerCase();
        let existingUser = await db.getUserByUsername(username);
        if (existingUser) {
          throw new Error("Usuário já existe");
        }

        const user = await db.createPasswordUser({
          username,
          name: input.name,
          passwordHash: hashPassword(input.password),
          role: "user",
        });

        const token = await sdk.createSessionToken(user.openId, { name: user.name || username });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, cookieOptions);

        return sanitizeUser({ ...user, lastSignedIn: new Date() });
      }),
  }),

  organizations: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const organizations = await db.getOrganizationsForUser(ctx.user.id);
      const active = await getActiveOrganization(ctx);
      return { organizations, activeOrganizationId: active.id };
    }),
    create: protectedProcedure
      .input(z.object({ name: z.string().min(2) }))
      .mutation(async ({ ctx, input }) => db.createOrganization(ctx.user.id, input.name.trim())),
    setActive: protectedProcedure
      .input(z.object({ organizationId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const organization = await db.getActiveOrganizationForUser(ctx.user.id, input.organizationId);
        if (organization.id !== input.organizationId) throw new Error("Organização indisponível");
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(ACTIVE_ORG_COOKIE, String(organization.id), { ...cookieOptions, httpOnly: false });
        return { success: true, organization };
      }),
  }),

  users: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const organization = await requireOrganizationAdmin(ctx);
      const users = await db.listOrganizationMembers(organization.id);
      return users.map(sanitizeOrganizationMember);
    }),
    create: protectedProcedure
      .input(z.object({
        username: z.string().min(3),
        name: z.string().min(1),
        email: z.string().email().optional().or(z.literal("")),
        password: z.string().min(6),
        role: z.enum(["admin", "finance", "viewer"]).default("viewer"),
      }))
      .mutation(async ({ ctx, input }) => {
        const organization = await requireOrganizationAdmin(ctx);
        const existingUser = await db.getUserByUsername(input.username);
        if (existingUser) {
          throw new Error("Este usuário já existe. Em breve você poderá convidar usuários existentes.");
        }
        const created = await db.createPasswordUser({
          username: input.username,
          name: input.name,
          email: input.email || null,
          passwordHash: hashPassword(input.password),
          role: "user",
          createDefaultOrganization: false,
        });
        await db.addUserToOrganization(created.id, organization.id, input.role);
        const membership = await db.getOrganizationMembership(created.id, organization.id);
        return sanitizeOrganizationMember({ ...created, membershipId: membership!.id, membershipRole: membership!.role, organizationId: organization.id });
      }),
    setActive: protectedProcedure
      .input(z.object({ id: z.number(), active: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new Error("Apenas administradores da plataforma podem desativar contas globais");
        await requireOrganizationAdmin(ctx);
        await requireUserInActiveOrganization(ctx, input.id);
        if (input.id === ctx.user.id) throw new Error("Você não pode desativar seu próprio acesso");
        await db.updateUserStatus(input.id, input.active ? 1 : 0);
        return { success: true };
      }),
    remove: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const organization = await requireOrganizationAdmin(ctx);
        const { membership } = await requireUserInActiveOrganization(ctx, input.id);
        if (input.id === ctx.user.id) throw new Error("Você não pode remover seu próprio acesso");
        if (membership.role === "admin") {
          const members = await db.listOrganizationMembers(organization.id);
          const adminCount = members.filter(member => member.membershipRole === "admin").length;
          if (adminCount <= 1) throw new Error("Este centro precisa manter pelo menos um administrador");
        }
        await db.removeUserFromOrganization(organization.id, input.id);
        return { success: true };
      }),
    updateRole: protectedProcedure
      .input(z.object({ id: z.number(), role: z.enum(["admin", "finance", "viewer"]) }))
      .mutation(async ({ ctx, input }) => {
        const { organization } = await requireUserInActiveOrganization(ctx, input.id);
        await requireOrganizationAdmin(ctx);
        if (input.id === ctx.user.id && input.role !== "admin") {
          throw new Error("Você não pode remover seu próprio papel de administrador");
        }
        await db.updateOrganizationMemberRole(organization.id, input.id, input.role as OrganizationRole);
        return { success: true };
      }),
    resetPassword: protectedProcedure
      .input(z.object({ id: z.number(), newPassword: z.string().min(6) }))
      .mutation(async ({ ctx, input }) => {
        await requireOrganizationAdmin(ctx);
        await requireUserInActiveOrganization(ctx, input.id);
        await db.updateUserPassword(input.id, hashPassword(input.newPassword));
        return { success: true };
      }),
  }),

  // ============ MONTHS ============
  months: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const organization = await getActiveOrganization(ctx);
      const userMonths = await db.getMonthsByOrganization(ctx.user.id, organization.id);
      if (userMonths.length > 0 || ctx.user.username !== ENV.localAuthUsername) {
        return userMonths;
      }

      await db.seedMay2026Data(ctx.user.id, organization.id);
      return db.getMonthsByOrganization(ctx.user.id, organization.id);
    }),
    create: protectedProcedure
      .input(z.object({ label: z.string().regex(/^\d{4}-\d{2}$/) }))
      .mutation(async ({ ctx, input }) => {
        const organization = await requireCanEdit(ctx);
        const month = await db.createMonth(ctx.user.id, input.label, organization.id);
        return month;
      }),
    copy: protectedProcedure
      .input(z.object({
        sourceMonthId: z.number(),
        targetMonthId: z.number().optional(),
        targetLabel: z.string().regex(/^\d{4}-\d{2}$/).optional(),
        includeExpenses: z.boolean().default(true),
        includeIncome: z.boolean().default(true),
        includeBalances: z.boolean().default(true),
        replaceExisting: z.boolean().default(true),
        resetPaymentStatus: z.boolean().default(false),
      }))
      .mutation(async ({ ctx, input }) => {
        const organization = await requireCanEdit(ctx);
        await requireMonthInActiveOrganization(ctx, input.sourceMonthId);
        return db.copyMonthData(ctx.user.id, input.sourceMonthId, input, organization.id);
      }),
    importText: protectedProcedure
      .input(z.object({ monthId: z.number(), text: z.string().min(1), replaceExisting: z.boolean().default(true) }))
      .mutation(async ({ ctx, input }) => {
        await requireCanEdit(ctx);
        await requireMonthInActiveOrganization(ctx, input.monthId);
        return db.importMonthText(input.monthId, input.text, input.replaceExisting);
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await requireCanEdit(ctx);
        await requireMonthInActiveOrganization(ctx, input.id);
        await db.deleteMonth(input.id);
        return { success: true };
      }),
    // Claim seeded data (userId=1) to the authenticated user
    claimSeedData: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user.username !== ENV.localAuthUsername) {
        return { migrated: 0 };
      }
      const database = await getDb();
      if (!database) throw new Error("DB not available");
      const seedMonths = await database.select().from(months).where(eq(months.userId, 1));
      if (seedMonths.length > 0 && ctx.user.id !== 1) {
        await database.update(months).set({ userId: ctx.user.id }).where(eq(months.userId, 1));
        return { migrated: seedMonths.length };
      }
      return { migrated: 0 };
    }),
    getAnalytics: protectedProcedure.query(async ({ ctx }) => {
      const organization = await getActiveOrganization(ctx);
      const userMonths = await db.getMonthsByOrganization(ctx.user.id, organization.id);
      
      let cumulativeCarryover = 0;
      const analytics = [];

      for (const month of userMonths) {
        const incomeEntries = await db.getIncomeByMonth(month.id);
        const cards = await db.getCardsByMonth(month.id);
        
        let totalIncome = 0;
        for (const entry of incomeEntries) {
          totalIncome += parseFloat(entry.value || "0");
        }

        let totalExpense = 0;
        for (const card of cards) {
          const items = await db.getItemsByCard(card.id);
          for (const item of items) {
            totalExpense += parseFloat(item.value || "0");
          }
        }

        const surplus = totalIncome - totalExpense;
        const carryoverForNextMonth = cumulativeCarryover + surplus;

        analytics.push({
          monthId: month.id,
          label: month.label,
          totalIncome,
          totalExpense,
          surplus,
          previousCarryover: cumulativeCarryover,
          finalCarryover: carryoverForNextMonth
        });

        cumulativeCarryover = carryoverForNextMonth;
      }

      return analytics;
    }),
  }),

  // ============ EXPENSE CARDS ============
  cards: router({
    list: protectedProcedure
      .input(z.object({ monthId: z.number() }))
      .query(async ({ ctx, input }) => {
        await requireMonthInActiveOrganization(ctx, input.monthId);
        const cards = await db.getCardsByMonth(input.monthId);
        const cardsWithItems = await Promise.all(
          cards.map(async (card) => {
            const items = await db.getItemsByCard(card.id);
            return { ...card, items };
          })
        );
        return cardsWithItems;
      }),
    create: protectedProcedure
      .input(z.object({ monthId: z.number(), name: z.string(), icon: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        await requireCanEdit(ctx);
        await requireMonthInActiveOrganization(ctx, input.monthId);
        return db.createCard(input.monthId, input.name, input.icon || "📋");
      }),
    update: protectedProcedure
      .input(z.object({ id: z.number(), name: z.string().optional(), icon: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        await requireCanEdit(ctx);
        await requireCardInActiveOrganization(ctx, input.id);
        const { id, ...data } = input;
        await db.updateCard(id, data);
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await requireCanEdit(ctx);
        await requireCardInActiveOrganization(ctx, input.id);
        await db.deleteCard(input.id);
        return { success: true };
      }),
  }),

  // ============ EXPENSE ITEMS ============
  items: router({
    create: protectedProcedure
      .input(z.object({
        cardId: z.number(),
        name: z.string(),
        dueDate: z.string().optional(),
        value: z.string().optional(),
        paidValue: z.string().optional(),
        status: z.enum(["pago", "parcial", "pendente"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireCanEdit(ctx);
        await requireCardInActiveOrganization(ctx, input.cardId);
        const { cardId, ...data } = input;
        return db.createItem(cardId, data);
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        dueDate: z.string().optional(),
        value: z.string().optional(),
        paidValue: z.string().optional(),
        status: z.enum(["pago", "parcial", "pendente"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireCanEdit(ctx);
        await requireItemInActiveOrganization(ctx, input.id);
        const { id, ...data } = input;
        await db.updateItem(id, data);
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await requireCanEdit(ctx);
        await requireItemInActiveOrganization(ctx, input.id);
        await db.deleteItem(input.id);
        return { success: true };
      }),
  }),

  // ============ INCOME ============
  income: router({
    list: protectedProcedure
      .input(z.object({ monthId: z.number() }))
      .query(async ({ ctx, input }) => {
        await requireMonthInActiveOrganization(ctx, input.monthId);
        return db.getIncomeByMonth(input.monthId);
      }),
    create: protectedProcedure
      .input(z.object({
        monthId: z.number(),
        name: z.string(),
        value: z.string().optional(),
        received: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireCanEdit(ctx);
        await requireMonthInActiveOrganization(ctx, input.monthId);
        const { monthId, ...data } = input;
        return db.createIncome(monthId, data);
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        value: z.string().optional(),
        received: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireCanEdit(ctx);
        await requireIncomeInActiveOrganization(ctx, input.id);
        const { id, ...data } = input;
        await db.updateIncome(id, data);
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await requireCanEdit(ctx);
        await requireIncomeInActiveOrganization(ctx, input.id);
        await db.deleteIncome(input.id);
        return { success: true };
      }),
  }),

  // ============ BANK BALANCES ============
  balances: router({
    list: protectedProcedure
      .input(z.object({ monthId: z.number() }))
      .query(async ({ ctx, input }) => {
        await requireMonthInActiveOrganization(ctx, input.monthId);
        return db.getBalancesByMonth(input.monthId);
      }),
    update: protectedProcedure
      .input(z.object({
        monthId: z.number(),
        accountName: z.string(),
        balance: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireCanEdit(ctx);
        await requireMonthInActiveOrganization(ctx, input.monthId);
        await db.upsertBalance(input.monthId, input.accountName, input.balance);
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await requireCanEdit(ctx);
        const balance = await db.getBalanceById(input.id);
        if (!balance) throw new Error("Conta bancária não encontrada");
        await requireMonthInActiveOrganization(ctx, balance.monthId);
        await db.deleteBalance(input.id);
        return { success: true };
      }),
  }),

  // ============ GOALS ============
  goals: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const organization = await getActiveOrganization(ctx);
      return db.getGoalsByOrganization(organization.id);
    }),
    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        term: z.enum(["short", "medium", "long"]).optional(),
        targetValue: z.string().optional(),
        savedValue: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const organization = await requireCanEdit(ctx);
        return db.createGoal(organization.id, input);
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        term: z.enum(["short", "medium", "long"]).optional(),
        targetValue: z.string().optional(),
        savedValue: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireCanEdit(ctx);
        await requireGoalInActiveOrganization(ctx, input.id);
        const { id, ...data } = input;
        await db.updateGoal(id, data);
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await requireCanEdit(ctx);
        await requireGoalInActiveOrganization(ctx, input.id);
        await db.deleteGoal(input.id);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
