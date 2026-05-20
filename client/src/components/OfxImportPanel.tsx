import { useMemo, useState } from "react";
import { Upload, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

type OfxTransaction = {
  date: string;
  description: string;
  value: number;
  type: "income" | "expense";
  rawValue: number;
  fitId: string;
};

export default function OfxImportPanel({ monthId }: { monthId: number }) {
  const [transactions, setTransactions] = useState<OfxTransaction[]>([]);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [accountName, setAccountName] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const utils = trpc.useUtils();

  const saveOfx = trpc.imports.saveOfxTransactions.useMutation();

  const selectedTransactions = useMemo(
    () => transactions.filter((_transaction, index) => selected[index]),
    [transactions, selected]
  );

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".ofx")) {
      toast.error("Envie um arquivo .ofx");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    setIsUploading(true);
    try {
      const response = await fetch("/api/ofx/preview", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível ler o OFX");
      setTransactions(payload.transactions || []);
      setSelected(Object.fromEntries((payload.transactions || []).map((_entry: OfxTransaction, index: number) => [index, true])));
      toast.success(`${payload.transactions?.length || 0} transações encontradas`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao importar OFX");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    if (selectedTransactions.length === 0) {
      toast.error("Selecione pelo menos uma transação");
      return;
    }
    if (!accountName.trim()) {
      toast.error("Informe a conta bancária do extrato");
      return;
    }

    setIsSaving(true);
    try {
      const result = await saveOfx.mutateAsync({
        monthId,
        accountName: accountName.trim(),
        transactions: selectedTransactions,
      });

      await Promise.all([
        utils.cards.list.invalidate({ monthId }),
        utils.income.list.invalidate({ monthId }),
        utils.balances.list.invalidate({ monthId }),
        utils.balances.transactions.invalidate({ monthId }),
        utils.months.getAnalytics.invalidate(),
      ]);
      setTransactions([]);
      setSelected({});
      toast.success(`OFX salvo: ${result.imported} novas, ${result.skipped} duplicadas ignoradas`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar as transações");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card/60 p-4 sm:p-5 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-mono uppercase tracking-widest text-primary">Importar extrato OFX</h2>
          <p className="mt-1 text-xs text-muted-foreground">Pré-visualize o extrato antes de lançar no mês.</p>
        </div>
        <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-primary/50 px-4 py-2 text-xs font-mono text-primary hover:bg-primary/10">
          {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Escolher OFX
          <input className="hidden" type="file" accept=".ofx" onChange={(event) => void handleUpload(event.target.files?.[0])} />
        </label>
      </div>

      {transactions.length > 0 && (
        <>
          <div className="grid gap-2 sm:max-w-sm">
            <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground" htmlFor="ofx-account">
              Conta bancária relacionada
            </label>
            <input
              id="ofx-account"
              value={accountName}
              onChange={(event) => setAccountName(event.target.value)}
              placeholder="Ex: Banco Inter"
              className="w-full rounded border border-border bg-background/50 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-cyan-400"
            />
            <p className="text-[11px] text-muted-foreground">
              As entradas somam nesse banco e as saídas descontam dele. Transações repetidas do mesmo OFX serão ignoradas.
            </p>
          </div>

          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead className="bg-muted/30 text-muted-foreground font-mono uppercase tracking-widest">
                <tr>
                  <th className="p-3">Importar</th>
                  <th className="p-3">Data</th>
                  <th className="p-3">Descrição</th>
                  <th className="p-3">Tipo</th>
                  <th className="p-3 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((transaction, index) => (
                  <tr key={`${transaction.fitId}-${index}`} className="border-t border-border">
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={Boolean(selected[index])}
                        onChange={(event) => setSelected(current => ({ ...current, [index]: event.target.checked }))}
                        className="accent-primary"
                      />
                    </td>
                    <td className="p-3 font-mono text-muted-foreground">{transaction.date || "Sem data"}</td>
                    <td className="p-3 text-foreground">{transaction.description}</td>
                    <td className="p-3 font-mono">
                      <span className={transaction.type === "income" ? "text-green-400" : "text-red-400"}>
                        {transaction.type === "income" ? "Entrada" : "Saída"}
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono text-foreground">
                      R$ {transaction.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={isSaving || !accountName.trim()} className="gap-2">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Aprovar e salvar selecionadas
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
