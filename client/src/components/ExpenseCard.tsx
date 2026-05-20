import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Edit2 } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { formatBrl, getPaidAmount, getRemainingAmount, parseMoney } from "@/lib/money";
import { CardCategoryIcon } from "@/components/CardCategoryIcon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ExpenseItem {
  id: number;
  cardId: number;
  name: string;
  dueDate: string | null;
  value: string;
  paidValue: string;
  paidAccountName?: string | null;
  status: "pago" | "parcial" | "pendente";
  sortOrder: number | null;
}

interface CardData {
  id: number;
  monthId: number;
  name: string;
  icon: string | null;
  sortOrder: number | null;
  items: ExpenseItem[];
}

const PRIORITY_OPTIONS = [
  { value: "none", label: "Sem prioridade" },
  { value: "1", label: "P1 Urgente" },
  { value: "2", label: "P2 Essencial" },
  { value: "3", label: "P3 Importante" },
  { value: "4", label: "P4 Opcional" },
] as const;

function getItemPriority(name: string) {
  const match = name.match(/^\[P([1-4])\]/i);
  return match ? match[1] : "none";
}

function cleanItemName(name: string) {
  return name.replace(/^\[P[1-4]\]\s*/i, "");
}

function withPriority(name: string, priority: string) {
  const cleanName = cleanItemName(name).trim() || "Novo item";
  return priority && priority !== "none" ? `[P${priority}] ${cleanName}` : cleanName;
}

