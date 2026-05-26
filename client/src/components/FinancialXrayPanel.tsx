import { trpc } from "@/lib/trpc";
import { formatBrl, getPaidAmount, getRemainingAmount, parseMoney } from "@/lib/money";
import { AlertTriangle, ArrowRight, BrainCircuit, CheckCircle2, CircleDollarSign, Landmark, ShieldCheck, Snowflake, Target } from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";

type ExpenseItem = {
  id: number;
  name: string;
  value: string;
  paidValue: string;
  status: string;
  paymentMode?: string | null;
};

type DebtItem = {
  id: number;
  category: string;
  name: string;
  remaining: number;
  isFiscalPriority: boolean;
};

type LifestyleBucket = "Burocracia" | "Qualidade de Vida" | "Luxo";
type HealthLevel = "critical" | "attention" | "building" | "protected";

const CREDIT_TERMS = [
  "cartao",
  "cartoes",
  "credito",
  "nubank",
  "nu",
  "itau",
  "inter",
  "picpay",
  "pic",
  "c6",
  "sofisa",
  "xp",
  "sam",
  "caixa",
];

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function cleanItemName(value: string) {
  return value.replace(/^\[P[1-4]\]\s*/i, "");
}

function isCreditDebt(category: string, itemName: string) {
  const text = normalizeText(`${category} ${itemName}`);
  return CREDIT_TERMS.some(term => text.includes(term)) || text.includes("fatura");
}

function isFiscalDebt(itemName: string) {
  const text = normalizeText(itemName);
  return text.includes("iptu") || text.includes("imposto") || text.includes("simples nacional");
}

function classifyExpense(category: string, itemName: string): LifestyleBucket {
  const text = normalizeText(`${category} ${itemName}`);

  if (
    /\b(aluguel|condominio|energia|agua|internet|telefone|iptu|imposto|simples|contabilidade|seguro|emprestimo|financiamento|parcela|cartao|fatura|casa|manutencao)\b/.test(text)
  ) {
    return "Burocracia";
  }

  if (
    /\b(feira|mercado|combustivel|gasolina|saude|medico|cabelo|cuidados|faxina|educacao|familia|mae|alimentacao)\b/.test(text)
  ) {
    return "Qualidade de Vida";
  }

  return "Luxo";
}

function lifestyleDescription(bucket: LifestyleBucket) {
  if (bucket === "Burocracia") return "Compromissos fixos, impostos, moradia, dívidas e estrutura básica.";
  if (bucket === "Qualidade de Vida") return "Gastos que sustentam bem-estar, rotina, cuidado e vida prática.";
  return "Desejos, extras e escolhas que podem ser cortadas primeiro em aperto de caixa.";
}

function bucketTone(bucket: LifestyleBucket) {
  if (bucket === "Burocracia") return "border-blue-400/20 bg-blue-950/20 text-blue-100";
  if (bucket === "Qualidade de Vida") return "border-green-400/20 bg-green-950/20 text-green-100";
  return "border-purple-400/20 bg-purple-950/20 text-purple-100";
}

function buildSnowballPlan(debts: DebtItem[], availableCash: number) {
  const ordered = [...debts].sort((a, b) => {
    if (a.isFiscalPriority !== b.isFiscalPriority) return a.isFiscalPriority ? -1 : 1;
    if (a.remaining !== b.remaining) return a.remaining - b.remaining;
    return a.name.localeCompare(b.name);
  });

  let cash = Math.max(availableCash, 0);
  const plan = ordered.map(debt => {
    const paid = cash >= debt.remaining ? debt.remaining : 0;
    const status = paid >= debt.remaining ? "quitar" : "aguardar";
    cash = Math.max(cash - paid, 0);
    return { ...debt, suggestedPayment: paid, status, cashAfter: cash };
  });

  return { ordered, plan, reserveAfterPlan: cash };
}

function getHealthLevel(currentEquity: number, pms: number, pmr: number): HealthLevel {
  if (currentEquity >= pmr) return "protected";
  if (currentEquity >= pms) return "building";
  if (currentEquity >= pms * 0.35) return "attention";
  return "critical";
}

