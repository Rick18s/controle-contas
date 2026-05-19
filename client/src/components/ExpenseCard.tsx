import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Edit2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { formatBrl, getPaidAmount, getRemainingAmount, parseMoney } from "@/lib/money";
import { CardCategoryIcon } from "@/components/CardCategoryIcon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface ExpenseItem {
  id: number;
  cardId: number;
  name: string;
  dueDate: string | null;
  value: string;
  paidValue: string;
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
  const [editingItem, setEditingItem] = useState<number | null>(null);

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
    <div className="rounded-2xl overflow-hidden border border-border bg-card shadow-sm hover:border-primary/40 transition-colors">
      {/* Card Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-cyan-950/10">
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
            onDelete={() => { void handleDeleteItem(item); }}
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
      <div className="px-4 py-3 border-t border-border bg-cyan-950/10">
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

function ItemRow({ item, isEditing, onEdit, onClose, onRefresh, onDelete }: {
  item: ExpenseItem;
  isEditing: boolean;
  onEdit: () => void;
  onClose: () => void;
  onRefresh: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(cleanItemName(item.name));
  const [dueDate, setDueDate] = useState(item.dueDate || "");
  const [value, setValue] = useState(item.value);
  const [paidValue, setPaidValue] = useState(item.paidValue);
  const [status, setStatus] = useState<"pago" | "parcial" | "pendente">(item.status);
  const [priority, setPriority] = useState(getItemPriority(item.name));
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const updateItem = trpc.items.update.useMutation({ onSuccess: () => onRefresh() });

  // Sync local state when item changes from outside
  useEffect(() => {
    setName(cleanItemName(item.name));
    setDueDate(item.dueDate || "");
    setValue(item.value);
    setPaidValue(item.paidValue);
    setStatus(item.status);
    setPriority(getItemPriority(item.name));
  }, [item]);

  const autoSave = (patch: Partial<{ name: string; dueDate: string; value: string; paidValue: string; status: "pago" | "parcial" | "pendente" }>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateItem.mutate({ id: item.id, ...patch });
    }, 600);
  };

  const savedName = (nextName = name, nextPriority = priority) => withPriority(nextName, nextPriority);

  const statusColors: Record<string, string> = {
    pago: 'bg-green-100 text-green-700 border-green-200',
    parcial: 'bg-blue-950/40 text-blue-200 border-blue-500/40',
    pendente: 'bg-cyan-950/30 text-cyan-200 border-cyan-500/30',
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
              onChange={e => { setName(e.target.value); autoSave({ name: savedName(e.target.value), dueDate, value, paidValue, status }); }}
              placeholder="Ex: Aluguel"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Vencimento</Label>
            <input
              className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              value={dueDate}
              onChange={e => { setDueDate(e.target.value); autoSave({ name: savedName(), dueDate: e.target.value, value, paidValue, status }); }}
              placeholder="Ex: 20/05"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
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
                autoSave({ name: savedName(), dueDate, value: newVal, paidValue, status: s }); 
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
                setPaidValue(newPaid);
                // Auto-calc status based on payment
                let s = "pendente" as "pago" | "parcial" | "pendente";
                if (Number(newPaid) > 0) {
                  s = Number(newPaid) >= Number(value) ? "pago" : "parcial";
                }
                setStatus(s);
                autoSave({ name: savedName(), dueDate, value, paidValue: newPaid, status: s }); 
              }}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Prioridade</Label>
            <Select
              value={priority}
              onValueChange={(nextPriority) => {
                setPriority(nextPriority);
                autoSave({ name: savedName(name, nextPriority), dueDate, value, paidValue, status });
              }}
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
        </div>

        <div className="flex justify-end pt-1">
          <Button size="sm" variant="ghost" onClick={onClose} className="text-muted-foreground hover:text-foreground text-xs h-7">Concluir Edição</Button>
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
    const s = isCurrentlyPaid ? "pendente" : "pago";
    const nextPaidValue = isCurrentlyPaid ? "0.00" : item.value;
    
    setStatus(s);
    setPaidValue(nextPaidValue);
    updateItem.mutate({ id: item.id, status: s, paidValue: nextPaidValue });
  };

  return (
    <div
      className="flex items-center justify-between px-4 py-3 cursor-pointer transition-colors hover:bg-cyan-400/[0.05] border-b border-border last:border-0"
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
          {isPartial && (
            <>
              <span className="text-[10px] text-green-600 font-medium">Pago {formatBrl(paidAmount)}</span>
              <span className="text-[10px] text-blue-200 font-medium">Falta {formatBrl(remainingAmount)}</span>
            </>
          )}
        </div>
        </div>
      </div>
      <div className="flex items-center gap-3 ml-2">
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
  );
}
