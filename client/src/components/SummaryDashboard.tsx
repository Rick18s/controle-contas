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
  const totalReceivedIncome = income.reduce((sum, e) => {
    const savedValue = parseMoney(e.receivedValue || "0.00");
    return sum + (savedValue > 0 ? savedValue : e.received === 1 ? parseMoney(e.value) : 0);
  }, 0);
  const totalBankBalance = balances.reduce((sum, b) => sum + parseMoney(b.balance), 0);
  
  // O fluxo de caixa agora inclui o que sobrou do mês anterior
  const cashFlow = totalBankBalance + totalReceivedIncome + carryover - totalRemaining;
  const expectedIncome = Math.max(totalIncome - totalReceivedIncome, 0);
  const availableNow = totalBankBalance + carryover;
  const projectedAvailable = availableNow + expectedIncome;
  const projectedAfterBills = projectedAvailable - totalRemaining;

  const statusText = projectedAfterBills >= 0
    ? `Depois das entradas pendentes, sobra ${formatBrl(projectedAfterBills)}.`
    : `Mesmo com as entradas pendentes, faltarão ${formatBrl(Math.abs(projectedAfterBills))}.`;

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
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.1fr_1.9fr]">
        <div className={`rounded-2xl border p-5 shadow-sm ${projectedAfterBills >= 0 ? "border-primary/30 bg-primary/10" : "border-red-500/30 bg-red-950/20"}`}>
          <div className="text-[11px] font-mono uppercase tracking-widest text-zinc-400">Situação do mês</div>
          <div className={`mt-2 text-2xl font-bold font-mono sm:text-3xl ${projectedAfterBills >= 0 ? "text-primary" : "text-red-400"}`}>
            {formatBrl(projectedAfterBills)}
          </div>
          <p className="mt-2 text-sm text-zinc-300">
            {statusText}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-mono">
            <MiniMetric label="Disponível agora" value={availableNow} tone={availableNow >= 0 ? "good" : "bad"} />
            <MiniMetric label="Contas abertas" value={totalRemaining} tone="info" />
          </div>
        </div>

        <div className="rounded-2xl border border-white/5 bg-zinc-900/50 p-4 shadow-sm">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-xs font-mono uppercase tracking-widest text-primary">Resumo autoexplicativo</h3>
              <p className="text-xs text-zinc-400">Da esquerda para direita: dinheiro disponível, dinheiro que falta entrar e compromissos do mês.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <SummaryGroup
              title="Dinheiro disponível"
              description="O que já está nos bancos, somado ao saldo anterior."
              items={[
                { label: "Saldos nos bancos", value: totalBankBalance },
                { label: "Saldo anterior", value: carryover },
                { label: "Disponível agora", value: availableNow, strong: true },
              ]}
            />
            <SummaryGroup
              title="Entradas"
              description="Receitas do mês, separando o que já entrou do que ainda está previsto."
              items={[
                { label: "Já recebido", value: totalReceivedIncome, tone: "good" },
                { label: "Ainda previsto", value: expectedIncome },
                { label: "Total previsto", value: totalIncome, strong: true },
              ]}
            />
            <SummaryGroup
              title="Contas do mês"
              description="Tudo que já foi pago mais o que ainda precisa pagar."
              items={[
                { label: "Já pago", value: totalPaid, tone: "good" },
                { label: "Ainda falta pagar", value: totalRemaining, tone: "bad" },
                { label: "Total do mês", value: totalMonth, strong: true },
              ]}
            />
          </div>
        </div>
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

type Tone = "default" | "good" | "bad" | "info";

function toneClass(tone: Tone = "default") {
  if (tone === "good") return "text-green-400";
  if (tone === "bad") return "text-red-400";
  if (tone === "info") return "text-blue-200";
  return "text-zinc-100";
}

function MiniMetric({ label, value, tone = "default" }: { label: string; value: number; tone?: Tone }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/20 p-3">
      <div className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</div>
      <div className={`mt-1 font-bold ${toneClass(tone)}`}>{formatBrl(value)}</div>
    </div>
  );
}

function SummaryGroup({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: Array<{ label: string; value: number; strong?: boolean; tone?: Tone }>;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-black/20 p-4">
      <h4 className="text-sm font-semibold text-white">{title}</h4>
      <p className="mt-1 min-h-[32px] text-xs leading-5 text-zinc-500">{description}</p>
      <div className="mt-3 space-y-2">
        {items.map(item => (
          <div key={item.label} className={`flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 ${item.strong ? "bg-white/5" : ""}`}>
            <span className="text-xs text-zinc-400">{item.label}</span>
            <span className={`text-sm font-bold font-mono ${item.strong ? "text-primary" : toneClass(item.tone)}`}>
              {formatBrl(item.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