function healthCopy(level: HealthLevel) {
  if (level === "protected") {
    return {
      title: "Você está protegido para imprevistos grandes.",
      tone: "green" as const,
      explanation: "Seu patrimônio já cobre a reserva recomendada para renda variável. O próximo passo é acelerar independência financeira.",
    };
  }
  if (level === "building") {
    return {
      title: "Você já tem colchão mínimo, mas ainda precisa reforçar.",
      tone: "primary" as const,
      explanation: "A reserva de sobrevivência está coberta. Agora o foco é chegar na reserva recomendada, que dá mais fôlego para meses ruins.",
    };
  }
  if (level === "attention") {
    return {
      title: "Você tem alguma proteção, mas ainda está exposto.",
      tone: "red" as const,
      explanation: "Qualquer atraso forte de receita pode virar problema. Reduza dívidas pequenas e pare de aumentar compromissos fixos.",
    };
  }
  return {
    title: "Alerta: sua margem de segurança está baixa.",
    tone: "red" as const,
    explanation: "Antes de pensar em crescimento, o plano precisa proteger caixa, quitar dívidas elimináveis e montar reserva.",
  };
}

function shortMetricMeaning(label: string) {
  if (label === "PMS") return "mínimo para sobreviver alguns meses sem renda";
  if (label === "PMR") return "reserva recomendada para quem tem renda variável";
  if (label === "PI") return "referência de patrimônio esperado para sua idade";
  return "capital estimado para viver de renda com retirada conservadora";
}

function buildActionSteps(params: {
  availableCash: number;
  pendingExpense: number;
  reserveGap: number;
  paidDebtsCount: number;
  reserveAfterPlan: number;
  luxTotal: number;
  monthlyExpense: number;
}) {
  const steps: Array<{ title: string; detail: string; tone?: "green" | "red" | "primary" }> = [];

  if (params.availableCash <= 0) {
    steps.push({
      title: "1. Não distribua pagamentos ainda",
      detail: "Sem caixa disponível, o melhor uso do raio-x é escolher quais contas ficam na primeira fila quando o dinheiro entrar.",
      tone: "red",
    });
  } else if (params.paidDebtsCount > 0) {
    steps.push({
      title: "1. Quite as menores faturas listadas",
      detail: `Com o caixa informado, dá para eliminar ${params.paidDebtsCount} credor(es). Isso simplifica o mês e reduz risco de esquecimento.`,
      tone: "green",
    });
  } else {
    steps.push({
      title: "1. Guarde o caixa para a primeira conta crítica",
      detail: "O dinheiro informado não fecha nenhuma fatura inteira pela bola de neve. Evite pulverizar pagamentos sem estratégia.",
      tone: "primary",
    });
  }

  if (params.reserveAfterPlan > 0) {
    steps.push({
      title: "2. Sobra vira reserva",
      detail: `Depois das quitações sugeridas, mantenha ${formatBrl(params.reserveAfterPlan)} parado como segurança.`,
      tone: "green",
    });
  } else {
    steps.push({
      title: "2. Não conte com sobra",
      detail: "Todo o caixa informado será consumido pelo plano. Só assuma novos gastos depois de confirmar entradas recebidas.",
      tone: "red",
    });
  }

  const luxPercent = params.monthlyExpense > 0 ? (params.luxTotal / params.monthlyExpense) * 100 : 0;
  steps.push({
    title: "3. Procure cortes em Luxo primeiro",
    detail: luxPercent > 5
      ? `Luxo representa ${luxPercent.toFixed(1)}% do mês. É o primeiro bloco para ajustar sem desmontar sua rotina.`
      : "Luxo está baixo. Se precisar cortar, revise burocracias e assinaturas fixas com cuidado.",
    tone: luxPercent > 5 ? "primary" : "green",
  });

  if (params.reserveGap > 0) {
    steps.push({
      title: "4. Meta principal: completar o PMS",
      detail: `A reserva mínima ainda precisa de ${formatBrl(params.reserveGap)}. Enquanto ela não existir, crescimento vem depois de proteção.`,
      tone: "red",
    });
  } else {
    steps.push({
      title: "4. Próxima meta: PMR",
      detail: "Com o PMS coberto, direcione excedentes para uma reserva mais robusta antes de aumentar padrão de vida.",
      tone: "green",
    });
  }

  return steps;
}

