import { trpc } from "@/lib/trpc";
import { formatBrl, getPaidAmount, parseMoney } from "@/lib/money";

export default function SummaryDashboard({ monthId }: { monthId: number }) {
  const cardsQuery = trpc.cards.list.useQuery({ monthId });
  const incomeQuery = trpc.income.list.useQuery({ monthId });
  const balancesQuery = trpc.balances.list.useQuery({ monthId });
  const analyticsQuery = trpc.months.getAnalytics.useQuery();

  const cards = cardsQuery.data || [];
  const summaryCardsSource = cards.filter(card => card.name.toLowerCase().includes("escritório"));
  const cardsForSummary = summaryCardsSource.length > 0 ? summaryCardsSource : cards;
  const income = incomeQuery.data || [];
  const balances = balancesQuery.data || [];

  // Calculate totals
  let totalExpenses = 0;
  let totalPaid = 0;
  cardsForSummary.forEach(card => {
    card.items.forEach(item => {
      totalExpenses += parseMoney(item.value);
      totalPaid += getPaidAmount(item);
    });
  });

  const analytics = analyticsQuery.data || [];
  const currentMonthAnalytics = analytics.find(a => a.monthId === monthId);
  const carryover = currentMonthAnalytics?.previousCarryover || 0;

  const totalRemaining = Math.max(totalExpenses - totalPaid, 0);
  const totalIncome = income.reduce((sum, e) => sum + parseMoney(e.value), 0);
  const totalReceivedIncome = income.filter(e => e.received === 1).reduce((sum, e) => sum + parseMoney(e.value), 0);
  const totalBankBalance = balances.reduce((sum, b) => sum + parseMoney(b.balance), 0);
  
  // O fluxo de caixa agora inclui o que sobrou do mês anterior
  const cashFlow = totalBankBalance + totalReceivedIncome + carryover - totalRemaining;

  const summaryCards = [
    { label: "Saldo Anterior", value: formatBrl(carryover), color: carryover >= 0 ? "text-primary" : "text-destructive" },
    { label: "Entradas Previstas", value: formatBrl(totalIncome), color: "text-primary" },
    { label: "Entradas Recebidas", value: formatBrl(totalReceivedIncome), color: "text-primary" },
    { label: "Total Despesas", value: formatBrl(totalExpenses), color: "text-blue-100" },
    { label: "Restante a Pagar", value: formatBrl(totalRemaining), color: "text-destructive" },
    { label: "Fluxo de Caixa", value: formatBrl(cashFlow), color: cashFlow >= 0 ? "text-primary" : "text-destructive" },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-6">
      {summaryCards.map((card, idx) => (
        <div
          key={idx}
          className="rounded-2xl border border-white/5 bg-zinc-900/50 backdrop-blur-md p-3 text-center shadow-sm sm:p-4 transition-all hover:bg-zinc-800/50"
        >
          <div className="mb-1 text-[10px] font-medium tracking-wide text-zinc-400">
            {card.label}
          </div>
          <div className={`text-xs font-bold font-mono sm:text-sm md:text-base ${card.color}`} >
            {card.value}
          </div>
        </div>
      ))}
    </div>
  );
}
