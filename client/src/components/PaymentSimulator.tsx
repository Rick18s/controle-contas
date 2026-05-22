import { trpc } from "@/lib/trpc";
import { formatBrl, getPaidAmount, getRemainingAmount, parseMoney } from "@/lib/money";
import { Calculator, CheckCircle2, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Payable = {
  id: number;
  category: string;
  name: string;
  priority: number | null;
  dueDate: string;
  day: number | null;
  remaining: number;
};

function getDueDay(dueDate: string | null | undefined) {
  const match = (dueDate || "").match(/\b(\d{1,2})\s*\/\s*\d{1,2}\b/);
  if (!match) return null;
  const day = Number.parseInt(match[1], 10);
  return day >= 1 && day <= 31 ? day : null;
}

function getPriority(name: string) {
  const match = name.match(/^\[P([1-4])\]/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

function cleanItemName(name: string) {
  return name.replace(/^\[P[1-4]\]\s*/i, "");
}

function getReceivedIncomeValue(entry: { value: string; receivedValue?: string | null; received: number }) {
  const savedValue = parseMoney(entry.receivedValue || "0.00");
  if (savedValue > 0) return savedValue;
  return entry.received === 1 ? parseMoney(entry.value) : 0;
}

function getRemainingIncomeValue(entry: { value: string; receivedValue?: string | null; received: number }) {
  return Math.max(parseMoney(entry.value) - getReceivedIncomeValue(entry), 0);
}

function priorityLabel(priority: number | null) {
  if (priority === 1) return "P1";
  if (priority === 2) return "P2";
  if (priority === 3) return "P3";
  if (priority === 4) return "P4";
  return "S/P";
}

function sortPayables(items: Payable[]) {
  return [...items].sort((a, b) => {
    const priorityA = a.priority ?? 9;
    const priorityB = b.priority ?? 9;
    const dayA = a.day ?? 99;
    const dayB = b.day ?? 99;
    if (priorityA !== priorityB) return priorityA - priorityB;
    if (dayA !== dayB) return dayA - dayB;
    return b.remaining - a.remaining;
  });
}

export default function PaymentSimulator({ monthId }: { monthId: number }) {
  const cardsQuery = trpc.cards.list.useQuery({ monthId });
  const incomeQuery = trpc.income.list.useQuery({ monthId });
  const balancesQuery = trpc.balances.list.useQuery({ monthId });
  const [includeCurrentBalance, setIncludeCurrentBalance] = useState(true);
  const [selectedIncomeIds, setSelectedIncomeIds] = useState<number[]>([]);
  const [extraAmount, setExtraAmount] = useState("0.00");

  const cards = cardsQuery.data || [];
  const income = incomeQuery.data || [];
  const balances = balancesQuery.data || [];

  const pendingIncomeEntries = useMemo(() => income.filter(entry => getRemainingIncomeValue(entry) > 0), [income]);
  const pendingIncomeIds = useMemo(() => pendingIncomeEntries.map(entry => entry.id), [pendingIncomeEntries]);
  const currentBalance = balances.reduce((sum, balance) => sum + parseMoney(balance.balance), 0);
  const selectedPendingIncome = pendingIncomeEntries
    .filter(entry => selectedIncomeIds.includes(entry.id))
    .reduce((sum, entry) => sum + getRemainingIncomeValue(entry), 0);
  const totalPendingIncome = pendingIncomeEntries.reduce((sum, entry) => sum + getRemainingIncomeValue(entry), 0);
  const receivedIncome = income
    .reduce((sum, entry) => sum + getReceivedIncomeValue(entry), 0);

  useEffect(() => {
    setSelectedIncomeIds(current => {
      const currentValid = current.filter(id => pendingIncomeIds.includes(id));
      if (currentValid.length > 0) return currentValid;
      return pendingIncomeIds;
    });
  }, [pendingIncomeIds]);

  const payables = useMemo(() => {
    return sortPayables(
      cards
        .flatMap(card =>
          card.items.map(item => ({
            id: item.id,
            category: card.name,
            name: item.name,
            priority: getPriority(item.name),
            dueDate: item.dueDate || "",
            day: getDueDay(item.dueDate),
            remaining: getRemainingAmount(item),
          }))
        )
        .filter(item => item.remaining > 0)
    );
  }, [cards]);

  const available = Math.max(
    (includeCurrentBalance ? currentBalance : 0) +
      selectedPendingIncome +
      parseMoney(extraAmount),
    0
  );

  const allPendingSelected = pendingIncomeEntries.length > 0 && selectedIncomeIds.length === pendingIncomeEntries.length;

  const toggleIncome = (id: number) => {
    setSelectedIncomeIds(current =>
      current.includes(id) ? current.filter(currentId => currentId !== id) : [...current, id]
    );
  };

  let runningBalance = available;
  const simulation = payables.map(item => {
    const canPay = runningBalance >= item.remaining;
    const paidAmount = canPay ? item.remaining : Math.max(runningBalance, 0);
    const missing = Math.max(item.remaining - paidAmount, 0);
    runningBalance = Math.max(runningBalance - item.remaining, 0);
    return { ...item, canPay, paidAmount, missing, balanceAfter: runningBalance };
  });

  const payableNow = simulation.filter(item => item.canPay);
  const partialItem = simulation.find(item => !item.canPay && item.paidAmount > 0);
  const totalOpen = payables.reduce((sum, item) => sum + item.remaining, 0);
  const totalPaidInSimulation = payableNow.reduce((sum, item) => sum + item.remaining, 0) + (partialItem?.paidAmount || 0);
  const remainingAfterSimulation = Math.max(totalOpen - totalPaidInSimulation, 0);

  return (
    <div className="rounded-lg border border-border bg-card glass-card hover:border-primary/50 p-4 space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-sm font-mono uppercase tracking-widest text-primary flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            Simulador de pagamento
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Veja até onde o dinheiro disponível e as entradas a caminho conseguem pagar a fila de contas.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs lg:min-w-[520px] lg:grid-cols-4">
          <Metric label="Disponível" value={formatBrl(available)} tone="primary" />
          <Metric label="Paga agora" value={`${payableNow.length}/${payables.length}`} tone="green" />
          <Metric label="Após simular" value={formatBrl(runningBalance)} tone="blue" />
          <Metric label="Fica faltando" value={formatBrl(remainingAfterSimulation)} tone="red" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[320px_1fr]">
        <div className="rounded border border-border bg-black/20 p-3 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-100">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            Fontes do dinheiro
          </div>

          <label className="flex items-center justify-between gap-3 rounded border border-border bg-background/40 px-3 py-2 text-xs">
            <span>
              <span className="block text-gray-100">Saldo bancário atual</span>
              <span className="text-muted-foreground">{formatBrl(currentBalance)}</span>
            </span>
            <input
              type="checkbox"
              checked={includeCurrentBalance}
              onChange={event => setIncludeCurrentBalance(event.target.checked)}
              className="h-4 w-4 accent-primary"
            />
          </label>

          <label className="flex items-center justify-between gap-3 rounded border border-border bg-background/40 px-3 py-2 text-xs">
            <span>
              <span className="block text-gray-100">Selecionar todas as entradas</span>
              <span className="text-muted-foreground">{formatBrl(totalPendingIncome)}</span>
            </span>
            <input
              type="checkbox"
              checked={allPendingSelected}
              onChange={event => setSelectedIncomeIds(event.target.checked ? pendingIncomeIds : [])}
              className="h-4 w-4 accent-primary"
            />
          </label>

          <div className="rounded border border-border bg-background/40">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-[10px] uppercase text-muted-foreground">Entradas a caminho</span>
              <span className="text-[10px] text-primary">{formatBrl(selectedPendingIncome)}</span>
            </div>
            <div className="max-h-52 overflow-y-auto divide-y divide-cyan-900/20">
              {pendingIncomeEntries.length === 0 ? (
                <div className="px-3 py-3 text-xs text-muted-foreground">Nenhuma entrada pendente.</div>
              ) : pendingIncomeEntries.map(entry => {
                const checked = selectedIncomeIds.includes(entry.id);
                return (
                  <label key={entry.id} className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-xs hover:bg-cyan-400/[0.05]">
                    <span className="min-w-0">
                      <span className="block truncate text-gray-100">{entry.name}</span>
                      <span className="text-muted-foreground">Falta {formatBrl(getRemainingIncomeValue(entry))}</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleIncome(entry.id)}
                      className="h-4 w-4 accent-primary"
                    />
                  </label>
                );
              })}
            </div>
          </div>

          <div className="rounded border border-border bg-background/40 px-3 py-2">
            <label className="text-[10px] uppercase text-muted-foreground" htmlFor="payment-simulator-extra">
              Entrada extra para simular
            </label>
            <input
              id="payment-simulator-extra"
              type="number"
              step="0.01"
              value={extraAmount}
              onChange={event => setExtraAmount(event.target.value)}
              className="mt-1 w-full bg-transparent text-sm font-bold text-primary focus:outline-none"
            />
          </div>

          <div className="rounded border border-cyan-500/20 bg-cyan-950/10 px-3 py-2 text-[11px] text-muted-foreground">
            Já recebido: <span className="text-primary">{formatBrl(receivedIncome)}</span> · Selecionado: <span className="text-primary">{formatBrl(selectedPendingIncome)}</span>
          </div>
        </div>

        <div className="rounded border border-border bg-black/20 overflow-hidden">
          {payables.length === 0 ? (
            <div className="flex items-center justify-center gap-2 p-6 text-sm text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              Nenhuma conta em aberto para simular.
            </div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto divide-y divide-cyan-900/20">
              {simulation.map(item => (
                <div
                  key={item.id}
                  className={`grid grid-cols-[1fr_auto] gap-3 px-3 py-2.5 text-xs ${
                    item.canPay ? "bg-green-950/10" : item.paidAmount > 0 ? "bg-blue-950/15" : "bg-transparent"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold text-gray-100">{cleanItemName(item.name)}</span>
                      <span className="rounded border border-blue-500/40 bg-blue-950/30 px-1.5 py-0.5 text-[9px] uppercase text-blue-200">
                        {priorityLabel(item.priority)}
                      </span>
                      <span className="rounded border border-cyan-700/40 px-1.5 py-0.5 text-[9px] uppercase text-primary">
                        {item.category}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                      <span>Falta {formatBrl(item.remaining)}</span>
                      {item.dueDate && <span>Venc. {item.dueDate}</span>}
                      {!item.canPay && item.paidAmount > 0 && <span className="text-blue-200">Parcial {formatBrl(item.paidAmount)}</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`block text-[10px] uppercase ${item.canPay ? "text-green-400" : item.paidAmount > 0 ? "text-blue-200" : "text-red-300"}`}>
                      {item.canPay ? "paga" : item.paidAmount > 0 ? "parcial" : "fora"}
                    </span>
                    <strong className={item.canPay ? "text-green-400" : "text-red-300"}>
                      {item.canPay ? formatBrl(item.balanceAfter) : formatBrl(item.missing)}
                    </strong>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: "primary" | "green" | "blue" | "red" }) {
  const toneClass = {
    primary: "text-primary border-cyan-500/30 bg-cyan-950/20",
    green: "text-green-400 border-green-500/30 bg-green-950/20",
    blue: "text-blue-200 border-blue-400/30 bg-blue-950/20",
    red: "text-red-300 border-red-500/30 bg-red-950/20",
  }[tone];

  return (
    <div className={`rounded border px-2 py-1.5 ${toneClass}`}>
      <span className="block text-[10px] uppercase text-muted-foreground">{label}</span>
      <strong className="font-mono">{value}</strong>
    </div>
  );
}
