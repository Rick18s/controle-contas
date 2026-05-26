import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import BankAccountPicker from "@/components/BankAccountPicker";

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
  const quickAdd = trpc.ai.quickAdd.useMutation({
    onSuccess: async (result) => {
      await Promise.all([
        utils.cards.list.invalidate({ monthId }),
        utils.income.list.invalidate({ monthId }),
        utils.balances.list.invalidate({ monthId }),
        utils.balances.transactions.invalidate({ monthId }),
        utils.months.getAnalytics.invalidate(),
      ]);
      if (result.type === "expense" && "matchedExisting" in result && result.matchedExisting) {
        toast.success(`${result.name}: pagamento abatido. Restante: ${Number(result.remaining || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`);
      } else {
        toast.success(`${result.name} adicionado`);
      }
      setText("");
      onOpenChange(false);
      onSuccess();
    },
    onError: (error) => {
      toast.error(error.message || "Não foi possível interpretar sua requisição.");
    }
  });

  useEffect(() => {
    if (open && !accountName.trim() && balancesQuery.data?.[0]?.accountName) {
      setAccountName(balancesQuery.data[0].accountName);
    }
  }, [accountName, balancesQuery.data, open]);

  const handleQuickAdd = () => {
    if (!text.trim()) return;
    quickAdd.mutate({ monthId, text, accountName: accountName.trim() || null });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border border-white/10 bg-slate-900 text-white shadow-2xl sm:max-w-[425px]">
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
            className="h-12 bg-slate-800 py-3 text-base text-white placeholder:text-slate-500 focus-visible:ring-primary/50 sm:py-6 sm:text-lg"
            disabled={quickAdd.isPending}
          />
          <p className="mt-3 text-[11px] text-slate-500">
            Gastos rápidos entram como pagos. Entradas ficam pendentes até você marcar como recebidas e escolher o banco.
          </p>
          <div className="mt-4 rounded-xl border border-slate-700/70 bg-slate-950/40 p-3">
            <BankAccountPicker
              value={accountName}
              onChange={setAccountName}
              accounts={balancesQuery.data || []}
              label="Banco para gastos pagos"
              placeholder="Ex: Inter, C6, Caixa"
              helperText="Se for uma despesa já paga, o valor será descontado deste banco. Se for receita, ela continua pendente para você receber depois."
            />
          </div>
        </div>

        <DialogFooter>
          <Button 
            onClick={handleQuickAdd} 
            disabled={!text.trim() || quickAdd.isPending}
            className="h-12 w-full bg-primary text-white transition-colors hover:bg-primary/90"
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
