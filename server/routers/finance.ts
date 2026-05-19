import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";
import { getDb } from "../db";
import { months } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const financeRouter = router({
  // ============ MONTHS ============
  months: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getMonthsByUser(ctx.user.id);
    }),
    create: protectedProcedure
      .input(z.object({ label: z.string().regex(/^\d{4}-\d{2}$/) }))
      .mutation(async ({ ctx, input }) => {
        const month = await db.createMonth(ctx.user.id, input.label);
        await db.initDefaultBalances(month.id);
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
        return db.copyMonthData(ctx.user.id, input.sourceMonthId, input);
      }),
    importText: protectedProcedure
      .input(z.object({ monthId: z.number(), text: z.string().min(1), replaceExisting: z.boolean().default(true) }))
      .mutation(async ({ input }) => {
        return db.importMonthText(input.monthId, input.text, input.replaceExisting);
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteMonth(input.id);
        return { success: true };
      }),
    // Migrate seeded data to the real user
    claimSeedData: protectedProcedure.mutation(async ({ ctx }) => {
      const database = await getDb();
      if (!database) throw new Error("DB not available");
      // Find months owned by userId=1 (seed user) that don't belong to current user
      const seedMonths = await database.select().from(months).where(eq(months.userId, 1));
      if (seedMonths.length > 0) {
        await database.update(months).set({ userId: ctx.user.id }).where(eq(months.userId, 1));
        return { migrated: seedMonths.length };
      }
      return { migrated: 0 };
    }),
  }),

  // ============ EXPENSE CARDS ============
  cards: router({
    list: protectedProcedure
      .input(z.object({ monthId: z.number() }))
      .query(async ({ input }) => {
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
      .mutation(async ({ input }) => {
        return db.createCard(input.monthId, input.name, input.icon || "📋");
      }),
    update: protectedProcedure
      .input(z.object({ id: z.number(), name: z.string().optional(), icon: z.string().optional() }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updateCard(id, data);
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
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
      .mutation(async ({ input }) => {
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
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updateItem(id, data);
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteItem(input.id);
        return { success: true };
      }),
  }),

  // ============ INCOME ============
  income: router({
    list: protectedProcedure
      .input(z.object({ monthId: z.number() }))
      .query(async ({ input }) => {
        return db.getIncomeByMonth(input.monthId);
      }),
    create: protectedProcedure
      .input(z.object({
        monthId: z.number(),
        name: z.string(),
        value: z.string().optional(),
        received: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
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
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updateIncome(id, data);
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteIncome(input.id);
        return { success: true };
      }),
  }),

  // ============ BANK BALANCES ============
  balances: router({
    list: protectedProcedure
      .input(z.object({ monthId: z.number() }))
      .query(async ({ input }) => {
        return db.getBalancesByMonth(input.monthId);
      }),
    update: protectedProcedure
      .input(z.object({
        monthId: z.number(),
        accountName: z.string(),
        balance: z.string(),
      }))
      .mutation(async ({ input }) => {
        await db.upsertBalance(input.monthId, input.accountName, input.balance);
        return { success: true };
      }),
  }),
});
