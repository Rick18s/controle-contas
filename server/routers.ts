import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import crypto from "crypto";
import { systemRouter } from "./_core/systemRouter";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import { adminProcedure, publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { hashPassword, verifyPassword } from "./_core/passwords";
import { z } from "zod";
import * as db from "./db";
import { getDb } from "./db";
import { months } from "../drizzle/schema";
import { invokeLLM } from "./_core/llm";
import { eq } from "drizzle-orm";
import { sendPasswordResetEmail } from "./_core/email";

const ACTIVE_ORG_COOKIE = "active_organization_id";
const REMEMBER_LOGIN_MS = 1000 * 60 * 60 * 24 * 30;

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

type QuickAddResult = {
  transactionType: "income" | "expense";
  name: string;
  value: number;
  cardId: number | null;
  newCardName: string | null;
};

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function cleanPriorityPrefix(value: string) {
  return value.replace(/^\[P[1-4]\]\s*/i, "");
}

function getBudgetMatchTerms(value: string) {
  const normalized = normalizeText(value);
  const terms = new Set(
    normalized
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .map(term => term.trim())
      .filter(term => term.length >= 4)
  );

  const aliases: Array<{ pattern: RegExp; terms: string[] }> = [
    { pattern: /\b(gasolina|posto|combustivel|alcool|etanol|diesel)\b/, terms: ["combustivel"] },
    { pattern: /\b(mercado|supermercado|feira|compras)\b/, terms: ["mercado", "feira"] },
    { pattern: /\b(energia|luz|eletricidade)\b/, terms: ["energia", "luz"] },
    { pattern: /\b(internet|wifi|fibra)\b/, terms: ["internet"] },
    { pattern: /\b(aluguel|locacao)\b/, terms: ["aluguel"] },
    { pattern: /\b(condominio)\b/, terms: ["condominio"] },
    { pattern: /\b(cabelo|barbeiro|salao)\b/, terms: ["cabelo"] },
    { pattern: /\b(faxina|limpeza|diarista)\b/, terms: ["faxina"] },
    { pattern: /\b(cartao|credito|nubank|itau|inter|picpay|c6|sofisa|xp)\b/, terms: ["cartao"] },
  ];

  aliases.forEach(alias => {
    if (alias.pattern.test(normalized)) alias.terms.forEach(term => terms.add(term));
  });

  return Array.from(terms);
}

function parseQuickAddText(text: string, cards: Awaited<ReturnType<typeof db.getCardsByMonth>>): QuickAddResult | null {
  const trimmed = text.trim();
  const moneyMatch = trimmed.match(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:reais|real|rs)?/i);
  if (!moneyMatch) return null;

  const rawValue = moneyMatch[1];
  const normalizedValue = rawValue.includes(",")
    ? rawValue.replace(/\./g, "").replace(",", ".")
    : rawValue;
  const value = Number.parseFloat(normalizedValue);
  if (!Number.isFinite(value) || value <= 0) return null;

  const before = trimmed.slice(0, moneyMatch.index).trim();
  const after = trimmed.slice((moneyMatch.index ?? 0) + moneyMatch[0].length).trim();
  const name = (before || after || "Lançamento").replace(/^(paguei|pagar|comprei|compra|recebi|receita|entrada|ganhei)\s+/i, "").trim();
  const normalized = normalizeText(trimmed);
  const transactionType: QuickAddResult["transactionType"] = /\b(recebi|receita|entrada|ganhei|cliente|faturamento)\b/.test(normalized)
    ? "income"
    : "expense";

  const cardHints: Array<{ pattern: RegExp; words: string[] }> = [
    { pattern: /\b(cartao|cartoes|credito|nubank|itau|inter|picpay|c6|sofisa|xp|sams)\b/, words: ["cart"] },
    { pattern: /\b(casa|aluguel|feira|mercado|energia|condominio|internet|combustivel|faxina)\b/, words: ["casa"] },
    { pattern: /\b(cabelo|pessoal|cuidados|saude|academia|roupa)\b/, words: ["pessoal", "cuidado"] },
    { pattern: /\b(escritorio|empresa|contabilidade|simples|imposto|cliente|funcionario|salario)\b/, words: ["empresa", "escritorio"] },
  ];
  const matchingHint = cardHints.find(hint => hint.pattern.test(normalized));
  const cardId = matchingHint
    ? cards.find(card => matchingHint.words.some(word => normalizeText(card.name).includes(word)))?.id ?? null
    : null;

  return {
    transactionType,
    name: name || "Lançamento",
    value,
    cardId,
    newCardName: transactionType === "expense" && !cardId ? "Outros" : null,
  };
}

