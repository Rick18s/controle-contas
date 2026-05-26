import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Edit2, RotateCcw } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { formatBrl, getPaidAmount, getRemainingAmount, parseMoney } from "@/lib/money";
import { CardCategoryIcon } from "@/components/CardCategoryIcon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import BankAccountPicker from "@/components/BankAccountPicker";

interface ExpenseItem {
  id: number;
  cardId: number;
  name: string;
  dueDate: string | null;
  value: string;
  paidValue: string;
  paidAccountName?: string | null;
  paymentMode?: PaymentMode | string;
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

type PaymentMode = "bank" | "card" | "budget";

const PAYMENT_MODE_OPTIONS: Array<{ value: PaymentMode; label: string; description: string }> = [
  { value: "bank", label: "Saiu do banco", description: "Debita o saldo bancário agora." },
  { value: "card", label: "Foi no cartão", description: "Controla o orçamento, sem mexer no banco." },
  { value: "budget", label: "Só controle", description: "Marca como usado, sem débito bancário." },
];

function paymentModeLabel(mode: PaymentMode | undefined) {
  return PAYMENT_MODE_OPTIONS.find(option => option.value === (mode || "bank"))?.label || "Saiu do banco";
}

function normalizePaymentMode(mode: string | null | undefined): PaymentMode {
  return mode === "card" || mode === "budget" ? mode : "bank";
}

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
  const [showNewItemDialog, setShowNewItemDialog] = useState(false);

