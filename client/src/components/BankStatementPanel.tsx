import { trpc } from "@/lib/trpc";
import { formatBrl, parseMoney } from "@/lib/money";
import { ArrowDownLeft, ArrowUpRight, SlidersHorizontal } from "lucide-react";

type MovementType = "income" | "expense" | "adjustment";

function movementMeta(type: MovementType) {
  if (type === "income") {
    return { label: "Entrada", icon: ArrowDownLeft, color: "text-green-400", bg: "bg-green-500/10" };
  }
  if (type === "expense") {
    return { label: "Saída", icon: ArrowUpRight, color: "text-red-400", bg: "bg-red-500/10" };
  }
  return { label: "Ajuste", icon: SlidersHorizontal, color: "text-blue-200", bg: "bg-blue-500/10" };
}

function formatDate(value: string | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function BankStatementPanel({ monthId }: { monthId: number }) {
  const query = trpc.balances.transactions.useQuery({ monthId });
  const transactions = [...(query.data || [])].sort((a, b) => Number(b.id) - Number(a.id));

  return (
    <section className="rounded-2xl border border-white/5 bg-zinc-900/60 p-4 sm:p-5">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-mono uppercase tracking-widest text-primary">Extrato dos saldos</h2>
          <p className="text-xs text-muted-foreground">
            Tudo que alterou os bancos: pagamentos, recebimentos, ajustes manuais e importações OFX.
          </p>
        </div>
        <span className="text-xs font-mono text-muted-foreground">{transactions.length} movimentações</span>
      </div>

      {query.isLoading ? (
        <div className="rounded-xl border border-white/5 bg-black/20 p-6 text-center text-xs text-muted-foreground">
          Carregando extrato...
        </div>
      ) : transactions.length === 0 ? (
        <div className="rounded-xl border border-white/5 bg-black/20 p-6 text-center text-xs text-muted-foreground">
          Nenhuma movimentação registrada ainda. Quando você pagar uma conta, receber uma entrada ou ajustar um saldo, o histórico aparece aqui.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/5">
          <div className="hidden grid-cols-[110px_1fr_150px_130px_130px] gap-3 border-b border-white/5 bg-black/20 px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground md:grid">
            <span>Quando</span>
            <span>Descrição</span>
            <span>Conta</span>
            <span className="text-right">Valor</span>
            <span className="text-right">Saldo após</span>
          </div>
          <div className="divide-y divide-white/5">
            {transactions.map(transaction => {
              const amount = parseMoney(transaction.amount);
              const meta = movementMeta(transaction.movementType as MovementType);
              const Icon = meta.icon;
              return (
                <div key={transaction.id} className="grid gap-2 px-3 py-3 text-sm md:grid-cols-[110px_1fr_150px_130px_130px] md:items-center md:gap-3">
                  <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${meta.bg} ${meta.color}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    {formatDate(transaction.createdAt)}
                  </div>
                  <div>
                    <div className="font-medium text-foreground">{transaction.description}</div>
                    <div className={`mt-0.5 text-[10px] uppercase tracking-widest md:hidden ${meta.color}`}>{meta.label}</div>
                  </div>
                  <div className="text-xs font-mono text-muted-foreground">{transaction.accountName}</div>
                  <div className={`font-mono font-bold md:text-right ${amount >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {amount >= 0 ? "+" : "-"} {formatBrl(Math.abs(amount))}
                  </div>
                  <div className="text-xs font-mono text-muted-foreground md:text-right">
                    {formatBrl(parseMoney(transaction.balanceAfter))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