export default function FinancialXrayPanel({ monthId }: { monthId: number }) {
  const cardsQuery = trpc.cards.list.useQuery({ monthId });
  const incomeQuery = trpc.income.list.useQuery({ monthId });
  const balancesQuery = trpc.balances.list.useQuery({ monthId });
  const [availableCashInput, setAvailableCashInput] = useState("");
  const [ageInput, setAgeInput] = useState("35");
  const [equityInput, setEquityInput] = useState("5000.00");

  const cards = cardsQuery.data || [];
  const income = incomeQuery.data || [];
  const balances = balancesQuery.data || [];

  const bankBalance = balances.reduce((sum, balance) => sum + parseMoney(balance.balance), 0);
  const availableCash = availableCashInput.trim() ? parseMoney(availableCashInput) : bankBalance;
  const age = Math.max(parseMoney(ageInput), 0);
  const currentEquity = Math.max(parseMoney(equityInput), 0);

  const analysis = useMemo(() => {
    const allExpenses = cards.flatMap(card =>
      card.items.map(item => ({
        id: item.id,
        category: card.name,
        name: cleanItemName(item.name),
        rawName: item.name,
        item: item as ExpenseItem,
        total: parseMoney(item.value),
        paid: getPaidAmount(item),
        remaining: getRemainingAmount(item),
        paymentMode: item.paymentMode || "bank",
      }))
    );

    const monthlyExpense = allExpenses.reduce((sum, expense) => sum + expense.total, 0);
    const pendingExpense = allExpenses.reduce((sum, expense) => sum + expense.remaining, 0);
    const paidExpense = allExpenses.reduce((sum, expense) => sum + expense.paid, 0);

    const receivedIncome = income.reduce((sum, entry) => {
      const receivedValue = parseMoney(entry.receivedValue || "0.00");
      return sum + (receivedValue > 0 ? receivedValue : entry.received === 1 ? parseMoney(entry.value) : 0);
    }, 0);
    const expectedIncome = income.reduce((sum, entry) => sum + parseMoney(entry.value), 0);

    const debts = allExpenses
      .filter(expense => expense.remaining > 0 && isCreditDebt(expense.category, expense.name))
      .map(expense => ({
        id: expense.id,
        category: expense.category,
        name: expense.name,
        remaining: expense.remaining,
        isFiscalPriority: isFiscalDebt(expense.name),
      }));

    const buckets = allExpenses.reduce<Record<LifestyleBucket, { total: number; items: number }>>((acc, expense) => {
      const bucket = classifyExpense(expense.category, expense.name);
      acc[bucket].total += expense.total;
      acc[bucket].items += 1;
      return acc;
    }, {
      Burocracia: { total: 0, items: 0 },
      "Qualidade de Vida": { total: 0, items: 0 },
      Luxo: { total: 0, items: 0 },
    });

    const snowball = buildSnowballPlan(debts, availableCash);
    const pms = 6 * monthlyExpense;
    const pmr = 20 * monthlyExpense;
    const pi = 0.10 * (12 * monthlyExpense) * age;
    const pnif = (12 * monthlyExpense) / 0.06;

    return {
      allExpenses,
      monthlyExpense,
      pendingExpense,
      paidExpense,
      receivedIncome,
      expectedIncome,
      debts,
      buckets,
      snowball,
      metrics: { pms, pmr, pi, pnif },
      gaps: {
        pms: Math.max(pms - currentEquity, 0),
        pmr: Math.max(pmr - currentEquity, 0),
        pi: Math.max(pi - currentEquity, 0),
        pnif: Math.max(pnif - currentEquity, 0),
      },
    };
  }, [availableCash, cards, currentEquity, income, age]);

  const health = healthCopy(getHealthLevel(currentEquity, analysis.metrics.pms, analysis.metrics.pmr));
  const paidDebtsCount = analysis.snowball.plan.filter(item => item.status === "quitar").length;
  const actionSteps = buildActionSteps({
    availableCash,
    pendingExpense: analysis.pendingExpense,
    reserveGap: analysis.gaps.pms,
    paidDebtsCount,
    reserveAfterPlan: analysis.snowball.reserveAfterPlan,
    luxTotal: analysis.buckets.Luxo.total,
    monthlyExpense: analysis.monthlyExpense,
  });
  const xrayStatus = currentEquity >= analysis.metrics.pms
    ? "mínimo protegido"
    : `${formatBrl(analysis.gaps.pms)} até o mínimo`;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className={`rounded-3xl border p-5 shadow-sm sm:rounded-2xl ${health.tone === "green" ? "border-green-500/25 bg-green-950/20" : health.tone === "red" ? "border-red-500/25 bg-red-950/20" : "border-primary/20 bg-primary/10"}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-primary">
              <BrainCircuit className="h-4 w-4" />
              Raio-X financeiro
            </h2>
            <h3 className="mt-3 max-w-3xl text-2xl font-bold text-white">{health.title}</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">{health.explanation}</p>
          </div>
          <div className="grid grid-cols-1 gap-2 text-xs min-[420px]:grid-cols-3 lg:min-w-[520px]">
            <XrayInput label="Caixa disponível" value={availableCashInput} onChange={setAvailableCashInput} placeholder={bankBalance.toFixed(2)} />
            <XrayInput label="Idade referência" value={ageInput} onChange={setAgeInput} placeholder="35" />
            <XrayInput label="Patrimônio atual" value={equityInput} onChange={setEquityInput} placeholder="5000.00" />
          </div>
        </div>
      </div>

      <section className="rounded-3xl border border-white/5 bg-zinc-900 p-4 sm:rounded-2xl">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
              <Target className="h-4 w-4" />
              O que fazer agora
            </h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Ordem prática para uma pessoa que não quer interpretar fórmula: pagar, proteger e depois crescer.
            </p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-black/20 px-3 py-2 text-xs text-muted-foreground">
            Caixa analisado: <strong className="text-white">{formatBrl(availableCash)}</strong>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 lg:grid-cols-4">
          {actionSteps.map(step => (
            <ActionStep key={step.title} {...step} />
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        <MetricCard icon={CircleDollarSign} label="Seu custo de vida" value={formatBrl(analysis.monthlyExpense)} helper="Quanto este mês exige para manter o padrão atual." />
        <MetricCard icon={Landmark} label="Entradas do mês" value={formatBrl(analysis.expectedIncome)} helper={`Já recebido: ${formatBrl(analysis.receivedIncome)}.`} />
        <MetricCard icon={ShieldCheck} label="Reserva mínima" value={xrayStatus} helper="A primeira meta é aguentar meses ruins sem se desesperar." tone={analysis.gaps.pms <= 0 ? "green" : "red"} />
        <MetricCard icon={Snowflake} label="Credores elimináveis" value={`${paidDebtsCount}/${analysis.debts.length}`} helper={`Sobra como reserva: ${formatBrl(analysis.snowball.reserveAfterPlan)}`} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_1.4fr]">
        <section className="rounded-3xl border border-white/5 bg-zinc-900 p-4 sm:rounded-2xl">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-primary">Metas em português claro</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            As fórmulas continuam visíveis, mas o mais importante é saber que decisão cada meta orienta.
          </p>

          <div className="mt-4 space-y-2">
            <FormulaRow label="PMS" formula="$PMS = 6 \\times D$" value={analysis.metrics.pms} gap={analysis.gaps.pms} />
            <FormulaRow label="PMR" formula="$PMR = 20 \\times D$" value={analysis.metrics.pmr} gap={analysis.gaps.pmr} />
            <FormulaRow label="PI" formula="$PI = 0.10 \\times (12 \\times D) \\times A$" value={analysis.metrics.pi} gap={analysis.gaps.pi} />
            <FormulaRow label="PNIF" formula="$PNIF = \\frac{12 \\times D}{0.06}$" value={analysis.metrics.pnif} gap={analysis.gaps.pnif} />
          </div>
        </section>

        <section className="rounded-3xl border border-white/5 bg-zinc-900 p-4 sm:rounded-2xl">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-primary">Plano prático de pagamento</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            A lista mostra exatamente quem pagar com o caixa informado. O objetivo é eliminar credores inteiros, não pingar dinheiro em todos.
          </p>

          <div className="mt-4 divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/5">
            {analysis.snowball.plan.length === 0 ? (
              <div className="px-4 py-5 text-center text-xs text-muted-foreground">Nenhuma dívida de cartão em aberto identificada.</div>
            ) : analysis.snowball.plan.map(item => (
              <div key={item.id} className="grid grid-cols-1 gap-2 px-4 py-3 text-sm min-[560px]:grid-cols-[1fr_auto_auto] min-[560px]:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-white">{item.name}</span>
                    {item.isFiscalPriority && (
                      <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] uppercase text-red-200">Fiscal</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{item.category}</div>
                </div>
                <div className="font-semibold text-blue-100">{formatBrl(item.remaining)}</div>
                <div className={item.status === "quitar" ? "text-green-400" : "text-zinc-500"}>
                  {item.status === "quitar" ? `Pague inteiro: ${formatBrl(item.suggestedPayment)}` : "Não mexer agora"}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {(Object.keys(analysis.buckets) as LifestyleBucket[]).map(bucket => {
          const value = analysis.buckets[bucket].total;
          const percent = analysis.monthlyExpense > 0 ? (value / analysis.monthlyExpense) * 100 : 0;
          return (
            <section key={bucket} className={`rounded-3xl border p-4 sm:rounded-2xl ${bucketTone(bucket)}`}>
              <h3 className="text-sm font-semibold">{bucket}</h3>
              <p className="mt-1 min-h-[42px] text-xs leading-5 opacity-80">{lifestyleDescription(bucket)}</p>
              <div className="mt-4 flex items-end justify-between gap-3">
                <span className="text-2xl font-bold">{formatBrl(value)}</span>
                <span className="text-sm font-semibold">{percent.toFixed(1)}%</span>
              </div>
            </section>
          );
        })}
      </div>

      <section className="rounded-3xl border border-white/5 bg-zinc-900 p-4 sm:rounded-2xl">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
          <AlertTriangle className="h-4 w-4" />
          Observações do raio-x
        </h3>
        <div className="mt-3 grid grid-cols-1 gap-2 text-xs leading-5 text-zinc-300 md:grid-cols-2">
          <Note>Feira e combustível entram no custo de vida. Se estiverem marcados como cartão, o painel não trata como saída imediata de banco.</Note>
          <Note>Sobra depois da bola de neve não é dinheiro livre: é início de reserva até PMS e PMR estarem confortáveis.</Note>
          <Note>Receitas previstas são promessa. Para decidir pagamento hoje, use apenas o caixa que já está disponível.</Note>
          <Note>Se o mês estiver apertado, Luxo corta primeiro; depois renegocie Burocracia. Qualidade de Vida só deve cair quando não houver alternativa.</Note>
        </div>
      </section>
    </div>
  );
}

function XrayInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <span className="block text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        inputMode="decimal"
        className="mt-1 h-9 w-full border-none bg-transparent text-base font-semibold text-white outline-none placeholder:text-zinc-600"
      />
    </label>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  helper,
  tone = "primary",
}: {
  icon: typeof CircleDollarSign;
  label: string;
  value: string;
  helper: string;
  tone?: "primary" | "green" | "red";
}) {
  const color = tone === "green" ? "text-green-400" : tone === "red" ? "text-red-400" : "text-primary";
  return (
    <div className="rounded-3xl border border-white/5 bg-zinc-900 p-4 sm:rounded-2xl">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
        <Icon className={`h-4 w-4 ${color}`} />
        {label}
      </div>
      <div className={`mt-2 text-lg font-bold ${color}`}>{value}</div>
      <div className="mt-1 text-xs leading-5 text-muted-foreground">{helper}</div>
    </div>
  );
}

function ActionStep({
  title,
  detail,
  tone = "primary",
}: {
  title: string;
  detail: string;
  tone?: "green" | "red" | "primary";
}) {
  const toneClass = tone === "green"
    ? "border-green-500/20 bg-green-950/20 text-green-100"
    : tone === "red"
      ? "border-red-500/20 bg-red-950/20 text-red-100"
      : "border-primary/20 bg-primary/10 text-zinc-100";

  return (
    <div className={`rounded-2xl border p-3 ${toneClass}`}>
      <div className="flex items-start gap-2">
        <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <p className="mt-1 text-xs leading-5 opacity-80">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function FormulaRow({ label, formula, value, gap }: { label: string; formula: string; value: number; gap: number }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-black/20 p-3">
      <div className="flex flex-col gap-2 min-[480px]:flex-row min-[480px]:items-center min-[480px]:justify-between">
        <div>
          <div className="text-sm font-semibold text-white">{label}</div>
          <div className="mt-0.5 text-xs text-zinc-400">{shortMetricMeaning(label)}</div>
          <code className="text-xs text-muted-foreground">{formula}</code>
        </div>
        <div className="text-left min-[480px]:text-right">
          <div className="font-bold text-primary">{formatBrl(value)}</div>
          <div className={gap <= 0 ? "text-xs text-green-400" : "text-xs text-red-300"}>
            {gap <= 0 ? "atingido" : `falta ${formatBrl(gap)}`}
          </div>
        </div>
      </div>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-black/20 p-3">
      <CheckCircle2 className="mb-2 h-4 w-4 text-primary" />
      {children}
    </div>
  );
}