  const balancesQuery = trpc.balances.list.useQuery({ monthId: card.monthId });
  const createCard = trpc.cards.create.useMutation();
  const createItem = trpc.items.create.useMutation();
  const updateCreatedItem = trpc.items.update.useMutation();
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
      paymentMode: normalizePaymentMode(item.paymentMode),
      status: item.status,
    });
    onRefresh();
    toast.success("Item restaurado");
  };

  const handleAddItem = async (data: {
    name: string;
    dueDate: string;
    value: string;
    paidValue: string;
    paidAccountName: string;
    paymentMode: PaymentMode;
    status: "pago" | "parcial" | "pendente";
    priority: string;
  }) => {
    const paidAmount = parseMoney(data.paidValue);
    const created = await createItem.mutateAsync({
      cardId: card.id,
      name: withPriority(data.name, data.priority),
      dueDate: data.dueDate || undefined,
      value: data.value || "0.00",
      paidValue: "0.00",
      paidAccountName: null,
      status: "pendente",
    });
    if (paidAmount > 0) {
      await updateCreatedItem.mutateAsync({
        id: created.id,
        paidValue: data.paidValue,
        paidAccountName: data.paidAccountName.trim(),
        paymentMode: data.paymentMode,
        status: data.status,
      });
      await Promise.all([
        balancesQuery.refetch(),
        utils.balances.list.invalidate({ monthId: card.monthId }),
        utils.balances.transactions.invalidate({ monthId: card.monthId }),
        utils.months.getAnalytics.invalidate(),
      ]);
    }
    setShowNewItemDialog(false);
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
        paymentMode: normalizePaymentMode(item.paymentMode),
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
    <div className="overflow-hidden rounded-3xl border border-white/5 bg-zinc-900 shadow-sm transition-all hover:border-purple-500/30 hover:shadow-lg hover:shadow-purple-500/5 sm:rounded-2xl">
      {/* Card Header */}
      <div className="flex items-center justify-between border-b border-white/5 bg-zinc-900/80 px-4 py-4 sm:py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-primary/10 text-primary">
            <CardCategoryIcon name={card.name} className="h-4 w-4" />
          </span>
          <h3 className="font-semibold text-sm text-foreground" >
            {card.name}
          </h3>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={handleRenameCard} className="h-9 w-9 p-0 text-gray-500 hover:text-primary sm:h-6 sm:w-6">
            <Edit2 className="w-4 h-4 sm:w-3 sm:h-3" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleDeleteCard} className="h-9 w-9 p-0 text-gray-500 hover:text-red-400 sm:h-6 sm:w-6">
            <Trash2 className="w-4 h-4 sm:w-3 sm:h-3" />
          </Button>
        </div>
      </div>

      {/* Items */}
      <div className="flex flex-col">
        {sortedItems.map(item => (
          <ItemRow
            key={item.id}
            item={item}
            onEdit={() => setEditingItem(item.id)}
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
      <div className="border-t border-border bg-card px-4 py-3 sm:py-2">
        <Button variant="ghost" size="sm" onClick={() => setShowNewItemDialog(true)} className="h-11 w-full justify-start gap-2 rounded-2xl text-sm text-gray-500 hover:text-foreground sm:h-8 sm:text-xs">
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

      <ExpenseItemDialog
        open={showNewItemDialog}
        title="Nova despesa"
        balances={balancesQuery.data || []}
        item={null}
        isSaving={createItem.isPending || updateCreatedItem.isPending}
        onClose={() => setShowNewItemDialog(false)}
        onSave={handleAddItem}
      />

      {sortedItems.map(item => (
        <ExpenseItemDialog
          key={`dialog-${item.id}`}
          open={editingItem === item.id}
          title="Editar despesa"
          balances={balancesQuery.data || []}
          item={item}
          isSaving={false}
          onClose={() => setEditingItem(null)}
          onSave={() => undefined}
          onUpdated={() => {
            onRefresh();
            void balancesQuery.refetch();
            void utils.balances.list.invalidate({ monthId: card.monthId });
            void utils.balances.transactions.invalidate({ monthId: card.monthId });
            void utils.months.getAnalytics.invalidate();
            setEditingItem(null);
          }}
        />
      ))}
    </div>
  );
}

function ItemRow({ item, onEdit, onRefresh, onBalancesRefresh, onDelete, balances }: {
  item: ExpenseItem;
  onEdit: () => void;
  onRefresh: () => void;
  onBalancesRefresh: () => void;
  onDelete: () => void;
  balances: Array<{ id: number; accountName: string }>;
}) {
  const [paidValue, setPaidValue] = useState(item.paidValue);
  const [paidAccountName, setPaidAccountName] = useState(item.paidAccountName || "");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(normalizePaymentMode(item.paymentMode));
  const [status, setStatus] = useState<"pago" | "parcial" | "pendente">(item.status);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentAccountName, setPaymentAccountName] = useState("");
  const [quickPaymentMode, setQuickPaymentMode] = useState<PaymentMode>("bank");

  const updateItem = trpc.items.update.useMutation({
    onSuccess: () => {
      onRefresh();
      onBalancesRefresh();
    },
    onError: (error) => toast.error(error.message || "Não foi possível atualizar a despesa"),
  });

  // Sync local state when item changes from outside
  useEffect(() => {
    setPaidValue(item.paidValue);
    setPaidAccountName(item.paidAccountName || "");
    setPaymentMode(normalizePaymentMode(item.paymentMode));
    setStatus(item.status);
  }, [item]);

  const statusColors: Record<string, string> = {
    pago: 'bg-green-500/10 text-green-400 border-green-500/20',
    parcial: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    pendente: 'bg-zinc-800 text-zinc-300 border-zinc-700',
  };

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
      setPaymentMode("bank");
      updateItem.mutate({ id: item.id, status: "pendente", paidValue: "0.00", paidAccountName: null, paymentMode: "bank" });
      return;
    }

    setQuickPaymentMode(normalizePaymentMode(item.paymentMode));
    setPaymentAccountName(item.paidAccountName || balances[0]?.accountName || "");
    setShowPaymentDialog(true);
  };

  const confirmPayment = () => {
    const accountName = paymentAccountName.trim();
    if (quickPaymentMode === "bank" && !accountName) return;
    setStatus("pago");
    setPaidValue(item.value);
    setPaidAccountName(quickPaymentMode === "bank" ? accountName : "");
    setPaymentMode(quickPaymentMode);
    updateItem.mutate({
      id: item.id,
      status: "pago",
      paidValue: item.value,
      paidAccountName: quickPaymentMode === "bank" ? accountName : null,
      paymentMode: quickPaymentMode,
    });
    setShowPaymentDialog(false);
  };

  return (
    <>
      <div
        className="flex min-h-[82px] cursor-pointer flex-col justify-between gap-3 border-b border-white/5 px-4 py-4 transition-colors last:border-0 hover:bg-zinc-800/40 sm:min-h-0 sm:flex-row sm:items-center sm:gap-0 sm:py-3"
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
            {paidAmount > 0 && normalizePaymentMode(item.paymentMode) !== "bank" && (
              <span className="text-[10px] text-blue-200/80 font-mono">{paymentModeLabel(normalizePaymentMode(item.paymentMode))}</span>
            )}
            {isPartial && (
              <>
                <span className="text-[10px] text-green-600 font-medium">Pago {formatBrl(paidAmount)}</span>
                <span className="text-[10px] text-blue-200 font-medium">Falta {formatBrl(remainingAmount)}</span>
                {(!item.paidAccountName && normalizePaymentMode(item.paymentMode) === "bank") && (
                  <span className="text-[10px] text-red-300 font-medium">Banco não informado</span>
                )}
              </>
            )}
          </div>
          </div>
        </div>
        <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto sm:ml-2 mt-1 sm:mt-0">
          <span className={`text-base font-semibold sm:text-sm ${isPaid ? 'text-green-600' : 'text-foreground'}`}>
            {formatBrl(parseMoney(item.value))}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleToggleStatus();
            }}
            className={`min-h-9 min-w-[88px] cursor-pointer rounded-full border px-3 py-1 text-center text-[11px] font-semibold uppercase transition-opacity hover:opacity-80 sm:min-h-0 sm:min-w-[70px] sm:px-2.5 sm:py-0.5 sm:text-[10px] ${statusColors[item.status]}`}
          >
            {item.status}
          </button>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="h-9 w-9 rounded-full text-gray-400 hover:text-red-500 sm:h-6 sm:w-6"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="border border-border bg-card text-card-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-primary font-mono text-sm uppercase tracking-widest">Registrar pagamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Informe como esse pagamento foi feito para {cleanItemName(item.name)}.
            </p>
            <div className="grid grid-cols-1 gap-2">
              {PAYMENT_MODE_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setQuickPaymentMode(option.value)}
                  className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${quickPaymentMode === option.value ? "border-primary bg-primary/10 text-primary" : "border-border bg-background/40 text-muted-foreground hover:text-foreground"}`}
                >
                  <span className="block font-semibold">{option.label}</span>
                  <span className="text-[10px] opacity-80">{option.description}</span>
                </button>
              ))}
            </div>
            <BankAccountPicker
              value={paymentAccountName}
              onChange={setPaymentAccountName}
              accounts={balances}
              label="Banco usado"
              placeholder="Ex: Inter, C6, Caixa"
              disabled={quickPaymentMode !== "bank"}
              autoFocus
              helperText={quickPaymentMode === "bank" ? "Se a conta ainda não existir em Saldos, ela será criada com o valor descontado." : "Essa opção não altera o saldo bancário agora."}
            />
          </div>
          <DialogFooter className="grid grid-cols-1 gap-2 sm:flex">
            <Button variant="ghost" onClick={() => setShowPaymentDialog(false)} className="h-11 text-xs text-gray-400">Cancelar</Button>
            <Button onClick={confirmPayment} disabled={(quickPaymentMode === "bank" && !paymentAccountName.trim()) || updateItem.isPending} className="h-11 text-xs">
              Confirmar pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type ExpenseFormData = {
  name: string;
  dueDate: string;
  value: string;
  paidValue: string;
  paidAccountName: string;
  paymentMode: PaymentMode;
  status: "pago" | "parcial" | "pendente";
  priority: string;
};

function ExpenseItemDialog({
  open,
  title,
  balances,
  item,
  isSaving,
  onClose,
  onSave,
  onUpdated,
}: {
  open: boolean;
  title: string;
  balances: Array<{ id: number; accountName: string }>;
  item: ExpenseItem | null;
  isSaving: boolean;
  onClose: () => void;
  onSave: (data: ExpenseFormData) => void | Promise<void>;
  onUpdated?: () => void;
}) {
  const [name, setName] = useState(item ? cleanItemName(item.name) : "");
  const [dueDate, setDueDate] = useState(item?.dueDate || "");
  const [value, setValue] = useState(item?.value || "0.00");
  const [paidValue, setPaidValue] = useState(item?.paidValue || "0.00");
  const [paymentNow, setPaymentNow] = useState("");
  const [paidAccountName, setPaidAccountName] = useState(item?.paidAccountName || "");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(normalizePaymentMode(item?.paymentMode));
  const [status, setStatus] = useState<"pago" | "parcial" | "pendente">(item?.status || "pendente");
  const [priority, setPriority] = useState(item ? getItemPriority(item.name) : "none");

  const updateItem = trpc.items.update.useMutation({
    onSuccess: () => {
      toast.success("Despesa atualizada");
      onUpdated?.();
    },
    onError: (error) => toast.error(error.message || "Não foi possível salvar a despesa"),
  });
  const restorePrevious = trpc.items.restorePrevious.useMutation({
    onSuccess: () => {
      toast.success("Alteração anterior restaurada");
      onUpdated?.();
    },
    onError: (error) => toast.error(error.message || "Não encontrei uma alteração anterior para restaurar"),
  });

  useEffect(() => {
    if (!open) return;
    setName(item ? cleanItemName(item.name) : "");
    setDueDate(item?.dueDate || "");
    setValue(item?.value || "0.00");
    setPaidValue(item?.paidValue || "0.00");
    setPaymentNow("");
    setPaidAccountName(item?.paidAccountName || "");
    setPaymentMode(normalizePaymentMode(item?.paymentMode));
    setStatus(item?.status || "pendente");
    setPriority(item ? getItemPriority(item.name) : "none");
  }, [item, open]);

  const setPaidAndStatus = (nextPaidValue: string, nextValue = value) => {
    const paidAmount = parseMoney(nextPaidValue);
    setPaidValue(nextPaidValue);
    if (paidAmount <= 0) {
      setStatus("pendente");
      setPaidAccountName("");
      return;
    }
    if (paymentMode === "bank" && !paidAccountName && balances[0]?.accountName) setPaidAccountName(balances[0].accountName);
    setStatus(paidAmount >= parseMoney(nextValue) ? "pago" : "parcial");
  };

  const setIncrementalPayment = (nextPaymentNow: string) => {
    setPaymentNow(nextPaymentNow);
    const currentPaid = item ? getPaidAmount(item) : 0;
    const nextPaidAmount = currentPaid + parseMoney(nextPaymentNow);
    if (nextPaidAmount <= 0) {
      setStatus(item?.status || "pendente");
      return;
    }
    if (paymentMode === "bank" && !paidAccountName && balances[0]?.accountName) setPaidAccountName(balances[0].accountName);
    setStatus(nextPaidAmount >= parseMoney(value) ? "pago" : "parcial");
  };

  const handleSubmit = async () => {
    const currentPaidAmount = item ? getPaidAmount(item) : 0;
    const paymentNowAmount = parseMoney(paymentNow);
    const paidAmount = item
      ? Math.min(parseMoney(value), currentPaidAmount + paymentNowAmount)
      : parseMoney(paidValue);
    const accountName = paidAccountName.trim();
    if (!name.trim()) {
      toast.error("Digite o nome da despesa");
      return;
    }
    if ((item ? paymentNowAmount > 0 : paidAmount > 0) && paymentMode === "bank" && !accountName) {
      toast.error("Informe de qual banco saiu o pagamento");
      return;
    }

    const payload: ExpenseFormData = {
      name,
      dueDate,
      value: value || "0.00",
      paidValue: paidAmount > 0 ? paidAmount.toFixed(2) : "0.00",
      paidAccountName: paymentMode === "bank" ? accountName : "",
      paymentMode,
      status: paidAmount <= 0 ? "pendente" : paidAmount >= parseMoney(value) ? "pago" : "parcial",
      priority,
    };

    if (item) {
      const updatePayload: {
        id: number;
        name: string;
        dueDate: string;
        value: string;
        paidValue?: string;
        paidAccountName?: string | null;
        paymentMode?: PaymentMode;
        status?: "pago" | "parcial" | "pendente";
      } = {
        id: item.id,
        name: withPriority(payload.name, payload.priority),
        dueDate: payload.dueDate,
        value: payload.value,
      };

      if (paymentNowAmount > 0) {
        updatePayload.paidValue = payload.paidValue;
        updatePayload.paidAccountName = paidAmount > 0 && paymentMode === "bank" ? (accountName || item.paidAccountName || null) : null;
        updatePayload.paymentMode = paymentMode;
        updatePayload.status = payload.status;
      }

      updateItem.mutate(updatePayload);
      return;
    }

    await onSave(payload);
  };

  const visiblePaymentAmount = item ? parseMoney(paymentNow) : parseMoney(paidValue);
  const projectedPaidAmount = item
    ? Math.min(parseMoney(value), getPaidAmount(item) + visiblePaymentAmount)
    : parseMoney(paidValue);
  const remainingToPay = Math.max(parseMoney(value) - (item ? getPaidAmount(item) : 0), 0);
  const fillRemainingPayment = () => {
    const nextValue = remainingToPay.toFixed(2);
    if (item) {
      setIncrementalPayment(nextValue);
    } else {
      setPaidAndStatus(value || "0.00");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent className="border border-border bg-card text-card-foreground sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-primary font-mono text-sm uppercase tracking-widest">{title}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Nome da conta</Label>
            <input
              className="h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              value={name}
              onChange={event => setName(event.target.value)}
              placeholder="Ex: Aluguel"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Vencimento</Label>
            <input
              className="h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              value={dueDate}
              onChange={event => setDueDate(event.target.value)}
              placeholder="Ex: 20/05"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Valor (R$)</Label>
            <input
              className="h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              type="number"
              step="0.01"
              value={value}
              onChange={event => {
                setValue(event.target.value);
                if (parseMoney(paidValue) > 0) setPaidAndStatus(paidValue, event.target.value);
              }}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-[10px] uppercase text-muted-foreground">
                {item ? "Pagar agora (R$)" : "Pago (R$)"}
              </Label>
              <button
                type="button"
                onClick={fillRemainingPayment}
                disabled={remainingToPay <= 0}
                className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {item ? "Pagar restante" : "Pagar total"}
              </button>
            </div>
            <input
              className="h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              type="number"
              step="0.01"
              value={item ? paymentNow : paidValue}
              onChange={event => item ? setIncrementalPayment(event.target.value) : setPaidAndStatus(event.target.value)}
              placeholder="0.00"
            />
            {item && (
              <p className="text-[10px] text-muted-foreground">
                Já pago: {formatBrl(getPaidAmount(item))} · Após salvar: {formatBrl(projectedPaidAmount)}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Prioridade</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className="h-11 w-full rounded-xl bg-background">
                <SelectValue placeholder="Prioridade" />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-lg border border-white/5 bg-black/20 p-3 sm:col-span-2">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-primary">Como foi pago</p>
                <p className="text-xs text-muted-foreground">
                  {visiblePaymentAmount > 0
                    ? item
                      ? `${formatBrl(visiblePaymentAmount)} será somado ao pagamento atual.`
                      : paymentMode === "bank"
                        ? `${formatBrl(visiblePaymentAmount)} será descontado do banco escolhido.`
                        : `${formatBrl(visiblePaymentAmount)} será marcado sem mexer no saldo bancário.`
                    : "Informe um valor pago para escolher o banco."}
                </p>
              </div>
              {status === "parcial" && (
                <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-1 text-[10px] uppercase text-purple-300">
                  parcial
                </span>
              )}
            </div>
            <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {PAYMENT_MODE_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setPaymentMode(option.value);
                    if (option.value !== "bank") setPaidAccountName("");
                  }}
                  disabled={visiblePaymentAmount <= 0}
                  className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${paymentMode === option.value ? "border-primary bg-primary/10 text-primary" : "border-border bg-background/40 text-muted-foreground hover:text-foreground"}`}
                >
                  <span className="block font-semibold">{option.label}</span>
                  <span className="text-[10px] opacity-80">{option.description}</span>
                </button>
              ))}
            </div>
            <BankAccountPicker
              value={paidAccountName}
              onChange={setPaidAccountName}
              accounts={balances}
              label="Banco do pagamento"
              placeholder={visiblePaymentAmount > 0 && paymentMode === "bank" ? "Ex: Inter, C6, Caixa" : "Sem débito bancário"}
              disabled={visiblePaymentAmount <= 0 || paymentMode !== "bank"}
              helperText={visiblePaymentAmount > 0 && paymentMode === "bank" ? "Esse é o banco que será debitado ao salvar a despesa." : "Cartão e controle de orçamento não alteram o saldo bancário agora."}
            />
          </div>
        </div>

        <DialogFooter className="grid grid-cols-1 gap-2 sm:flex">
          {item && (
            <Button
              variant="ghost"
              onClick={() => restorePrevious.mutate({ id: item.id })}
              disabled={restorePrevious.isPending || updateItem.isPending}
              className="h-11 gap-1 text-xs text-blue-200 hover:text-blue-100 sm:mr-auto"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restaurar anterior
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} className="h-11 text-xs text-gray-400">Cancelar</Button>
          <Button onClick={() => { void handleSubmit(); }} disabled={isSaving || updateItem.isPending || restorePrevious.isPending} className="h-11 text-xs">
            {isSaving || updateItem.isPending ? "Salvando..." : "Salvar despesa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
