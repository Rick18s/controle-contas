import { trpc } from "@/lib/trpc";
import { formatBrl, getPaidAmount, getRemainingAmount, parseMoney } from "@/lib/money";
import { AlertTriangle, CalendarClock, CheckCircle2 } from "lucide-react";
import { useMemo } from "react";

type PayableItem = {
  id: number;
  category: string;
  name: string;
  priority: number | null;
  dueDate: string;
  day: number | null;
  value: number;
  paid: number;
  remaining: number;
  status: string;
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

function sortPayables(items: PayableItem[]) {
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

function priorityLabel(priority: number | null) {
  if (priority === 1) return "Urgente";
  if (priority === 2) return "Essencial";
  if (priority === 3) return "Importante";
  if (priority === 4) return "Opcional";
  return "Sem prioridade";
}

function PaymentList({ items, emptyText }: { items: PayableItem[]; emptyText: string }) {
  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 p-5 text-xs font-mono text-green-400">
        <CheckCircle2 className="h-4 w-4" />
        {emptyText}
      </div>
    );
  }

  return (
    <div className="divide-y divide-cyan-900/20">
      {items.map(item => (
        <div key={item.id} className="grid grid-cols-[auto_1fr_auto] gap-3 px-3 py-2.5 font-mono text-xs hover:bg-cyan-400/[0.05]">
          <div className={`flex h-10 w-12 flex-col items-center justify-center rounded border ${
            item.day === null ? "border-blue-400/40 bg-blue-950/20 text-blue-200" : "border-cyan-500/30 bg-cyan-950/20 text-primary"
          }`}>
            <CalendarClock className="h-3 w-3" />
            <span>{item.day ? String(item.day).padStart(2, "0") : "S/D"}</span>
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-bold text-gray-100">{cleanItemName(item.name)}</span>
              {item.priority && <span className="rounded border border-red-600/50 bg-red-950/30 px-1.5 py-0.5 text-[9px] uppercase text-red-300">P{item.priority}</span>}
              <span className="rounded border border-cyan-700/40 px-1.5 py-0.5 text-[9px] uppercase text-primary">{item.category}</span>
              {item.status === "parcial" && (
                <span className="rounded border border-blue-500/50 bg-blue-950/30 px-1.5 py-0.5 text-[9px] uppercase text-blue-200">parcial</span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-gray-500">
              <span>Total {formatBrl(item.value)}</span>
              {item.paid > 0 && <span className="text-green-400">Pago {formatBrl(item.paid)}</span>}
              {item.dueDate && <span>Venc. {item.dueDate}</span>}
            </div>
          </div>

          <div className="text-right">
            <div className="text-[10px] uppercase text-gray-500">Falta</div>
            <div className="text-sm font-bold text-red-400">{formatBrl(item.remaining)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CashFlowTimeline({ monthId }: { monthId: number }) {
  const cardsQuery = trpc.cards.list.useQuery({ monthId });
  const cards = cardsQuery.data || [];

  const payableItems = useMemo<PayableItem[]>(() => {
    return cards
      .flatMap(card =>
        card.items.map(item => {
          const value = parseMoney(item.value);
          const paid = getPaidAmount(item);
          const remaining = getRemainingAmount(item);
          return {
            id: item.id,
            category: card.name,
            name: item.name,
            priority: getPriority(item.name),
            dueDate: item.dueDate || "",
            day: getDueDay(item.dueDate),
            value,
            paid,
            remaining,
            status: item.status,
          };
        })
      )
      .filter(item => item.remaining > 0);
  }, [cards]);

  const sortedItems = sortPayables(payableItems);
  const totalOpen = sortedItems.reduce((sum, item) => sum + item.remaining, 0);
  const overdueOrNoDate = sortedItems.filter(item => item.day === null).length;
  const priorityGroups = [1, 2, 3, 4, null].map(priority => {
    const items = sortedItems.filter(item => item.priority === priority);
    return {
      priority,
      label: priorityLabel(priority),
      items,
      total: items.reduce((sum, item) => sum + item.remaining, 0),
    };
  });
  const categoryTotals = cards
    .map(card => {
      const total = card.items.reduce((sum, item) => sum + getRemainingAmount(item), 0);
      return { name: card.name, total };
    })
    .filter(category => category.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 4);

  return (
    <div className="rounded-lg border border-border rounded-md glass-card hover:border-primary/50 p-4 space-y-4" style={{ background: "var(--bg-card)" }}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h2 className="text-sm font-mono uppercase tracking-widest text-primary" >
          Contas a Pagar
        </h2>
        <div className="grid grid-cols-2 gap-2 text-[10px] font-mono md:grid-cols-4 md:min-w-[560px]">
          <div className="rounded border border-red-500/30 bg-red-950/20 px-2 py-1.5">
            <span className="block text-gray-500 uppercase">Em aberto</span>
            <strong className="text-destructive">{formatBrl(totalOpen)}</strong>
          </div>
          <div className="rounded border border-cyan-500/30 bg-cyan-950/20 px-2 py-1.5">
            <span className="block text-gray-500 uppercase">Itens</span>
            <strong className="text-primary">{sortedItems.length}</strong>
          </div>
          <div className="rounded border border-blue-400/30 bg-blue-950/20 px-2 py-1.5">
            <span className="block text-gray-500 uppercase">Sem data</span>
            <strong className="text-blue-200">{overdueOrNoDate}</strong>
          </div>
          <div className="rounded border border-green-500/30 bg-green-950/20 px-2 py-1.5">
            <span className="block text-gray-500 uppercase">Categorias</span>
            <strong className="text-primary">{categoryTotals.length}</strong>
          </div>
        </div>
      </div>

      <div className="rounded border border-border bg-black/20 p-3 font-mono text-xs text-gray-300">
        <div className="flex items-start gap-2">
          {totalOpen > 0 ? <AlertTriangle className="mt-0.5 h-4 w-4 text-blue-200" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-400" />}
          <p>
            Esta visão organiza todas as contas em aberto por prioridade, vencimento e categoria. Edite um item de despesa para escolher entre P1 urgente, P2 essencial, P3 importante e P4 opcional.
            {overdueOrNoDate > 0 && <span className="text-blue-200"> Há {overdueOrNoDate} conta(s) sem data de vencimento.</span>}
          </p>
        </div>
      </div>

      {categoryTotals.length > 0 && (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          {categoryTotals.map(category => (
            <div key={category.name} className="rounded border border-border bg-black/20 px-3 py-2 font-mono text-xs">
              <span className="block truncate text-gray-500 uppercase">{category.name}</span>
              <strong className="text-primary">{formatBrl(category.total)}</strong>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {priorityGroups.map(group => (
          <section key={group.label} className="rounded border border-border bg-black/20">
            <div className="flex items-center justify-between border-b border-border px-3 py-2 font-mono text-xs">
              <span className="uppercase text-primary">{group.label}</span>
              <span className={group.total > 0 ? "text-red-300" : "text-green-400"}>{formatBrl(group.total)}</span>
            </div>
            <div className="max-h-[320px] overflow-y-auto">
              <PaymentList items={group.items} emptyText={`Nenhuma conta em ${group.label.toLowerCase()}`} />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
