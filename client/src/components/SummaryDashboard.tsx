import { trpc } from "@/lib/trpc";
import { formatBrl, getPaidAmount, parseMoney } from "@/lib/money";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell } from "recharts";

export default function SummaryDashboard({ monthId }: { monthId: number }) {
  const cardsQuery = trpc.cards.list.useQuery({ monthId });
  const incomeQuery = trpc.income.list.useQuery({ monthId });
  const balancesQuery = trpc.balances.list.useQuery({ monthId });
  const analyticsQuery = trpc.months.getAnalytics.useQuery();

  const cards = cardsQuery.data || [];
  const income = incomeQuery.data || [];
  const balances = balancesQuery.data || [];

  // Calculate totals
  let totalExpenses = 0;
  let totalPaid = 0;
  cards.forEach(card => {
    card.items.forEach(item => {
      totalExpenses += parseMoney(item.value);
      totalPaid += getPaidAmount(item);
    });
  });

  const analytics = analyticsQuery.data || [];
  const currentMonthAnalytics = analytics.find(a => a.monthId === monthId);
  const carryover = currentMonthAnalytics?.previousCarryover || 0;

  const totalRemaining = Math.max(totalExpenses - totalPaid, 0);
  const totalMonth = totalPaid + totalRemaining;
  const totalIncome = income.reduce((sum, e) => sum + parseMoney(e.value), 0);
  const totalReceivedIncome = income.filter(e => e.received === 1).reduce((sum, e) => sum + parseMoney(e.value), 0);
  const totalBankBalance = balances.reduce((sum, b) => sum + parseMoney(b.balance), 0);
  
  // O fluxo de caixa agora inclui o que sobrou do mês anterior
  const cashFlow = totalBankBalance + totalReceivedIncome + carryover - totalRemaining;

  const summaryCards = [
    { label: "Saldo Anterior", value: formatBrl(carryover), color: carryover >= 0 ? "text-primary" : "text-destructive" },
    { label: "Saldo Bancário", value: formatBrl(totalBankBalance), color: totalBankBalance >= 0 ? "text-primary" : "text-destructive" },
    { label: "Entradas Previstas", value: formatBrl(totalIncome), color: "text-primary" },
    { label: "Entradas Recebidas", value: formatBrl(totalReceivedIncome), color: "text-primary" },
    { label: "Pago no Mês", value: formatBrl(totalPaid), color: "text-green-400" },
    { label: "Previsto a Pagar", value: formatBrl(totalRemaining), color: "text-blue-200" },
    { label: "Total do Mês", value: formatBrl(totalMonth), color: "text-blue-100" },
    { label: "Fluxo de Caixa", value: formatBrl(cashFlow), color: cashFlow >= 0 ? "text-primary" : "text-destructive" },
  ];

  const pieData = cards.map(card => {
    const value = card.items.reduce((sum, item) => sum + parseMoney(item.value), 0);
    return { name: card.name, value };
  }).filter(d => d.value > 0).sort((a, b) => b.value - a.value);

  const PIE_COLORS = ['#a855f7', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#6366f1', '#14b8a6', '#f43f5e'];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-zinc-900 border border-white/10 p-3 rounded-lg shadow-xl">
          {label && <p className="text-zinc-300 font-mono text-xs mb-1 border-b border-white/10 pb-1">{label}</p>}
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-[10px] font-mono font-bold" style={{ color: entry.color || entry.payload.fill }}>
              {entry.name}: {formatBrl(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4 xl:grid-cols-8">
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Area Chart: Portfolio Growth */}
        <div className="lg:col-span-2 rounded-2xl border border-white/5 bg-zinc-900/50 backdrop-blur-md p-4 shadow-sm">
          <h3 className="text-xs font-mono uppercase tracking-widest text-primary mb-4 flex items-center justify-between">
            <span>Evolução de Saldo</span>
            <span className="text-[10px] text-zinc-500 font-normal">Meses Fechados</span>
          </h3>
          <div className="h-[280px] w-full">
            {analytics.length === 0 ? (
              <div className="h-full w-full flex items-center justify-center"><p className="text-zinc-500 text-xs font-mono">Sem dados históricos</p></div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analytics} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCarryover" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="label" tickFormatter={(val) => val.split('-').reverse().join('/')} stroke="#71717a" fontSize={10} fontFamily="monospace" tickMargin={10} />
                  <YAxis stroke="#71717a" fontSize={10} fontFamily="monospace" tickFormatter={(val) => `R$ ${val / 1000}k`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="finalCarryover" name="Saldo Final" stroke="#a855f7" strokeWidth={3} fill="url(#colorCarryover)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Pie Chart: Expenses Breakdown */}
        <div className="rounded-2xl border border-white/5 bg-zinc-900/50 backdrop-blur-md p-4 shadow-sm">
          <h3 className="text-xs font-mono uppercase tracking-widest text-primary mb-4 flex items-center justify-between">
            <span>Despesas do Mês</span>
          </h3>
          <div className="h-[280px] w-full flex items-center justify-center relative">
            {pieData.length === 0 ? (
              <p className="text-zinc-500 text-xs font-mono">Sem despesas registradas</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} innerRadius={65} outerRadius={85} paddingAngle={4} dataKey="value" stroke="none">
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            )}
            {pieData.length > 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none flex-col mt-4">
                <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest mb-1">Total</span>
                <span className="text-sm font-bold text-white">{formatBrl(pieData.reduce((sum, item) => sum + item.value, 0))}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