export default function ExpenseCard({ card, onRefresh }: { card: CardData; onRefresh: () => void }) {
  const utils = trpc.useUtils();
  const [editingItem, setEditingItem] = useState<number | null>(null);

  const balancesQuery = trpc.balances.list.useQuery({ monthId: card.monthId });
  const createCard = trpc.cards.create.useMutation();
  const createItem = trpc.items.create.useMutation();
  const deleteItem = trpc.items.delete.useMutation();
  const deleteCard = trpc.cards.delete.useMutation();
  const updateCard = trpc.cards.update.useMutation({ onSuccess: () => onRefresh() });

  const totalValue = card.items.reduce((sum, item) => sum + parseMoney(item.value), 0);
  const totalPaid = card.items.reduce((sum, item) => sum + getPaidAmount(item), 0);
  const remaining = Math.max(totalValue - totalPaid, 0);
  const statusRank = { pago: 0, parcial: 1, pendente: 2 } as const;
  const sortedItems = [...card.items].sort((a, b) => {
    const statusDiff = statusRank[a.status] - statusRank[b.status];
    if (statusDiff !== 0) return statusDiff;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });

  const restoreItem = async (item: ExpenseItem) => {
    await createItem.mutateAsync({
      cardId: item.cardId,
      name: item.name,
      dueDate: item.dueDate || undefined,
      value: item.value,
      paidValue: item.paidValue,
      paidAccountName: item.paidAccountName,
      status: item.status,
    });
    onRefresh();
    toast.success("Item restaurado");
  };

  const handleAddItem = async () => {
    await createItem.mutateAsync({
      cardId: card.id,
      name: "Novo item",
      value: "0.00",
      paidValue: "0.00",
      status: "pendente",
    });
    onRefresh();
    toast.success("Item adicionado");
  };

  const handleDeleteItem = async (item: ExpenseItem) => {
    await deleteItem.mutateAsync({ id: item.id });
    onRefresh();
    toast.success("Item removido", {
      duration: 10000,
      action: {
        label: "Desfazer",
        onClick: () => { void restoreItem(item); },
      },
    });
  };

  const restoreCard = async () => {
    const restoredCard = await createCard.mutateAsync({
      monthId: card.monthId,
      name: card.name,
      icon: card.icon || "📋",
    });

    for (const item of card.items) {
      await createItem.mutateAsync({
        cardId: restoredCard.id,
        name: item.name,
        dueDate: item.dueDate || undefined,
        value: item.value,
        paidValue: item.paidValue,
        paidAccountName: item.paidAccountName,
        status: item.status,
      });
    }

    onRefresh();
    toast.success("Card restaurado");
  };

  const handleDeleteCard = async () => {
    if (confirm(`Remover "${card.name}" e todos os itens?`)) {
      await deleteCard.mutateAsync({ id: card.id });
      onRefresh();
      toast.success("Card removido", {
        duration: 10000,
        action: {
          label: "Desfazer",
          onClick: () => { void restoreCard(); },
        },
      });
    }
  };

  const handleRenameCard = () => {
    const newName = prompt("Novo nome:", card.name);
    if (newName && newName !== card.name) {
      updateCard.mutate({ id: card.id, name: newName });
    }
  };

  return (
    <div className="rounded-2xl overflow-hidden border border-white/5 bg-zinc-900 shadow-sm transition-all hover:border-purple-500/30 hover:shadow-lg hover:shadow-purple-500/5">
      {/* Card Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-zinc-900/80">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-primary/10 text-primary">
            <CardCategoryIcon name={card.name} className="h-4 w-4" />
          </span>
          <h3 className="font-semibold text-sm text-foreground" >
            {card.name}
          </h3>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={handleRenameCard} className="text-gray-500 hover:text-primary h-6 w-6 p-0">
            <Edit2 className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleDeleteCard} className="text-gray-500 hover:text-red-400 h-6 w-6 p-0">
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Items */}
      <div className="flex flex-col">
        {sortedItems.map(item => (
          <ItemRow
            key={item.id}
            item={item}
            isEditing={editingItem === item.id}
            onEdit={() => setEditingItem(item.id)}
            onClose={() => setEditingItem(null)}
            onRefresh={onRefresh}
            onBalancesRefresh={() => {
              void balancesQuery.refetch();
              void utils.balances.list.invalidate({ monthId: card.monthId });
              void utils.balances.transactions.invalidate({ monthId: card.monthId });
              void utils.months.getAnalytics.invalidate();
            }}
            onDelete={() => { void handleDeleteItem(item); }}
            balances={balancesQuery.data || []}
          />
        ))}
      </div>

      {/* Add Item */}
      <div className="px-4 py-2 border-t border-border bg-card">
        <Button variant="ghost" size="sm" onClick={handleAddItem} className="text-gray-500 hover:text-foreground text-xs gap-1 w-full justify-start">
          <Plus className="w-3 h-3" /> Adicionar item
        </Button>
      </div>

      {/* Footer Totals */}
      <div className="px-4 py-3 border-t border-white/5 bg-zinc-900/80">
        <div className="flex justify-between text-xs font-medium">
          <span className="text-muted-foreground uppercase">Total</span>
          <span className="text-foreground font-semibold">{formatBrl(totalValue)}</span>
        </div>
        <div className="flex justify-between text-xs font-medium mt-1">
          <span className="text-muted-foreground uppercase">Pago</span>
          <span className="text-green-600">{formatBrl(totalPaid)}</span>
        </div>
        <div className="flex justify-between text-xs font-medium mt-1">
          <span className="text-muted-foreground uppercase">Restante</span>
          <span className="text-blue-200 font-semibold">{formatBrl(remaining)}</span>
        </div>
      </div>
    </div>
  );
}

