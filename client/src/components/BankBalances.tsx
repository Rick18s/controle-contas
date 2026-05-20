import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState, useEffect, useCallback, useRef } from "react";
import { Landmark, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatBrl, parseMoney } from "@/lib/money";

export default function BankBalances({ monthId }: { monthId: number }) {
  const balancesQuery = trpc.balances.list.useQuery({ monthId });
  const updateBalance = trpc.balances.update.useMutation({ onSuccess: () => balancesQuery.refetch() });
  const deleteBalance = trpc.balances.delete.useMutation();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountBalance, setNewAccountBalance] = useState("0.00");

  const balances = balancesQuery.data || [];
  const total = balances.reduce((sum, b) => sum + parseMoney(b.balance), 0);

  const handleUpdate = useCallback((accountName: string, balance: string) => {
    updateBalance.mutate({ monthId, accountName, balance });
  }, [monthId, updateBalance]);

  const handleAddBalance = async () => {
    const accountName = newAccountName.trim();
    if (!accountName) {
      toast.error("Digite o nome da conta");
      return;
    }

    await updateBalance.mutateAsync({
      monthId,
      accountName,
      balance: newAccountBalance || "0.00",
    });
    setShowAddDialog(false);
    setNewAccountName("");
    setNewAccountBalance("0.00");
    toast.success("Conta bancária adicionada");
  };

  const handleDeleteBalance = async (balance: { id: number; accountName: string }) => {
    await deleteBalance.mutateAsync({ id: balance.id });
    balancesQuery.refetch();
    toast.success(`Conta "${balance.accountName}" removida`);
  };

  return (
    <div className="rounded-2xl border border-white/5 bg-zinc-900 shadow-sm p-4 transition-all hover:border-purple-500/30">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-sm font-mono uppercase tracking-widest text-primary flex items-center gap-2" >
          <Landmark className="h-4 w-4" />
          Saldos Bancários
        </h2>
        <Button onClick={() => setShowAddDialog(true)} size="sm" variant="ghost" className="text-primary hover:text-primary/80 gap-1 text-xs">
          <Plus className="w-3 h-3" /> Nova conta
        </Button>
      </div>

      <div className="space-y-3">
        {balances.length === 0 && (
          <div className="rounded border border-border bg-muted/30 px-3 py-4 text-center">
            <p className="text-xs font-mono text-gray-400">
              Nenhuma conta bancária cadastrada.
            </p>
            <Button onClick={() => setShowAddDialog(true)} size="sm" variant="ghost" className="mt-2 text-primary hover:text-primary/80 gap-1 text-xs">
              <Plus className="w-3 h-3" /> Adicionar conta
            </Button>
          </div>
        )}
        {balances.map(b => (
          <BalanceInput
            key={b.id}
            label={b.accountName}
            value={b.balance}
            onSave={(val) => handleUpdate(b.accountName, val)}
            onDelete={() => { void handleDeleteBalance(b); }}
          />
        ))}
      </div>

      <div className="mt-4 pt-3 border-t flex justify-between text-xs font-mono" style={{ borderColor: 'rgba(0,240,255,0.1)' }}>
        <span className="text-gray-500 uppercase">Soma Total</span>
        <span className="text-primary font-bold">{formatBrl(total)}</span>
      </div>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="bg-card text-card-foreground border border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-primary font-mono text-sm uppercase tracking-widest">Nova conta bancária</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-widest text-gray-500" htmlFor="new-bank-account-name">Nome da conta</label>
              <input
                id="new-bank-account-name"
                className="w-full rounded border border-border bg-background/50 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-cyan-400"
                value={newAccountName}
                onChange={(event) => setNewAccountName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleAddBalance();
                }}
                placeholder="Ex: Nubank, Inter, Caixa"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-widest text-gray-500" htmlFor="new-bank-account-balance">Saldo inicial</label>
              <input
                id="new-bank-account-balance"
                className="w-full rounded border border-border bg-background/50 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-cyan-400"
                type="number"
                step="0.01"
                value={newAccountBalance}
                onChange={(event) => setNewAccountBalance(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleAddBalance();
                }}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setShowAddDialog(false)} className="text-gray-400 text-xs">Cancelar</Button>
            <Button onClick={() => { void handleAddBalance(); }} disabled={updateBalance.isPending} className="text-xs" >
              {updateBalance.isPending ? "Adicionando..." : "Adicionar conta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BalanceInput({ label, value, onSave, onDelete }: { label: string; value: string; onSave: (val: string) => void; onDelete: () => void }) {
  const [localValue, setLocalValue] = useState(value);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (newVal: string) => {
    setLocalValue(newVal);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSave(newVal || "0.00");
    }, 800);
  };

  return (
    <div className="flex items-center justify-between gap-3 p-2 rounded-lg border border-white/5 bg-zinc-800/50">
      <span className="text-[11px] font-mono text-gray-400 uppercase tracking-wide flex-1">{label}</span>
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-gray-600">R$</span>
        <input
          type="number"
          step="0.01"
          value={localValue}
          onChange={e => handleChange(e.target.value)}
          className="bg-transparent border-none text-right text-sm font-mono font-bold text-primary w-28 focus:outline-none focus:text-white"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="text-gray-600 hover:text-red-400 h-6 w-6 p-0"
          title="Remover conta"
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}
