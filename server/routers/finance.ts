import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";
import { getDb } from "../db";
import { months } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";

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

  // ============ AI ============
  ai: router({
    quickAdd: protectedProcedure
      .input(z.object({ monthId: z.number(), text: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const cards = await db.getCardsByMonth(input.monthId);
        
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
        let result;
        try {
          result = JSON.parse(rawResult);
        } catch (e) {
          throw new Error("Falha ao interpretar resposta da IA");
        }

        if (result.transactionType === "income") {
          return db.createIncome(input.monthId, { name: result.name, value: String(result.value), received: 0 });
        } else {
          let cardId = result.cardId;
          if (!cardId && result.newCardName) {
            const newCard = await db.createCard(input.monthId, result.newCardName, "✨");
            cardId = newCard.id;
          } else if (!cardId && cards.length > 0) {
            cardId = cards[0].id; // Fallback
          } else if (!cardId) {
             const newCard = await db.createCard(input.monthId, "Outros", "📦");
             cardId = newCard.id;
          }
          return db.createItem(cardId, { name: result.name, value: String(result.value), status: "pendente" });
        }
      }),
  }),
});
