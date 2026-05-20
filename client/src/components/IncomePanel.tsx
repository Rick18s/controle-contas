import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Check } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { formatBrl, parseMoney } from "@/lib/money";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function IncomePanel({ monthId }: { monthId: number }) {
  const utils = trpc.useUtils();
  const incomeQuery = trpc.income.list.useQuery({ monthId });
  const balancesQuery = trpc.balances.list.useQuery({ monthId });
  const createIncome = trpc.income.create.useMutation();
  const updateIncome = trpc.income.update.useMutation({ onSuccess: () => incomeQuery.refetch() });
  const setIncomeReceived = trpc.income.setReceived.useMutation({
    onSuccess: async () => {
      await Promise.all([
        incomeQuery.refetch(),
        balancesQuery.refetch(),
        utils.months.getAnalytics.invalidate(),
      ]);
    },
    onError: (error) => toast.error(error.message || "Não foi possível atualizar a entrada"),
  });
  const deleteIncome = trpc.income.delete.useMutation();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [receiptTarget, setReceiptTarget] = useState<{ id: number; name: string; value: string } | null>(null);
  const [receiptAccountName, setReceiptAccountName] = useState("");

  const entries = incomeQuery.data || [];
  const balances = balancesQuery.data || [];
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

  const openReceiveDialog = (entry: { id: number; name: string; value: string }) => {
    if (balances.length === 0) {
      toast.error("Cadastre uma conta em Saldos antes de marcar como recebido");
      return;
    }
    setReceiptTarget(entry);
    setReceiptAccountName(balances[0].accountName);
  };

  const confirmReceived = async () => {
    if (!receiptTarget || !receiptAccountName) return;
    await setIncomeReceived.mutateAsync({ id: receiptTarget.id, received: 1, accountName: receiptAccountName });
    toast.success(`Entrada recebida em ${receiptAccountName}`);
    setReceiptTarget(null);
    setReceiptAccountName("");
  };

  return (
    <div className="rounded-2xl border border-white/5 bg-zinc-900 shadow-sm p-4 transition-all hover:border-purple-500/30">
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
            onToggleReceived={() => {
              if (entry.received === 1) {
                setIncomeReceived.mutate({ id: entry.id, received: 0 });
              } else {
                openReceiveDialog(entry);
              }
            }}
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

      <Dialog open={Boolean(receiptTarget)} onOpenChange={(open) => { if (!open) setReceiptTarget(null); }}>
        <DialogContent className="bg-card text-card-foreground border border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-primary font-mono text-sm uppercase tracking-widest">Receber entrada</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Escolha em qual banco entrou {receiptTarget ? formatBrl(parseMoney(receiptTarget.value)) : ""}.
            </p>
            <Select value={receiptAccountName} onValueChange={setReceiptAccountName}>
              <SelectTrigger className="bg-background border-border">
                <SelectValue placeholder="Escolha a conta" />
              </SelectTrigger>
              <SelectContent>
                {balances.map(balance => (
                  <SelectItem key={balance.id} value={balance.accountName}>{balance.accountName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              O saldo do banco será atualizado automaticamente. Se você desfizer, o valor será removido da mesma conta.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setReceiptTarget(null)} className="text-gray-400 text-xs">Cancelar</Button>
            <Button onClick={() => { void confirmReceived(); }} disabled={!receiptAccountName || setIncomeReceived.isPending} className="text-xs">
              Confirmar recebimento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function IncomeEntryCard({ entry, isEditing, onEdit, onClose, onUpdate, onDelete, onToggleReceived }: {
  entry: { id: number; name: string; value: string; received: number; receivedAccountName?: string | null };
  isEditing: boolean;
  onEdit: () => void;
  onClose: () => void;
  onUpdate: (data: { name?: string; value?: string }) => void;
  onDelete: () => void;
  onToggleReceived: () => void;
}) {
  const [name, setName] = useState(entry.name);
  const [value, setValue] = useState(entry.value);

  useEffect(() => {
    setName(entry.name);
    setValue(entry.value);
  }, [entry]);

  const saveEdit = () => {
    onUpdate({ name, value });
    onClose();
  };

  if (isEditing) {
    return (
      <div className="rounded-lg p-4 space-y-3 bg-card border border-border shadow-sm">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase text-muted-foreground">Nome da Entrada</Label>
          <input
            className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            value={name}
            onChange={e => setName(e.target.value)}
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
            onChange={e => setValue(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="flex justify-end pt-1">
          <Button size="sm" variant="ghost" onClick={saveEdit} className="text-muted-foreground hover:text-foreground text-xs h-7">Concluir Edição</Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg p-3 border cursor-pointer transition-all hover:border-purple-500/40 ${entry.received ? 'border-green-500/20 bg-green-500/5' : 'border-white/5 bg-zinc-800/50'}`}
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
        <div className="flex flex-col">
          <span className={`text-sm font-mono font-bold ${entry.received ? 'text-primary' : 'text-white'}`}>
            {formatBrl(parseMoney(entry.value))}
          </span>
          {entry.received === 1 && entry.receivedAccountName && (
            <span className="text-[10px] text-green-400/70 font-mono">{entry.receivedAccountName}</span>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleReceived();
          }}
          className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border cursor-pointer hover:opacity-80 transition-opacity ${entry.received ? 'text-green-400 border-green-500/20 bg-green-500/10' : 'text-purple-400 border-purple-500/20 bg-purple-500/10'}`}
        >
          {entry.received ? "recebido" : "pendente"}
        </button>
      </div>
    </div>
  );
}
