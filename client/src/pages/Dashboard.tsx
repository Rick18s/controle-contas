import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { lazy, Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  LogOut,
  CalendarPlus,
  Copy,
  Download,
  ClipboardPaste,
  LayoutDashboard,
  ListChecks,
  Sparkles,
  ReceiptText,
  Wallet,
  Landmark,
} from "lucide-react";
import { toast } from "sonner";
import ExpenseCard from "@/components/ExpenseCard";
import AccountAccessBar from "@/components/AccountAccessBar";
import MonthPickerDialog from "@/components/MonthPickerDialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { inferCardIcon } from "@/lib/cardIcons";
import { CardCategoryIcon } from "@/components/CardCategoryIcon";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import OnboardingTutorial from "@/components/OnboardingTutorial";
import BrandLogo from "@/components/BrandLogo";

const SummaryDashboard = lazy(() => import("@/components/SummaryDashboard"));
const CashFlowTimeline = lazy(() => import("@/components/CashFlowTimeline"));
const PaymentSimulator = lazy(() => import("@/components/PaymentSimulator"));
const IncomePanel = lazy(() => import("@/components/IncomePanel"));
const OfxImportPanel = lazy(() => import("@/components/OfxImportPanel"));
const GoalsPanel = lazy(() => import("@/components/GoalsPanel"));
const AnalyticsPanel = lazy(() => import("@/components/AnalyticsPanel"));
const BankBalances = lazy(() => import("@/components/BankBalances"));
const CurrencyCalculator = lazy(() => import("@/components/CurrencyCalculator"));
const BankStatementPanel = lazy(() => import("@/components/BankStatementPanel"));
const AdminUsersPanel = lazy(() => import("@/components/AdminUsersPanel"));
const QuickAddDialog = lazy(() => import("@/components/QuickAddDialog"));

const dashboardTabs = [
  { value: "overview", label: "Visão Geral" },
  { value: "priorities", label: "Prioridades" },
  { value: "simulator", label: "Simulador" },
  { value: "expenses", label: "Despesas" },
  { value: "income", label: "Receitas" },
  { value: "import", label: "Importar" },
  { value: "goals", label: "Metas" },
  { value: "analytics", label: "Análises" },
  { value: "balances", label: "Saldos" },
  { value: "statement", label: "Extrato" },
] as const;

const mobileTabs = [
  { value: "overview", label: "Início", icon: LayoutDashboard },
  { value: "priorities", label: "Pagar", icon: ListChecks },
  { value: "expenses", label: "Contas", icon: ReceiptText },
  { value: "income", label: "Entradas", icon: Wallet },
  { value: "balances", label: "Saldos", icon: Landmark },
] as const;

function PanelFallback() {
  return (
    <div className="rounded-2xl border border-white/5 bg-zinc-900/60 p-8 text-center text-xs font-mono text-muted-foreground">
      Carregando painel...
    </div>
  );
}