function parseMoneyValue(value: string | number | null | undefined) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? "0").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoneyValue(value: number) {
  return value.toFixed(2);
}

function summarizeReceiptAccounts(
  transactions: Awaited<ReturnType<typeof db.listBankTransactionsBySource>>,
  fallback?: { accountName?: string | null; amount?: number }
) {
  const accounts = new Map<string, number>();
  transactions.forEach(transaction => {
    const accountName = transaction.accountName?.trim();
    if (!accountName) return;
    accounts.set(accountName, (accounts.get(accountName) ?? 0) + parseMoneyValue(transaction.amount));
  });

  if (accounts.size === 0 && fallback?.accountName && (fallback.amount ?? 0) > 0) {
    accounts.set(fallback.accountName, fallback.amount ?? 0);
  }

  return Array.from(accounts.entries())
    .map(([accountName, amount]) => ({ accountName, amount }))
    .filter(receipt => receipt.amount > 0.005)
    .sort((a, b) => b.amount - a.amount || a.accountName.localeCompare(b.accountName));
}

async function getIncomeReceiptAccounts(entry: Awaited<ReturnType<typeof db.getIncomeById>> extends infer T ? NonNullable<T> : never) {
  const transactions = await db.listBankTransactionsBySource(entry.monthId, "income_entry", entry.id);
  return summarizeReceiptAccounts(transactions, {
    accountName: entry.receivedAccountName,
    amount: parseMoneyValue(entry.receivedValue),
  });
}

async function reverseIncomeReceiptBalances(
  entry: Awaited<ReturnType<typeof db.getIncomeById>> extends infer T ? NonNullable<T> : never,
  meta: { userId: number; description: string }
) {
  const receipts = await getIncomeReceiptAccounts(entry);
  for (const receipt of receipts) {
    await adjustBankBalance(entry.monthId, receipt.accountName, -receipt.amount, {
      userId: meta.userId,
      description: meta.description,
      sourceType: "income_entry",
      sourceId: entry.id,
    });
  }
}

async function findPlannedExpenseMatch(monthId: number, result: QuickAddResult) {
  if (result.transactionType !== "expense") return null;

  const cards = await db.getCardsByMonth(monthId);
  const cardItems = await Promise.all(
    cards.map(async card => ({ card, items: await db.getItemsByCard(card.id) }))
  );
  const terms = getBudgetMatchTerms(result.name);
  const normalizedName = normalizeText(result.name);

  const candidates = cardItems.flatMap(({ card, items }) =>
    items.map(item => {
      const cleanName = cleanPriorityPrefix(item.name);
      const normalizedItemName = normalizeText(cleanName);
      const paidValue = parseMoneyValue(item.paidValue);
      const totalValue = parseMoneyValue(item.value);
      const remaining = Math.max(totalValue - paidValue, 0);
      const exactNameMatch = normalizedItemName === normalizedName;
      const termScore = terms.reduce((score, term) => {
        if (normalizedItemName.includes(term)) return score + 3;
        if (term.includes(normalizedItemName) && normalizedItemName.length >= 4) return score + 2;
        return score;
      }, 0);
      const cardScore = result.cardId === card.id ? 1 : 0;
      const openScore = remaining > 0 || totalValue === 0 ? 1 : 0;
      const score = (exactNameMatch ? 10 : 0) + termScore + cardScore + openScore;

      return { card, item, score, paidValue, totalValue };
    })
  )
    .filter(candidate => candidate.score >= 3)
    .sort((a, b) => b.score - a.score || (a.item.sortOrder ?? 0) - (b.item.sortOrder ?? 0));

  return candidates[0] ?? null;
}

function hashSecureToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function makeFingerprint(parts: Array<string | number | null | undefined>) {
  return crypto.createHash("sha256").update(parts.map(part => String(part ?? "")).join("|")).digest("hex");
}

async function adjustBankBalance(
  monthId: number,
  accountName: string | null | undefined,
  delta: number,
  meta?: {
    userId?: number | null;
    description?: string;
    sourceType?: string;
    sourceId?: number;
    fingerprint?: string | null;
  }
) {
  const normalizedAccountName = accountName?.trim();
  if (!normalizedAccountName || !Number.isFinite(delta) || delta === 0) return;
  const balances = await db.getBalancesByMonth(monthId);
  const existing = balances.find(balance => balance.accountName === normalizedAccountName);
  const current = parseMoneyValue(existing?.balance);
  const nextBalance = current + delta;
  await db.upsertBalance(monthId, normalizedAccountName, formatMoneyValue(nextBalance), existing?.sortOrder ?? balances.length);
  await db.createBankTransaction({
    monthId,
    userId: meta?.userId ?? null,
    accountName: normalizedAccountName,
    description: meta?.description ?? (delta >= 0 ? "Entrada registrada" : "Pagamento registrado"),
    movementType: delta >= 0 ? "income" : "expense",
    amount: formatMoneyValue(delta),
    balanceAfter: formatMoneyValue(nextBalance),
    sourceType: meta?.sourceType ?? null,
    sourceId: meta?.sourceId ?? null,
    fingerprint: meta?.fingerprint ?? null,
  });
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
      .input(z.object({ username: z.string().min(1), password: z.string().min(1), rememberMe: z.boolean().default(true) }))
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

        const token = await sdk.createSessionToken(user.openId, {
          name: user.name || username,
          expiresInMs: input.rememberMe ? REMEMBER_LOGIN_MS : undefined,
        });
        const cookieOptions = getSessionCookieOptions(ctx.req, input.rememberMe ? { maxAge: REMEMBER_LOGIN_MS } : {});
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
    requestPasswordReset: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ input }) => {
        const email = input.email.trim().toLowerCase();
        const user = await db.getUserByEmail(email);

        if (user?.id && user.active === 1) {
          const token = crypto.randomBytes(32).toString("hex");
          const tokenHash = hashSecureToken(token);
          const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
          await db.createPasswordResetToken(user.id, tokenHash, expiresAt);
          const resetUrl = `${ENV.appUrl.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
          await sendPasswordResetEmail(email, resetUrl);
        }

        return { success: true };
      }),
    resetPassword: publicProcedure
      .input(z.object({ token: z.string().min(20), newPassword: z.string().min(6) }))
      .mutation(async ({ input }) => {
        const token = await db.getValidPasswordResetToken(hashSecureToken(input.token));
        if (!token) throw new Error("Link inválido ou expirado");
        await db.updateUserPassword(token.userId, hashPassword(input.newPassword));
        await db.markPasswordResetTokenUsed(token.id);
        return { success: true };
      }),
    deleteAccount: protectedProcedure
      .input(z.object({ confirmation: z.literal("EXCLUIR") }))
      .mutation(async ({ ctx }) => {
        await db.deleteUserAccount(ctx.user.id);
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
        ctx.res.clearCookie(ACTIVE_ORG_COOKIE, { ...cookieOptions, maxAge: -1 });
        return { success: true };
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    register: publicProcedure
      .input(z.object({ name: z.string().min(2), email: z.string().email().optional().or(z.literal("")), username: z.string().min(3), password: z.string().min(6) }))
      .mutation(async ({ ctx, input }) => {
        const username = input.username.trim().toLowerCase();
        let existingUser = await db.getUserByUsername(username);
        if (existingUser) {
          throw new Error("Usuário já existe");
        }

        const user = await db.createPasswordUser({
          username,
          name: input.name,
          email: input.email ? input.email.trim().toLowerCase() : null,
          passwordHash: hashPassword(input.password),
          role: "user",
        });
        const organization = await db.getActiveOrganizationForUser(user.id, null);
        await db.seedStarterMonthData(user.id, organization.id);

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
        const username = input.username.trim().toLowerCase();
        const email = input.email ? input.email.trim().toLowerCase() : null;
        const existingUser = await db.getUserByUsername(username);
        
        if (existingUser) {
          const existingMembership = await db.getOrganizationMembership(existingUser.id, organization.id);
          if (existingMembership) {
            throw new Error("Este usuário já tem acesso a este centro.");
          }
          await db.addUserToOrganization(existingUser.id, organization.id, input.role);
          const newMembership = await db.getOrganizationMembership(existingUser.id, organization.id);
          return sanitizeOrganizationMember({ ...existingUser, membershipId: newMembership!.id, membershipRole: newMembership!.role, organizationId: organization.id });
        }

        const created = await db.createPasswordUser({
          username,
          name: input.name.trim(),
          email,
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
      if (userMonths.length === 0 && ctx.user.username !== ENV.localAuthUsername) {
        await db.seedStarterMonthData(ctx.user.id, organization.id);
        return db.getMonthsByOrganization(ctx.user.id, organization.id);
      }
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
        paidAccountName: z.string().optional().nullable(),
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
        paidAccountName: z.string().optional().nullable(),
        status: z.enum(["pago", "parcial", "pendente"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireCanEdit(ctx);
        const current = await requireItemInActiveOrganization(ctx, input.id);
        const { id, ...data } = input;
        const paymentTouched = data.paidValue !== undefined || data.paidAccountName !== undefined || data.status !== undefined;

        if (paymentTouched) {
          const nextStatus = data.status ?? current.status;
          const nextPaidValue = nextStatus === "pendente" && data.paidValue === undefined
            ? 0
            : parseMoneyValue(data.paidValue ?? current.paidValue);
          const nextAccount = nextStatus === "pendente"
            ? null
            : (data.paidAccountName !== undefined ? data.paidAccountName : current.paidAccountName)?.trim() || null;

          if (nextPaidValue > 0 && !nextAccount) {
            throw new Error("Escolha a conta bancária usada para pagar");
          }

          const card = await db.getCardById(current.cardId);
          if (card) {
            const previousPaidValue = current.paidAccountName ? parseMoneyValue(current.paidValue) : 0;
            if (previousPaidValue > 0 && current.paidAccountName) {
              await adjustBankBalance(card.monthId, current.paidAccountName, previousPaidValue, {
                userId: ctx.user.id,
                description: `Pagamento desfeito: ${current.name}`,
                sourceType: "expense_item",
                sourceId: current.id,
              });
            }
            if (nextPaidValue > 0 && nextAccount) {
              await adjustBankBalance(card.monthId, nextAccount, -nextPaidValue, {
                userId: ctx.user.id,
                description: `Pagamento: ${current.name}`,
                sourceType: "expense_item",
                sourceId: current.id,
              });
            }
          }

          data.paidValue = formatMoneyValue(nextPaidValue);
          data.paidAccountName = nextPaidValue > 0 ? nextAccount : null;
        }

        await db.updateItem(id, data);
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await requireCanEdit(ctx);
        const item = await requireItemInActiveOrganization(ctx, input.id);
        if (item.paidAccountName && parseMoneyValue(item.paidValue) > 0) {
          const card = await db.getCardById(item.cardId);
          if (card) await adjustBankBalance(card.monthId, item.paidAccountName, parseMoneyValue(item.paidValue), {
            userId: ctx.user.id,
            description: `Despesa removida: ${item.name}`,
            sourceType: "expense_item",
            sourceId: item.id,
          });
        }
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
        const entries = await db.getIncomeByMonth(input.monthId);
        return Promise.all(entries.map(async entry => ({
          ...entry,
          receiptAccounts: summarizeReceiptAccounts(
            await db.listBankTransactionsBySource(entry.monthId, "income_entry", entry.id),
            {
              accountName: entry.receivedAccountName,
              amount: parseMoneyValue(entry.receivedValue),
            }
          ),
        })));
      }),
    create: protectedProcedure
      .input(z.object({
        monthId: z.number(),
        name: z.string(),
        value: z.string().optional(),
        receivedValue: z.string().optional(),
        received: z.number().optional(),
        receivedAccountName: z.string().optional().nullable(),
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
        receivedValue: z.string().optional(),
        received: z.number().optional(),
        receivedAccountName: z.string().optional().nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireCanEdit(ctx);
        const current = await requireIncomeInActiveOrganization(ctx, input.id);
        const { id, ...data } = input;
        if (data.value !== undefined && parseMoneyValue(current.receivedValue) > 0) {
          const currentReceivedValue = parseMoneyValue(current.receivedValue);
          const nextValue = parseMoneyValue(data.value);
          const nextReceivedValue = Math.min(currentReceivedValue, nextValue);
          const delta = nextReceivedValue - currentReceivedValue;
          if (delta < 0) {
            const receipts = await getIncomeReceiptAccounts(current);
            let remainingToReverse = Math.abs(delta);
            for (const receipt of receipts) {
              if (remainingToReverse <= 0) break;
              const amountToReverse = Math.min(receipt.amount, remainingToReverse);
              remainingToReverse -= amountToReverse;
              await adjustBankBalance(current.monthId, receipt.accountName, -amountToReverse, {
                userId: ctx.user.id,
                description: `Ajuste de entrada: ${current.name}`,
                sourceType: "income_entry",
                sourceId: current.id,
              });
            }
          } else if (delta > 0 && current.receivedAccountName && current.receivedAccountName !== "Múltiplos bancos") {
            await adjustBankBalance(current.monthId, current.receivedAccountName, delta, {
              userId: ctx.user.id,
              description: `Ajuste de entrada: ${current.name}`,
              sourceType: "income_entry",
              sourceId: current.id,
            });
          }
          data.receivedValue = formatMoneyValue(nextReceivedValue);
          data.received = nextReceivedValue >= nextValue ? 1 : 0;
        }
        await db.updateIncome(id, data);
        return { success: true };
      }),
    setReceived: protectedProcedure
      .input(z.object({
        id: z.number(),
        received: z.number().refine(value => value === 0 || value === 1),
        accountName: z.string().optional().nullable(),
        amount: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireCanEdit(ctx);
        const entry = await requireIncomeInActiveOrganization(ctx, input.id);
        const totalValue = parseMoneyValue(entry.value);
        const currentReceivedValue = parseMoneyValue(entry.receivedValue);
        const amount = input.amount !== undefined ? parseMoneyValue(input.amount) : totalValue;
        const nextReceived = input.received;
        const nextAccount = input.accountName?.trim() || null;
        const previousAccount = entry.receivedAccountName || null;

        if (nextReceived === 1 && !nextAccount) {
          throw new Error("Escolha a conta bancária onde o valor entrou");
        }
        if (nextReceived === 1 && amount <= 0) {
          throw new Error("Informe um valor recebido maior que zero");
        }

        if (nextReceived === 0) {
          if (currentReceivedValue > 0) {
            await reverseIncomeReceiptBalances(entry, {
              userId: ctx.user.id,
              description: `Recebimento desfeito: ${entry.name}`,
            });
          }
          await db.updateIncome(input.id, {
            received: 0,
            receivedValue: "0.00",
            receivedAccountName: null,
          });
          return { success: true };
        }

        const nextReceivedValue = Math.min(
          totalValue > 0 ? totalValue : currentReceivedValue + amount,
          currentReceivedValue + amount
        );
        const amountApplied = Math.max(nextReceivedValue - currentReceivedValue, 0);
        if (amountApplied <= 0) {
          await db.updateIncome(input.id, {
            received: 1,
            receivedValue: formatMoneyValue(currentReceivedValue),
            receivedAccountName: nextAccount,
          });
          return { success: true };
        }

        await adjustBankBalance(entry.monthId, nextAccount, amountApplied, {
          userId: ctx.user.id,
          description: `Recebimento: ${entry.name}`,
          sourceType: "income_entry",
          sourceId: entry.id,
        });

        const finalTotalValue = totalValue > 0 ? totalValue : nextReceivedValue;

        await db.updateIncome(input.id, {
          value: formatMoneyValue(finalTotalValue),
          received: nextReceivedValue >= finalTotalValue ? 1 : 0,
          receivedValue: formatMoneyValue(nextReceivedValue),
          receivedAccountName: previousAccount && previousAccount !== nextAccount ? "Múltiplos bancos" : nextAccount,
        });
        return { success: true };
      }),
    registerReceipt: protectedProcedure
      .input(z.object({
        id: z.number(),
        amount: z.string(),
        accountName: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireCanEdit(ctx);
        const entry = await requireIncomeInActiveOrganization(ctx, input.id);
        const amount = parseMoneyValue(input.amount);
        const accountName = input.accountName.trim();
        if (amount <= 0) throw new Error("Informe um valor recebido maior que zero");
        if (!accountName) throw new Error("Escolha a conta bancária onde o valor entrou");

        const totalValue = parseMoneyValue(entry.value);
        const currentReceivedValue = parseMoneyValue(entry.receivedValue);
        const nextReceivedValue = Math.min(totalValue > 0 ? totalValue : currentReceivedValue + amount, currentReceivedValue + amount);
        const finalTotalValue = totalValue > 0 ? totalValue : nextReceivedValue;
        const amountApplied = Math.max(nextReceivedValue - currentReceivedValue, 0);
        if (amountApplied <= 0) throw new Error("Esta entrada já está totalmente recebida");

        await adjustBankBalance(entry.monthId, accountName, amountApplied, {
            userId: ctx.user.id,
            description: `Recebimento: ${entry.name}`,
            sourceType: "income_entry",
            sourceId: entry.id,
        });

        await db.updateIncome(input.id, {
          value: formatMoneyValue(finalTotalValue),
          received: nextReceivedValue >= finalTotalValue ? 1 : 0,
          receivedValue: formatMoneyValue(nextReceivedValue),
          receivedAccountName: entry.receivedAccountName && entry.receivedAccountName !== accountName ? "Múltiplos bancos" : accountName,
        });
        return { success: true, receivedValue: nextReceivedValue, remainingValue: Math.max(finalTotalValue - nextReceivedValue, 0) };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await requireCanEdit(ctx);
        const entry = await requireIncomeInActiveOrganization(ctx, input.id);
        if (parseMoneyValue(entry.receivedValue) > 0) {
          await reverseIncomeReceiptBalances(entry, {
            userId: ctx.user.id,
            description: `Entrada removida: ${entry.name}`,
          });
        }
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
        const accountName = input.accountName.trim();
        const balances = await db.getBalancesByMonth(input.monthId);
        const current = balances.find(balance => balance.accountName === accountName);
        const previousValue = parseMoneyValue(current?.balance);
        const nextValue = parseMoneyValue(input.balance);
        await db.upsertBalance(input.monthId, input.accountName, input.balance);
        const delta = nextValue - previousValue;
        if (Number.isFinite(delta) && delta !== 0) {
          await db.createBankTransaction({
            monthId: input.monthId,
            userId: ctx.user.id,
            accountName,
            description: current ? `Ajuste manual de saldo: ${accountName}` : `Conta bancária criada: ${accountName}`,
            movementType: "adjustment",
            amount: formatMoneyValue(delta),
            balanceAfter: formatMoneyValue(nextValue),
            sourceType: "bank_balance",
            sourceId: current?.id ?? null,
          });
        }
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
    transactions: protectedProcedure
      .input(z.object({ monthId: z.number() }))
      .query(async ({ ctx, input }) => {
        await requireMonthInActiveOrganization(ctx, input.monthId);
        return db.listBankTransactions(input.monthId);
      }),
  }),

  imports: router({
    saveOfxTransactions: protectedProcedure
      .input(z.object({
        monthId: z.number(),
        accountName: z.string().min(1),
        transactions: z.array(z.object({
          date: z.string().optional().default(""),
          description: z.string().min(1),
          value: z.number().positive(),
          type: z.enum(["income", "expense"]),
          rawValue: z.number(),
          fitId: z.string().optional().default(""),
        })).min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        await requireCanEdit(ctx);
        await requireMonthInActiveOrganization(ctx, input.monthId);

        const accountName = input.accountName.trim();
        if (!accountName) throw new Error("Informe a conta bancária do extrato");

        const cards = await db.getCardsByMonth(input.monthId);
        let importCardId = cards.find(card => normalizeText(card.name) === "importado ofx")?.id ?? null;
        let imported = 0;
        let skipped = 0;

        for (const transaction of input.transactions) {
          const fingerprint = makeFingerprint([
            input.monthId,
            accountName,
            transaction.fitId || transaction.date,
            transaction.description,
            transaction.rawValue,
          ]);

          const duplicate = await db.getBankTransactionByFingerprint(input.monthId, fingerprint);
          if (duplicate) {
            skipped += 1;
            continue;
          }

          const amount = Number(transaction.value);
          if (transaction.type === "income") {
            const created = await db.createIncome(input.monthId, {
              name: transaction.description,
              value: formatMoneyValue(amount),
              receivedValue: formatMoneyValue(amount),
              received: 1,
              receivedAccountName: accountName,
            });
            await adjustBankBalance(input.monthId, accountName, amount, {
              userId: ctx.user.id,
              description: `OFX entrada: ${transaction.description}`,
              sourceType: "ofx_income",
              sourceId: created.id,
              fingerprint,
            });
          } else {
            if (!importCardId) {
              const createdCard = await db.createCard(input.monthId, "Importado OFX", "📥");
              importCardId = createdCard.id;
            }
            const created = await db.createItem(importCardId, {
              name: transaction.description,
              dueDate: transaction.date,
              value: formatMoneyValue(amount),
              paidValue: formatMoneyValue(amount),
              paidAccountName: accountName,
              status: "pago",
            });
            await adjustBankBalance(input.monthId, accountName, -amount, {
              userId: ctx.user.id,
              description: `OFX saída: ${transaction.description}`,
              sourceType: "ofx_expense",
              sourceId: created.id,
              fingerprint,
            });
          }

          imported += 1;
        }

        return { imported, skipped };
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
  
  ai: router({
    quickAdd: protectedProcedure
      .input(z.object({ monthId: z.number(), text: z.string().min(1), accountName: z.string().optional().nullable() }))
      .mutation(async ({ ctx, input }) => {
        await requireCanEdit(ctx);
        await requireMonthInActiveOrganization(ctx, input.monthId);
        const cards = await db.getCardsByMonth(input.monthId);
        let result = parseQuickAddText(input.text, cards);
        
        if (!result) {
          const cardListText = cards.length > 0
            ? cards.map(c => `ID: ${c.id} - Name: ${c.name}`).join("\n")
            : "Nenhum cartão existente.";

          const prompt = `Você é um assistente financeiro inteligente. O usuário quer adicionar uma transação.
Texto digitado: "${input.text}"

Cartões/Categorias de Despesa disponíveis:
${cardListText}

Sua tarefa:
1. Decida se é "income" (receita/ganho) ou "expense" (despesa/gasto).
2. Extraia o nome da transação e o valor numérico.
3. Se for "expense", escolha o ID do cartão mais apropriado da lista acima.
4. Se for "expense" e não houver cartão adequado, retorne cardId como nulo e sugira um nome curto em "newCardName" (ex: "Pet", "Saúde").
5. Se for "income", cardId e newCardName devem ser nulos.`;

          try {
            const response = await invokeLLM({
              messages: [{ role: "user", content: prompt }],
              outputSchema: {
                name: "transaction_details",
                schema: {
                  type: "object",
                  properties: {
                    transactionType: { type: "string", enum: ["income", "expense"] },
                    name: { type: "string" },
                    value: { type: "number" },
                    cardId: { type: ["number", "null"] },
                    newCardName: { type: ["string", "null"] }
                  },
                  required: ["transactionType", "name", "value"]
                }
              }
            });
            const rawResult = response.choices[0].message.content as string;
            result = JSON.parse(rawResult) as QuickAddResult;
          } catch {
            throw new Error("Não consegui entender esse lançamento. Tente algo como: Pastel 40 reais");
          }
        }

        if (!result || !Number.isFinite(result.value) || result.value <= 0) {
          throw new Error("Informe um nome e valor. Exemplo: Pastel 40 reais");
        }

        if (result.transactionType === "income") {
          const created = await db.createIncome(input.monthId, {
            name: result.name,
            value: result.value.toFixed(2),
            received: 0,
            receivedAccountName: null,
          });
          return { type: "income", id: created.id, name: result.name, value: result.value };
        }

        const plannedExpense = await findPlannedExpenseMatch(input.monthId, result);
        if (plannedExpense) {
          const nextPaidValue = plannedExpense.paidValue + result.value;
          const nextTotalValue = Math.max(plannedExpense.totalValue, nextPaidValue);
          const nextStatus = nextPaidValue >= nextTotalValue ? "pago" : "parcial";
          const accountName = input.accountName?.trim() || plannedExpense.item.paidAccountName || null;

          await adjustBankBalance(input.monthId, input.accountName, -result.value, {
            userId: ctx.user.id,
            description: `Lançamento rápido: ${result.name}`,
            sourceType: "quick_add_budget",
            sourceId: plannedExpense.item.id,
          });

          await db.updateItem(plannedExpense.item.id, {
            value: formatMoneyValue(nextTotalValue),
            paidValue: formatMoneyValue(nextPaidValue),
            paidAccountName: accountName,
            status: nextStatus,
          });

          return {
            type: "expense",
            id: plannedExpense.item.id,
            cardId: plannedExpense.card.id,
            name: cleanPriorityPrefix(plannedExpense.item.name),
            value: result.value,
            matchedExisting: true,
            remaining: Math.max(nextTotalValue - nextPaidValue, 0),
          };
        }

        let cardId = result.cardId;
        if (!cardId && result.newCardName) {
          const existingCard = cards.find(card => normalizeText(card.name) === normalizeText(result.newCardName || ""));
          if (existingCard) {
            cardId = existingCard.id;
          } else {
            const newCard = await db.createCard(input.monthId, result.newCardName, "✨");
            cardId = newCard.id;
          }
        } else if (!cardId && cards.length > 0) {
          const outrosCard = cards.find(card => normalizeText(card.name).includes("outro"));
          cardId = outrosCard?.id ?? cards[0].id;
        } else if (!cardId) {
          const newCard = await db.createCard(input.monthId, "Outros", "📦");
          cardId = newCard.id;
        }

        await adjustBankBalance(input.monthId, input.accountName, -result.value, {
          userId: ctx.user.id,
          description: `Lançamento rápido: ${result.name}`,
          sourceType: "quick_add",
        });
        const created = await db.createItem(cardId, {
          name: result.name,
          value: result.value.toFixed(2),
          paidValue: result.value.toFixed(2),
          paidAccountName: input.accountName?.trim() || null,
          status: "pago",
        });
        return { type: "expense", id: created.id, cardId, name: result.name, value: result.value };
      }),
  }),
});

export type AppRouter = typeof appRouter;
