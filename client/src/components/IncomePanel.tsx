import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Check } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { formatBrl, parseMoney } from "@/lib/money";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export default function IncomePanel({ monthId }: { monthId: number }) {
  const incomeQuery = trpc.income.list.useQuery({ monthId });
  const createIncome = trpc.income.create.useMutation();
  const updateIncome = trpc.income.update.useMutation({ onSuccess: () => incomeQuery.refetch() });
  const deleteIncome = trpc.income.delete.useMutation();

  const [editingId, setEditingId] = useState<number | null>(null);

  const entries = incomeQuery.data || [];
  const totalIncome = entries.reduce((sum, e) => sum + parseMoney(e.value), 0);
  const totalReceived = entries.filter(e => e.received === 1).reduce((sum, e) => sum + parseMoney(e.value), 0);

  const handleAdd = async () => {
    await createIncome.mutateAsync({ monthId, name: "Nova entrada", value: "0.00", received: 0 });
    incomeQuery.refetch();
    toast.success("Entrada adicionada");
  };

  const restoreIncome = async (entry: { name: string; value: string; received: number }) => {
    await createIncome.mutateAsync({
      monthId,
      name: entry.name,
      value: entry.value,
      received: entry.received,
    });
    incomeQuery.refetch();
    toast.success("Entrada restaurada");
  };

  const handleDeleteIncome = async (entry: { id: number; name: string; value: string; received: number }) => {
    await deleteIncome.mutateAsync({ id: entry.id });
    incomeQuery.refetch();
    toast.success("Entrada removida", {
      duration: 10000,
      action: {
        label: "Desfazer",
        onClick: () => { void restoreIncome(entry); },
      },
    });
  };

  return (
    <div className="rounded-lg border border-border bg-card glass-card hover:border-primary/50 p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-mono uppercase tracking-widest text-primary" >
          💰 Entradas
        </h2>
        <Button onClick={handleAdd} size="sm" variant="ghost" className="text-green-400 hover:text-green-300 gap-1 text-xs">
          <Plus className="w-3 h-3" /> Nova Entrada
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {entries.map(entry => (
          <IncomeEntryCard
            key={entry.id}
            entry={entry}
            isEditing={editingId === entry.id}
            onEdit={() => setEditingId(entry.id)}
            onClose={() => setEditingId(null)}
            onUpdate={(data) => updateIncome.mutate({ id: entry.id, ...data })}
            onDelete={() => { void handleDeleteIncome(entry); }}
            onToggleReceived={() => updateIncome.mutate({ id: entry.id, received: entry.received === 1 ? 0 : 1 })}
          />
        ))}
      </div>

      {/* Totals */}
      <div className="mt-4 pt-3 border-t flex gap-6 text-xs font-mono" style={{ borderColor: 'rgba(0,240,255,0.1)' }}>
        <div>
          <span className="text-gray-500 uppercase">Total Previsto: </span>
          <span className="text-primary">{formatBrl(totalIncome)}</span>
        </div>
        <div>
          <span className="text-gray-500 uppercase">Recebido: </span>
          <span className="text-primary">{formatBrl(totalReceived)}</span>
        </div>
      </div>
    </div>
  );
}

function IncomeEntryCard({ entry, isEditing, onEdit, onClose, onUpdate, onDelete, onToggleReceived }: {
  entry: { id: number; name: string; value: string; received: number };
  isEditing: boolean;
  onEdit: () => void;
  onClose: () => void;
  onUpdate: (data: { name?: string; value?: string }) => void;
  onDelete: () => void;
  onToggleReceived: () => void;
}) {
  const [name, setName] = useState(entry.name);
  const [value, setValue] = useState(entry.value);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setName(entry.name);
    setValue(entry.value);
  }, [entry]);

  const autoSave = (patch: { name?: string; value?: string }) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onUpdate(patch);
    }, 600);
  };

  if (isEditing) {
    return (
      <div className="rounded-lg p-4 space-y-3 bg-card border border-border shadow-sm">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase text-muted-foreground">Nome da Entrada</Label>
          <input
            className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            value={name}
            onChange={e => { setName(e.target.value); autoSave({ name: e.target.value, value }); }}
            placeholder="Ex: Salário"
            autoFocus
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase text-muted-foreground">Valor Previsto (R$)</Label>
          <input
            className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            type="number"
            step="0.01"
            value={value}
            onChange={e => { setValue(e.target.value); autoSave({ name, value: e.target.value }); }}
            placeholder="0.00"
          />
        </div>
        <div className="flex justify-end pt-1">
          <Button size="sm" variant="ghost" onClick={onClose} className="text-muted-foreground hover:text-foreground text-xs h-7">Concluir Edição</Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg p-3 border cursor-pointer transition-all hover:border-primary/40 ${entry.received ? 'border-green-600/30 bg-green-950/20' : 'border-border bg-card'}`}
      onClick={onEdit}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`text-xs font-mono font-bold truncate ${entry.received ? 'text-green-400 line-through opacity-70' : 'text-primary'}`}>
            {entry.name}
          </span>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="text-gray-600 hover:text-red-400 h-5 w-5 p-0"
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span className={`text-sm font-mono font-bold ${entry.received ? 'text-primary' : 'text-white'}`}>
          {formatBrl(parseMoney(entry.value))}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleReceived();
          }}
          className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border cursor-pointer hover:opacity-80 transition-opacity ${entry.received ? 'text-green-400 border-green-600/50 bg-green-900/30' : 'text-blue-200 border-blue-500/50 bg-blue-950/30'}`}
        >
          {entry.received ? "recebido" : "pendente"}
        </button>
      </div>
    </div>
  );
}
