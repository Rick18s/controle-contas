import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { formatBrl, parseMoney } from "@/lib/money";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import BankAccountPicker from "@/components/BankAccountPicker";

export default function IncomePanel({ monthId }: { monthId: number }) {
  const utils = trpc.useUtils();
  const incomeQuery = trpc.income.list.useQuery({ monthId });
  const balancesQuery = trpc.balances.list.useQuery({ monthId });
  const createIncome = trpc.income.create.useMutation();
  const updateIncome = trpc.income.update.useMutation({
    onSuccess: async () => {
      await Promise.all([
        incomeQuery.refetch(),
        balancesQuery.refetch(),
        utils.balances.transactions.invalidate({ monthId }),
      ]);
    },
  });
  const setIncomeReceived = trpc.income.setReceived.useMutation({
    onSuccess: async () => {
      await Promise.all([
        incomeQuery.refetch(),
        balancesQuery.refetch(),
        utils.balances.transactions.invalidate({ monthId }),
        utils.months.getAnalytics.invalidate(),
      ]);
    },
    onError: (error) => toast.error(error.message || "Não foi possível atualizar a entrada"),
  });
  const deleteIncome = trpc.income.delete.useMutation();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [showNewIncomeDialog, setShowNewIncomeDialog] = useState(false);
  const [receiptTarget, setReceiptTarget] = useState<{ id: number; name: string; value: string } | null>(null);
  const [receiptAccountName, setReceiptAccountName] = useState("");

  const entries = incomeQuery.data || [];
  const balances = balancesQuery.data || [];
  const totalIncome = entries.reduce((sum, e) => sum + parseMoney(e.value), 0);
  const totalReceived = entries.filter(e => e.received === 1).reduce((sum, e) => sum + parseMoney(e.value), 0);

  const handleAdd = async (data: { name: string; value: string }) => {
    await createIncome.mutateAsync({ monthId, name: data.name, value: data.value || "0.00", received: 0 });
    setShowNewIncomeDialog(false);
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
    void balancesQuery.refetch();
    void utils.balances.transactions.invalidate({ monthId });
    toast.success("Entrada removida", {
      duration: 10000,
      action: {
        label: "Desfazer",
        onClick: () => { void restoreIncome(entry); },
      },
    });
  };

  const openReceiveDialog = (entry: { id: number; name: string; value: string }) => {
    setReceiptTarget(entry);
    setReceiptAccountName(balances[0]?.accountName || "");
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
        <Button onClick={() => setShowNewIncomeDialog(true)} size="sm" variant="ghost" className="text-green-400 hover:text-green-300 gap-1 text-xs">
          <Plus className="w-3 h-3" /> Nova Entrada
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {entries.map(entry => (
          <IncomeEntryCard
            key={entry.id}
            entry={entry}
            onEdit={() => setEditingId(entry.id)}
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

      <IncomeEntryDialog
        open={showNewIncomeDialog}
        title="Nova entrada"
        entry={null}
        isSaving={createIncome.isPending}
        onClose={() => setShowNewIncomeDialog(false)}
        onSave={handleAdd}
      />

      {entries.map(entry => (
        <IncomeEntryDialog
          key={`income-dialog-${entry.id}`}
          open={editingId === entry.id}
          title="Editar entrada"
          entry={entry}
          isSaving={updateIncome.isPending}
          onClose={() => setEditingId(null)}
          onSave={(data) => {
            updateIncome.mutate({ id: entry.id, ...data });
            setEditingId(null);
          }}
        />
      ))}

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
            <BankAccountPicker
              value={receiptAccountName}
              onChange={setReceiptAccountName}
              accounts={balances}
              label="Banco de recebimento"
              placeholder="Ex: Inter, C6, Caixa"
              autoFocus
              helperText="O saldo do banco será atualizado automaticamente. Se a conta ainda não existir, ela será criada."
            />
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

function IncomeEntryCard({ entry, onEdit, onDelete, onToggleReceived }: {
  entry: { id: number; name: string; value: string; received: number; receivedAccountName?: string | null };
  onEdit: () => void;
  onDelete: () => void;
  onToggleReceived: () => void;
}) {
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

function IncomeEntryDialog({
  open,
  title,
  entry,
  isSaving,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  entry: { id: number; name: string; value: string } | null;
  isSaving: boolean;
  onClose: () => void;
  onSave: (data: { name: string; value: string }) => void | Promise<void>;
}) {
  const [name, setName] = useState(entry?.name || "");
  const [value, setValue] = useState(entry?.value || "0.00");

  useEffect(() => {
    if (!open) return;
    setName(entry?.name || "");
    setValue(entry?.value || "0.00");
  }, [entry, open]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Digite o nome da entrada");
      return;
    }
    await onSave({ name: name.trim(), value: value || "0.00" });
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent className="bg-card text-card-foreground border border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-primary font-mono text-sm uppercase tracking-widest">{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Nome da entrada</Label>
            <input
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              value={name}
              onChange={event => setName(event.target.value)}
              placeholder="Ex: Salário"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Valor previsto (R$)</Label>
            <input
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              type="number"
              step="0.01"
              value={value}
              onChange={event => setValue(event.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} className="text-gray-400 text-xs">Cancelar</Button>
          <Button onClick={() => { void handleSubmit(); }} disabled={isSaving} className="text-xs">
            {isSaving ? "Salvando..." : "Salvar entrada"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
