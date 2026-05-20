import { trpc } from "@/lib/trpc";
import { formatBrl, getRemainingAmount } from "@/lib/money";
import { ListChecks } from "lucide-react";
import { useMemo } from "react";

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

export default function PriorityList({ monthId }: { monthId: number }) {
  const cardsQuery = trpc.cards.list.useQuery({ monthId });
  const cards = cardsQuery.data || [];

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

  const totalOpen = payables.reduce((sum, item) => sum + item.remaining, 0);

  return (
    <div className="rounded-lg border border-border bg-card glass-card p-4 space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-sm font-mono uppercase tracking-widest text-primary flex items-center gap-2">
            <ListChecks className="h-4 w-4" />
            Contas a Pagar (Prioridades)
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Fila de contas ordenadas por prioridade (P1 a P4) e vencimento.
          </p>
        </div>
        <div className="rounded border border-cyan-500/30 bg-cyan-950/20 px-3 py-2 text-center lg:min-w-[200px]">
          <span className="block text-[10px] uppercase text-muted-foreground">Total em aberto</span>
          <strong className="font-mono text-primary text-base">{formatBrl(totalOpen)}</strong>
        </div>
      </div>

      <div className="rounded border border-border bg-black/20 overflow-hidden">
        {payables.length === 0 ? (
          <div className="flex items-center justify-center p-6 text-sm text-green-400">
            Todas as contas deste mês estão pagas!
          </div>
        ) : (
          <div className="max-h-[600px] overflow-y-auto divide-y divide-cyan-900/20">
            {payables.map(item => (
              <div key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 hover:bg-cyan-950/10 transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold text-gray-100 text-sm">{cleanItemName(item.name)}</span>
                    <span className="rounded border border-blue-500/40 bg-blue-950/30 px-1.5 py-0.5 text-[10px] uppercase text-blue-200">
                      {priorityLabel(item.priority)}
                    </span>
                    <span className="rounded border border-cyan-700/40 px-1.5 py-0.5 text-[10px] uppercase text-primary">
                      {item.category}
                    </span>
                  </div>
                  {item.dueDate && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Vencimento: {item.dueDate}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <strong className="text-red-300 text-sm font-mono">{formatBrl(item.remaining)}</strong>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
