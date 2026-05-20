import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface QuickAddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  monthId: number;
  onSuccess: () => void;
}

export default function QuickAddDialog({ open, onOpenChange, monthId, onSuccess }: QuickAddDialogProps) {
  const [text, setText] = useState("");
  const [accountName, setAccountName] = useState("");
  const utils = trpc.useUtils();
  const balancesQuery = trpc.balances.list.useQuery({ monthId }, { enabled: open });
  const balances = balancesQuery.data || [];
  const quickAdd = trpc.ai.quickAdd.useMutation({
    onSuccess: async (result) => {
      await Promise.all([
        utils.cards.list.invalidate({ monthId }),
        utils.income.list.invalidate({ monthId }),
        utils.balances.list.invalidate({ monthId }),
        utils.months.getAnalytics.invalidate(),
      ]);
      toast.success(`${result.name} adicionado`);
      setText("");
      onOpenChange(false);
      onSuccess();
    },
    onError: (error) => {
      toast.error(error.message || "Não foi possível interpretar sua requisição.");
    }
  });

  const handleQuickAdd = () => {
    if (!text.trim()) return;
    quickAdd.mutate({ monthId, text, accountName: accountName || undefined });
  };

  useEffect(() => {
    if (open && balances.length > 0 && !accountName) {
      setAccountName(balances[0].accountName);
    }
  }, [accountName, balances, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] border-none shadow-2xl bg-slate-900 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="w-5 h-5 text-amber-400" />
            Adição Mágica
          </DialogTitle>
          <DialogDescription className="text-slate-400 pt-2 text-sm leading-relaxed">
            Escreva o que você quer adicionar e nossa IA fará o resto. Ela vai descobrir se é uma despesa ou receita, criar a categoria se não existir, e lançar no sistema.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          <Input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !quickAdd.isPending) handleQuickAdd();
            }}
            placeholder="Ex: Almoço com cliente 45.90"
            className="text-lg py-6 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-amber-500/50"
            disabled={quickAdd.isPending}
          />
          <div className="mt-3 space-y-2">
            <label className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
              Conta bancária movimentada
            </label>
            {balances.length > 0 ? (
              <Select value={accountName} onValueChange={setAccountName} disabled={quickAdd.isPending}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue placeholder="Escolha a conta" />
                </SelectTrigger>
                <SelectContent>
                  {balances.map(balance => (
                    <SelectItem key={balance.id} value={balance.accountName}>{balance.accountName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-xs text-slate-500">
                Cadastre uma conta em Saldos para atualizar o banco automaticamente.
              </p>
            )}
            <p className="text-[11px] text-slate-500">
              Gastos rápidos entram como pagos. Entradas rápidas entram como recebidas.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button 
            onClick={handleQuickAdd} 
            disabled={!text.trim() || quickAdd.isPending}
            className="w-full h-12 bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold text-base transition-colors"
          >
            {quickAdd.isPending ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Pensando...
              </>
            ) : (
              "Adicionar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