export default function Dashboard() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedMonthId, setSelectedMonthId] = useState<number | null>(null);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [showQuickAddDialog, setShowQuickAddDialog] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [importText, setImportText] = useState("");
  const [replaceExistingImport, setReplaceExistingImport] = useState(true);
  const [copyTargetMode, setCopyTargetMode] = useState<"new" | "existing">("new");
  const [copyTargetLabel, setCopyTargetLabel] = useState("");
  const [copyTargetMonthId, setCopyTargetMonthId] = useState<number | null>(null);
  const [copyExpenses, setCopyExpenses] = useState(true);
  const [copyIncome, setCopyIncome] = useState(true);
  const [copyBalances, setCopyBalances] = useState(true);
  const [copyReplaceExisting, setCopyReplaceExisting] = useState(true);
  const [copyResetPaymentStatus, setCopyResetPaymentStatus] = useState(false);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      setLocation("/");
    }
  }, [loading, isAuthenticated, setLocation]);

  const claimSeed = trpc.months.claimSeedData.useMutation();
  const monthsQuery = trpc.months.list.useQuery(undefined, { enabled: isAuthenticated });
  const createMonth = trpc.months.create.useMutation({
    onSuccess: (data) => {
      monthsQuery.refetch();
      setSelectedMonthId(data.id);
      toast.success("Mês criado com sucesso");
    },
  });
  const copyMonth = trpc.months.copy.useMutation({
    onSuccess: (data) => {
      if (!data) return;
      monthsQuery.refetch();
      setSelectedMonthId(data.id);
      setShowCopyDialog(false);
      toast.success("Mês copiado com sucesso");
    },
    onError: (error) => toast.error(error.message || "Não foi possível copiar o mês"),
  });
  const importMonthText = trpc.months.importText.useMutation({
    onSuccess: (result) => {
      setShowImportDialog(false);
      setImportText("");
      monthsQuery.refetch();
      toast.success("Importado: " + result.cards + " cards e " + result.income + " entradas");
    },
    onError: (error) => toast.error(error.message || "Não foi possível importar os dados"),
  });
  const restoreMonth = trpc.months.create.useMutation();
  const createCardForUndo = trpc.cards.create.useMutation();
  const createItemForUndo = trpc.items.create.useMutation();
  const createIncomeForUndo = trpc.income.create.useMutation();
  const updateBalanceForUndo = trpc.balances.update.useMutation();
  const deleteMonth = trpc.months.delete.useMutation();

  const months = monthsQuery.data || [];
  const exportMonthId = selectedMonthId ?? 0;
  const exportCardsQuery = trpc.cards.list.useQuery({ monthId: exportMonthId }, { enabled: Boolean(selectedMonthId) });
  const exportIncomeQuery = trpc.income.list.useQuery({ monthId: exportMonthId }, { enabled: Boolean(selectedMonthId) });
  const exportBalancesQuery = trpc.balances.list.useQuery({ monthId: exportMonthId }, { enabled: Boolean(selectedMonthId) });

  const restoreDeletedMonth = async (snapshot: {
    month: { label: string };
    cards: NonNullable<typeof exportCardsQuery.data>;
    income: NonNullable<typeof exportIncomeQuery.data>;
    balances: NonNullable<typeof exportBalancesQuery.data>;
  }) => {
    const restoredMonth = await restoreMonth.mutateAsync({ label: snapshot.month.label });

    for (const card of snapshot.cards) {
      const restoredCard = await createCardForUndo.mutateAsync({
        monthId: restoredMonth.id,
        name: card.name,
        icon: card.icon || undefined,
      });

      for (const item of card.items) {
        await createItemForUndo.mutateAsync({
          cardId: restoredCard.id,
          name: item.name,
          dueDate: item.dueDate || undefined,
          value: item.value,
          paidValue: item.paidValue,
          paidAccountName: item.paidAccountName,
          paymentMode: item.paymentMode === "card" || item.paymentMode === "budget" ? item.paymentMode : "bank",
          status: item.status,
        });
      }
    }

    for (const entry of snapshot.income) {
      await createIncomeForUndo.mutateAsync({
        monthId: restoredMonth.id,
        name: entry.name,
        value: entry.value,
        receivedValue: entry.receivedValue,
        received: entry.received,
        receivedAccountName: entry.receivedAccountName,
      });
    }

    for (const balance of snapshot.balances) {
      await updateBalanceForUndo.mutateAsync({
        monthId: restoredMonth.id,
        accountName: balance.accountName,
        balance: balance.balance,
      });
    }

    await monthsQuery.refetch();
    setSelectedMonthId(restoredMonth.id);
    toast.success("Mês restaurado");
  };

  const handleDeleteMonth = async () => {
    if (!selectedMonth) return;
    const snapshot = {
      month: selectedMonth,
      cards: exportCardsQuery.data || [],
      income: exportIncomeQuery.data || [],
      balances: exportBalancesQuery.data || [],
    };

    if (confirm(`Remover ${formatMonthLabel(selectedMonth.label)} e todos os dados?`)) {
      await deleteMonth.mutateAsync({ id: selectedMonth.id });
      await monthsQuery.refetch();
      setSelectedMonthId(null);
      toast.success("Mês removido", {
        duration: 10000,
        action: {
          label: "Desfazer",
          onClick: () => { void restoreDeletedMonth(snapshot); },
        },
      });
    }
  };

  // On first load, claim any seeded data (userId=1) to the real user
  useEffect(() => {
    if (isAuthenticated && user) {
      claimSeed.mutate(undefined, {
        onSuccess: (result) => {
          if (result.migrated > 0) monthsQuery.refetch();
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  useEffect(() => {
    if (months.length === 0) {
      if (selectedMonthId) setSelectedMonthId(null);
      return;
    }

    const selectedMonthStillExists = months.some(month => month.id === selectedMonthId);
    if (!selectedMonthId || !selectedMonthStillExists) {
      setSelectedMonthId(months[months.length - 1].id);
    }
  }, [months, selectedMonthId]);

  const selectedMonth = months.find(m => m.id === selectedMonthId);
  const canManageOrganization = Boolean(user?.canManageOrganization);

  const getNextMonthLabel = (label: string) => {
    const [year, month] = label.split('-').map(Number);
    const next = new Date(year, month, 1);
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
  };

  const openCopyDialog = () => {
    if (!selectedMonth) return;
    setCopyTargetLabel(getNextMonthLabel(selectedMonth.label));
    setCopyTargetMonthId(months.find(month => month.id !== selectedMonth.id)?.id ?? null);
    setShowCopyDialog(true);
  };

  const handleCopyMonth = () => {
    if (!selectedMonthId || !selectedMonth) return;
    if (!copyExpenses && !copyIncome && !copyBalances) {
      toast.error("Escolha pelo menos uma informação para copiar");
      return;
    }
    if (copyTargetMode === "new") {
      if (!/^\d{4}-\d{2}$/.test(copyTargetLabel)) {
        toast.error("Use o formato AAAA-MM, por exemplo 2026-06");
        return;
      }
      if (months.some(month => month.label === copyTargetLabel)) {
        toast.error("Esse mês já existe. Escolha 'Mês existente' para copiar para ele.");
        return;
      }
    }
    if (copyTargetMode === "existing" && !copyTargetMonthId) {
      toast.error("Escolha um mês destino");
      return;
    }
    copyMonth.mutate({
      sourceMonthId: selectedMonthId,
      targetLabel: copyTargetMode === "new" ? copyTargetLabel : undefined,
      targetMonthId: copyTargetMode === "existing" ? copyTargetMonthId ?? undefined : undefined,
      includeExpenses: copyExpenses,
      includeIncome: copyIncome,
      includeBalances: copyBalances,
      replaceExisting: copyReplaceExisting,
      resetPaymentStatus: copyResetPaymentStatus,
    });
  };

  const csvCell = (value: unknown) => {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
  };

  const handleImportText = () => {
    if (!selectedMonthId) return;
    if (!importText.trim()) {
      toast.error("Cole as informações antes de importar");
      return;
    }
    if (replaceExistingImport && !confirm("Substituir despesas e entradas atuais deste mês pelos dados colados?")) return;
    importMonthText.mutate({ monthId: selectedMonthId, text: importText, replaceExisting: replaceExistingImport });
  };

  const handleExportSpreadsheet = () => {
    if (!selectedMonth) return;
    const rows: unknown[][] = [
      ["Tipo", "Categoria/Conta", "Nome", "Vencimento", "Valor", "Pago/Recebido", "Forma", "Status"],
    ];

    (exportCardsQuery.data || []).forEach(card => {
      card.items.forEach(item => {
        rows.push(["Despesa", card.name, item.name, item.dueDate || "", item.value, item.paidValue, item.paymentMode || "bank", item.status]);
      });
    });

    (exportIncomeQuery.data || []).forEach(entry => {
      const receivedValue = Number.parseFloat(entry.receivedValue || "0.00") > 0
        ? entry.receivedValue
        : entry.received === 1 ? entry.value : "0.00";
      const remainingValue = Math.max(Number.parseFloat(entry.value || "0") - Number.parseFloat(receivedValue || "0"), 0);
      rows.push(["Entrada", "Entradas", entry.name, "", entry.value, receivedValue, "", remainingValue > 0 && Number.parseFloat(receivedValue || "0") > 0 ? "parcial" : entry.received === 1 ? "recebido" : "pendente"]);
    });

    (exportBalancesQuery.data || []).forEach(balance => {
      rows.push(["Saldo bancário", balance.accountName, "", "", balance.balance, "", "", ""]);
    });

    const csv = `\uFEFF${rows.map(row => row.map(csvCell).join(';')).join('\n')}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `controle-contas-${selectedMonth.label}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success("Planilha exportada");
  };

  const formatMonthLabel = (label: string) => {
    const [year, month] = label.split('-');
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return `${monthNames[parseInt(month) - 1]} ${year}`;
  };

  const navigateMonth = (direction: number) => {
    const idx = months.findIndex(m => m.id === selectedMonthId);
    const newIdx = idx + direction;
    if (newIdx >= 0 && newIdx < months.length) {
      setSelectedMonthId(months[newIdx].id);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-primary text-lg font-mono animate-pulse">CARREGANDO DADOS...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="container flex flex-wrap items-center justify-between gap-2 py-3 sm:h-14 sm:flex-nowrap sm:py-0">
          <BrandLogo href="/dashboard" size="sm" className="max-w-[170px] shrink-0 sm:max-w-none" />

          {/* Month Navigation */}
          <div className="order-3 flex w-full items-center justify-between gap-1 overflow-x-auto rounded-2xl border border-white/5 bg-zinc-900/80 p-1 sm:order-none sm:w-auto sm:justify-start sm:overflow-visible sm:border-0 sm:bg-transparent sm:p-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigateMonth(-1)}
              disabled={!selectedMonthId || months.findIndex(m => m.id === selectedMonthId) === 0}
              className="h-10 w-10 shrink-0 p-0 text-gray-400 hover:text-white sm:h-8 sm:w-8"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>

            <div className="min-w-[118px] flex-1 rounded-xl border border-border px-3 py-2 text-center text-sm font-semibold text-primary sm:min-w-[110px] sm:flex-none sm:rounded-md sm:px-3 sm:py-1 sm:text-sm" style={{ background: 'var(--bg-card)' }}>
              {selectedMonth ? formatMonthLabel(selectedMonth.label) : "—"}
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigateMonth(1)}
              disabled={!selectedMonthId || months.findIndex(m => m.id === selectedMonthId) === months.length - 1}
              className="h-10 w-10 shrink-0 p-0 text-gray-400 hover:text-white sm:h-8 sm:w-8"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowMonthPicker(true)}
              className="ml-1 h-10 w-10 shrink-0 p-0 text-green-400 hover:text-green-300 sm:h-8 sm:w-8"
              title="Criar novo mês"
            >
              <CalendarPlus className="w-4 h-4" />
            </Button>

            {selectedMonth && (
              <Button
                variant="ghost"
                size="sm"
                onClick={openCopyDialog}
                disabled={copyMonth.isPending}
                className="h-10 w-10 shrink-0 p-0 text-primary hover:text-primary/80 sm:h-8 sm:w-8"
                title="Copiar mês atual para outro mês"
              >
                <Copy className="w-3.5 h-3.5" />
              </Button>
            )}

            {selectedMonth && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowImportDialog(true)}
                className="h-10 w-10 shrink-0 p-0 text-purple-400 hover:text-purple-300 sm:h-8 sm:w-8"
                title="Colar/importar informações no mês atual"
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
              </Button>
            )}

            {selectedMonth && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleExportSpreadsheet}
                className="h-10 w-10 shrink-0 p-0 text-primary hover:text-primary/80 sm:h-8 sm:w-8"
                title="Exportar mês para planilha CSV"
              >
                <Download className="w-3.5 h-3.5" />
              </Button>
            )}

            {selectedMonth && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { void handleDeleteMonth(); }}
                className="h-10 w-10 shrink-0 p-0 text-red-400 hover:text-red-300 sm:h-8 sm:w-8"
                title="Remover mês"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <OnboardingTutorial />
            <span className="text-xs font-mono text-gray-500 hidden md:block">{user?.name}</span>
            <Button variant="ghost" size="sm" onClick={logout} className="h-10 w-10 p-0 text-gray-400 hover:text-red-400 sm:h-8 sm:w-8">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container space-y-4 py-4 pb-28 sm:space-y-6 sm:py-6 sm:pb-6">
        {!selectedMonthId ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-6">
            <p className="text-gray-500 font-mono text-sm">Nenhum mês selecionado</p>
            <Button onClick={() => setShowMonthPicker(true)} className="gap-2" >
              <Plus className="w-4 h-4" /> Criar Primeiro Mês
            </Button>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-4 sm:space-y-6">
            <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
              <AccountAccessBar isAdmin={canManageOrganization} onOrganizationChange={() => setSelectedMonthId(null)} />
              <TabsList className="hidden h-auto w-full overflow-x-auto whitespace-nowrap justify-start pb-1 sm:flex sm:w-auto">
                {dashboardTabs.map(tab => (
                  <TabsTrigger key={tab.value} value={tab.value} className="px-3 py-2 text-xs sm:text-sm">
                    {tab.label}
                  </TabsTrigger>
                ))}
                {canManageOrganization && (
                  <TabsTrigger value="admin" className="text-xs sm:text-sm py-2 px-3">Admin</TabsTrigger>
                )}
              </TabsList>
              <select
                value={activeTab}
                onChange={(event) => setActiveTab(event.target.value)}
                className="h-12 rounded-2xl border border-white/10 bg-zinc-900 px-4 text-sm font-semibold text-white outline-none focus:border-primary sm:hidden"
              >
                {dashboardTabs.map(tab => (
                  <option key={tab.value} value={tab.value}>{tab.label}</option>
                ))}
                {canManageOrganization && <option value="admin">Admin</option>}
              </select>
            </div>

            <Suspense fallback={<PanelFallback />}>
              <TabsContent value="overview" className="space-y-6 focus-visible:outline-none focus-visible:ring-0 mt-0">
                {activeTab === "overview" && <SummaryDashboard monthId={selectedMonthId} />}
              </TabsContent>

              <TabsContent value="priorities" className="space-y-6 focus-visible:outline-none focus-visible:ring-0 mt-0">
                {activeTab === "priorities" && <CashFlowTimeline monthId={selectedMonthId} />}
              </TabsContent>

              <TabsContent value="simulator" className="space-y-6 focus-visible:outline-none focus-visible:ring-0 mt-0">
                {activeTab === "simulator" && <PaymentSimulator monthId={selectedMonthId} />}
              </TabsContent>

              <TabsContent value="expenses" className="space-y-6 focus-visible:outline-none focus-visible:ring-0 mt-0">
                {activeTab === "expenses" && <ExpenseCardsSection monthId={selectedMonthId} />}
              </TabsContent>

              <TabsContent value="income" className="space-y-6 focus-visible:outline-none focus-visible:ring-0 mt-0">
                {activeTab === "income" && <IncomePanel monthId={selectedMonthId} />}
              </TabsContent>

              <TabsContent value="import" className="space-y-6 focus-visible:outline-none focus-visible:ring-0 mt-0">
                {activeTab === "import" && <OfxImportPanel monthId={selectedMonthId} />}
              </TabsContent>

              <TabsContent value="goals" className="space-y-6 focus-visible:outline-none focus-visible:ring-0 mt-0">
                {activeTab === "goals" && <GoalsPanel />}
              </TabsContent>

              <TabsContent value="analytics" className="space-y-6 focus-visible:outline-none focus-visible:ring-0 mt-0">
                {activeTab === "analytics" && <AnalyticsPanel />}
              </TabsContent>

              <TabsContent value="balances" className="space-y-6 focus-visible:outline-none focus-visible:ring-0 mt-0">
                {activeTab === "balances" && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <BankBalances monthId={selectedMonthId} />
                    <CurrencyCalculator />
                  </div>
                )}
              </TabsContent>

              <TabsContent value="statement" className="space-y-6 focus-visible:outline-none focus-visible:ring-0 mt-0">
                {activeTab === "statement" && <BankStatementPanel monthId={selectedMonthId} />}
              </TabsContent>

              {canManageOrganization && (
                <TabsContent value="admin" className="space-y-6 focus-visible:outline-none focus-visible:ring-0 mt-0">
                  {activeTab === "admin" && <AdminUsersPanel />}
                </TabsContent>
              )}
            </Suspense>
          </Tabs>
        )}
      </main>

      {/* Month Picker Dialog */}
      <MonthPickerDialog
        open={showMonthPicker}
        existingLabels={months.map(m => m.label)}
        onClose={() => setShowMonthPicker(false)}
        onCreate={(label) => createMonth.mutate({ label })}
      />

      <Dialog open={showCopyDialog} onOpenChange={setShowCopyDialog}>
        <DialogContent className="w-[calc(100vw-1rem)] rounded-3xl border border-border bg-card text-card-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-primary font-mono text-sm uppercase tracking-widest">Copiar mês</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 text-xs font-mono text-gray-300">
            <div className="rounded border border-border bg-muted/30 p-3">
              Origem: <span className="text-primary">{selectedMonth ? formatMonthLabel(selectedMonth.label) : "—"}</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="ghost" onClick={() => setCopyTargetMode("new")} className={copyTargetMode === "new" ? "border border-primary text-primary" : "border border-gray-800 text-gray-400"}>Novo mês</Button>
              <Button type="button" variant="ghost" onClick={() => setCopyTargetMode("existing")} className={copyTargetMode === "existing" ? "border border-primary text-primary" : "border border-gray-800 text-gray-400"}>Mês existente</Button>
            </div>

            {copyTargetMode === "new" ? (
              <input value={copyTargetLabel} onChange={(event) => setCopyTargetLabel(event.target.value)} placeholder="2026-06" className="w-full rounded border border-border bg-background/50 px-3 py-2 text-white focus:outline-none focus:border-cyan-400" />
            ) : (
              <select value={copyTargetMonthId ?? ""} onChange={(event) => setCopyTargetMonthId(Number(event.target.value) || null)} className="w-full rounded border border-border bg-background/50 px-3 py-2 text-white focus:outline-none focus:border-cyan-400">
                <option value="">Escolha o mês destino</option>
                {months.filter(month => month.id !== selectedMonthId).map(month => (<option key={month.id} value={month.id}>{formatMonthLabel(month.label)}</option>))}
              </select>
            )}

            <div className="grid grid-cols-1 gap-2 rounded border border-border bg-muted/30 p-3">
              <label className="flex items-center gap-2"><input type="checkbox" checked={copyExpenses} onChange={(event) => setCopyExpenses(event.target.checked)} className="accent-primary" /> Despesas e cartões</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={copyIncome} onChange={(event) => setCopyIncome(event.target.checked)} className="accent-primary" /> Entradas previstas</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={copyBalances} onChange={(event) => setCopyBalances(event.target.checked)} className="accent-primary" /> Saldos bancários</label>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <label className="flex items-center gap-2"><input type="checkbox" checked={copyReplaceExisting} onChange={(event) => setCopyReplaceExisting(event.target.checked)} className="accent-primary" /> Substituir dados correspondentes no destino</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={copyResetPaymentStatus} onChange={(event) => setCopyResetPaymentStatus(event.target.checked)} className="accent-primary" /> Zerar pagos/recebidos no mês copiado</label>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setShowCopyDialog(false)} className="text-gray-400 text-xs">Cancelar</Button>
            <Button onClick={handleCopyMonth} disabled={copyMonth.isPending} className="text-xs" >{copyMonth.isPending ? "Copiando..." : "Copiar dados"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="w-[calc(100vw-1rem)] rounded-3xl border border-border bg-card text-card-foreground sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-primary font-mono text-sm uppercase tracking-widest">
              Colar informações do mês
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <Textarea
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder={"Casa:\nAluguel: 700\nInternet: 100 - 15/05\n\nEntradas previstas:\nCliente: 1000"}
              className="min-h-[260px] bg-background/50 border-border text-sm text-white font-mono focus:border-cyan-400 sm:min-h-[320px]"
            />
            <label className="flex items-center gap-2 text-xs font-mono text-gray-400">
              <input
                type="checkbox"
                checked={replaceExistingImport}
                onChange={(event) => setReplaceExistingImport(event.target.checked)}
                className="accent-primary"
              />
              Substituir despesas e entradas atuais deste mês
            </label>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setShowImportDialog(false)} className="text-gray-400 text-xs">
              Cancelar
            </Button>
            <Button
              onClick={handleImportText}
              disabled={importMonthText.isPending}
              className="text-xs"
              
            >
              {importMonthText.isPending ? "Importando..." : "Importar dados"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* FAB Quick Add */}
      {selectedMonthId && (
        <>
          {showQuickAddDialog && (
            <Suspense fallback={null}>
              <QuickAddDialog
                open={showQuickAddDialog}
                onOpenChange={setShowQuickAddDialog}
                monthId={selectedMonthId}
                onSuccess={() => {
                  exportCardsQuery.refetch();
                  exportIncomeQuery.refetch();
                }}
              />
            </Suspense>
          )}
          <Button
            onClick={() => setShowQuickAddDialog(true)}
            className="fixed bottom-[5.75rem] right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-blue-600 p-0 text-white shadow-2xl shadow-purple-500/30 transition-transform hover:scale-105 hover:shadow-purple-500/50 active:scale-95 sm:bottom-6 sm:right-6 sm:h-14 sm:w-14"
            title="Adição Inteligente"
          >
            <Sparkles className="h-5 w-5 sm:h-6 sm:w-6" />
          </Button>
          <nav className="pb-safe fixed inset-x-3 bottom-0 z-40 rounded-t-3xl border border-white/10 border-b-0 bg-zinc-950/95 px-2 pt-2 shadow-2xl shadow-black/50 backdrop-blur sm:hidden">
            <div className="grid grid-cols-5 gap-1">
              {mobileTabs.map(item => {
                const Icon = item.icon;
                const selected = activeTab === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setActiveTab(item.value)}
                    className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/60 ${selected ? "bg-primary/15 text-primary" : "text-zinc-500 hover:text-white"}`}
                  >
                    <Icon className="h-5 w-5" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>
        </>
      )}
    </div>
  );
}

function ExpenseCardsSection({ monthId }: { monthId: number }) {
  const cardsQuery = trpc.cards.list.useQuery({ monthId });
  const [showNewCardDialog, setShowNewCardDialog] = useState(false);
  const [newCardName, setNewCardName] = useState("");
  const createCard = trpc.cards.create.useMutation({
    onSuccess: () => {
      cardsQuery.refetch();
      setShowNewCardDialog(false);
      setNewCardName("");
      toast.success("Card criado");
    },
    onError: (error) => toast.error(error.message || "Não foi possível criar o card"),
  });

  const handleAddCard = () => {
    const name = newCardName.trim();
    if (!name) {
      toast.error("Digite o nome do card");
      return;
    }

    createCard.mutate({ monthId, name, icon: inferCardIcon(name) });
  };

  const cards = cardsQuery.data || [];
  const inferredNewCardIcon = inferCardIcon(newCardName);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-mono uppercase tracking-widest text-primary">Despesas do Mês</h2>
        <Button onClick={() => setShowNewCardDialog(true)} size="sm" variant="ghost" className="h-10 shrink-0 gap-1 rounded-2xl text-xs text-primary hover:text-primary/80 sm:h-8">
          <Plus className="w-3 h-3" /> Novo Card
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        {cards.map(card => (
          <ExpenseCard key={card.id} card={card} onRefresh={() => cardsQuery.refetch()} />
        ))}
      </div>

      <Dialog open={showNewCardDialog} onOpenChange={setShowNewCardDialog}>
        <DialogContent className="w-[calc(100vw-1rem)] rounded-3xl border border-border bg-card text-card-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-primary font-mono text-sm uppercase tracking-widest">Novo card</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase tracking-widest text-gray-500" htmlFor="new-card-name">Nome</label>
              <input
                id="new-card-name"
                className="h-11 w-full rounded-xl border border-border bg-background/50 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-cyan-400"
                value={newCardName}
                onChange={(event) => setNewCardName(event.target.value)}
                placeholder="Ex: Investimentos"
                autoFocus
              />
            </div>
            <div className="rounded border border-border bg-muted/30 p-3">
              <span className="text-[10px] font-mono uppercase tracking-widest text-gray-500">Ícone automático</span>
              <div className="mt-2 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded border border-primary/50 bg-primary/10 text-primary" aria-hidden="true">
                  <CardCategoryIcon name={newCardName} className="h-5 w-5" />
                </span>
                <span className="text-xs font-mono text-gray-300">
                  O app escolhe pelo nome do card.
                </span>
              </div>
            </div>
          </div>

          <DialogFooter className="grid grid-cols-1 gap-2 sm:flex">
            <Button variant="ghost" onClick={() => setShowNewCardDialog(false)} className="h-11 text-xs text-gray-400">Cancelar</Button>
            <Button onClick={handleAddCard} disabled={createCard.isPending} className="h-11 text-xs" >
              {createCard.isPending ? "Criando..." : "Criar card"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