function ItemRow({ item, isEditing, onEdit, onClose, onRefresh, onBalancesRefresh, onDelete, balances }: {
  item: ExpenseItem;
  isEditing: boolean;
  onEdit: () => void;
  onClose: () => void;
  onRefresh: () => void;
  onBalancesRefresh: () => void;
  onDelete: () => void;
  balances: Array<{ id: number; accountName: string }>;
}) {
  const [name, setName] = useState(cleanItemName(item.name));
  const [dueDate, setDueDate] = useState(item.dueDate || "");
  const [value, setValue] = useState(item.value);
  const [paidValue, setPaidValue] = useState(item.paidValue);
  const [paidAccountName, setPaidAccountName] = useState(item.paidAccountName || "");
  const [status, setStatus] = useState<"pago" | "parcial" | "pendente">(item.status);
  const [priority, setPriority] = useState(getItemPriority(item.name));
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentAccountName, setPaymentAccountName] = useState("");

  const updateItem = trpc.items.update.useMutation({
    onSuccess: () => {
      onRefresh();
      onBalancesRefresh();
    },
    onError: (error) => toast.error(error.message || "Não foi possível atualizar a despesa"),
  });

  // Sync local state when item changes from outside
  useEffect(() => {
    setName(cleanItemName(item.name));
    setDueDate(item.dueDate || "");
    setValue(item.value);
    setPaidValue(item.paidValue);
    setPaidAccountName(item.paidAccountName || "");
    setStatus(item.status);
    setPriority(getItemPriority(item.name));
  }, [item]);

  const savedName = (nextName = name, nextPriority = priority) => withPriority(nextName, nextPriority);

  const saveEdit = () => {
    const paidAmount = parseMoney(paidValue);
    const accountName = paidAccountName.trim();
    if (paidAmount > 0 && !accountName) {
      toast.error("Informe de qual banco saiu o pagamento");
      return;
    }
    updateItem.mutate({
      id: item.id,
      name: savedName(),
      dueDate,
      value,
      paidValue: paidAmount > 0 ? paidValue : "0.00",
      paidAccountName: paidAmount > 0 ? accountName : null,
      status,
    });
    onClose();
  };

  const statusColors: Record<string, string> = {
    pago: 'bg-green-500/10 text-green-400 border-green-500/20',
    parcial: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    pendente: 'bg-zinc-800 text-zinc-300 border-zinc-700',
  };

  if (isEditing) {
    return (
      <div className="px-4 py-3 space-y-3 bg-muted/10 border-y border-border">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Nome da Conta</Label>
            <input
              className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Aluguel"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Vencimento</Label>
            <input
              className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              placeholder="Ex: 20/05"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Valor (R$)</Label>
            <input
              className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              type="number"
              step="0.01"
              value={value}
              onChange={e => { 
                const newVal = e.target.value;
                setValue(newVal); 
                // Auto-calc status if paid matches new value
                let s = status;
                if (Number(newVal) > 0 && Number(paidValue) >= Number(newVal)) s = "pago";
                else if (Number(paidValue) > 0) s = "parcial";
                setStatus(s);
              }}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Pago (R$)</Label>
            <input
              className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              type="number"
              step="0.01"
              value={paidValue}
              onChange={e => { 
                const newPaid = e.target.value;
                const nextPaidAmount = Number(newPaid);
                const nextAccount = nextPaidAmount > 0 ? (paidAccountName || balances[0]?.accountName || "") : "";
                setPaidValue(newPaid);
                setPaidAccountName(nextAccount);
                // Auto-calc status based on payment
                let s = "pendente" as "pago" | "parcial" | "pendente";
                if (nextPaidAmount > 0) {
                  s = nextPaidAmount >= Number(value) ? "pago" : "parcial";
                }
                setStatus(s);
              }}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Prioridade</Label>
            <Select
              value={priority}
              onValueChange={setPriority}
            >
              <SelectTrigger className="w-full h-[34px] bg-background">
                <SelectValue placeholder="Prioridade" />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map(option => (
                  <SelectItem key={option.value || "none"} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Banco do pagamento</Label>
            <input
              className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              value={paidAccountName}
              onChange={(event) => {
                const nextAccount = event.target.value;
                setPaidAccountName(nextAccount);
              }}
              placeholder={parseMoney(paidValue) > 0 ? "Ex: Inter, C6, Caixa" : "Sem pagamento"}
              disabled={parseMoney(paidValue) <= 0}
              list={`accounts-${item.id}`}
            />
            <datalist id={`accounts-${item.id}`}>
              {balances.map(balance => (
                <option key={balance.id} value={balance.accountName} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <Button size="sm" variant="ghost" onClick={saveEdit} disabled={updateItem.isPending} className="text-muted-foreground hover:text-foreground text-xs h-7">
            {updateItem.isPending ? "Salvando..." : "Concluir Edição"}
          </Button>
        </div>
      </div>
    );
  }

  const isPaid = item.status === "pago";
  const isPartial = item.status === "parcial";
  const paidAmount = getPaidAmount(item);
  const remainingAmount = getRemainingAmount(item);
  const itemPriority = getItemPriority(item.name);
  const itemPriorityLabel = PRIORITY_OPTIONS.find(option => option.value === itemPriority)?.label;

  const handleToggleStatus = () => {
    // Apenas alterna entre pago e pendente. 
    // Para parcial, o usuário edita a linha.
    const isCurrentlyPaid = item.status === "pago";
    if (isCurrentlyPaid) {
      setStatus("pendente");
      setPaidValue("0.00");
      setPaidAccountName("");
      updateItem.mutate({ id: item.id, status: "pendente", paidValue: "0.00", paidAccountName: null });
      return;
    }

    setPaymentAccountName(item.paidAccountName || balances[0]?.accountName || "");
    setShowPaymentDialog(true);
  };

  const confirmPayment = () => {
    const accountName = paymentAccountName.trim();
    if (!accountName) return;
    setStatus("pago");
    setPaidValue(item.value);
    setPaidAccountName(accountName);
    updateItem.mutate({
      id: item.id,
      status: "pago",
      paidValue: item.value,
      paidAccountName: accountName,
    });
    setShowPaymentDialog(false);
  };

  return (
    <>
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between px-4 py-3 cursor-pointer transition-colors hover:bg-zinc-800/40 border-b border-white/5 last:border-0 gap-2 sm:gap-0"
        onClick={onEdit}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
            <span className={`text-sm font-medium truncate ${isPaid ? 'text-green-700/60 line-through' : 'text-foreground'}`}>
              {cleanItemName(item.name)}
            </span>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {itemPriorityLabel && itemPriority && (
              <span className="text-[10px] px-1.5 py-0.5 rounded border border-blue-500/50 bg-blue-950/30 text-blue-200 uppercase font-semibold">
                {itemPriorityLabel}
              </span>
            )}
            {item.dueDate && (
              <span className="text-[10px] text-gray-500 font-mono">{item.dueDate}</span>
            )}
            {item.paidAccountName && paidAmount > 0 && (
              <span className="text-[10px] text-green-400/70 font-mono">{item.paidAccountName}</span>
            )}
            {isPartial && (
              <>
                <span className="text-[10px] text-green-600 font-medium">Pago {formatBrl(paidAmount)}</span>
                <span className="text-[10px] text-blue-200 font-medium">Falta {formatBrl(remainingAmount)}</span>
              </>
            )}
          </div>
          </div>
        </div>
        <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto sm:ml-2 mt-1 sm:mt-0">
          <span className={`text-sm font-medium ${isPaid ? 'text-green-600' : 'text-foreground'}`}>
            {formatBrl(parseMoney(item.value))}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleToggleStatus();
            }}
            className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border uppercase cursor-pointer hover:opacity-80 transition-opacity min-w-[70px] text-center ${statusColors[item.status]}`}
          >
            {item.status}
          </button>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="text-gray-400 hover:text-red-500 h-6 w-6 rounded-full"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="bg-card text-card-foreground border border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-primary font-mono text-sm uppercase tracking-widest">Registrar pagamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Escolha de qual banco saiu {formatBrl(parseMoney(item.value))} para pagar {cleanItemName(item.name)}.
            </p>
            <input
              className="w-full rounded border border-border bg-background/50 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-cyan-400"
              value={paymentAccountName}
              onChange={(event) => setPaymentAccountName(event.target.value)}
              placeholder="Ex: Inter, C6, Caixa"
              autoFocus
              list={`payment-accounts-${item.id}`}
            />
            <datalist id={`payment-accounts-${item.id}`}>
              {balances.map(balance => (
                <option key={balance.id} value={balance.accountName} />
              ))}
            </datalist>
            {balances.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {balances.map(balance => (
                  <Button
                    key={balance.id}
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setPaymentAccountName(balance.accountName)}
                    className="h-7 border border-border px-2 text-[11px] text-muted-foreground hover:text-primary"
                  >
                    {balance.accountName}
                  </Button>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Se a conta ainda não existir em Saldos, ela será criada com o valor descontado.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setShowPaymentDialog(false)} className="text-gray-400 text-xs">Cancelar</Button>
            <Button onClick={confirmPayment} disabled={!paymentAccountName.trim() || updateItem.isPending} className="text-xs">
              Confirmar pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
