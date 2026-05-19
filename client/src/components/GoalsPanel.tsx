import { useState } from "react";
import { Plus, Target, Trash2, Edit2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { formatBrl, parseMoney } from "@/lib/money";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Goal = {
  id: number;
  name: string;
  term: "short" | "medium" | "long";
  targetValue: string;
  savedValue: string;
};

export default function GoalsPanel() {
  const goalsQuery = trpc.goals.list.useQuery();
  const createGoal = trpc.goals.create.useMutation({
    onSuccess: () => {
      goalsQuery.refetch();
      setShowDialog(false);
      resetForm();
      toast.success("Meta criada com sucesso");
    },
    onError: (error) => toast.error(error.message || "Erro ao criar meta"),
  });
  const updateGoal = trpc.goals.update.useMutation({
    onSuccess: () => {
      goalsQuery.refetch();
      setShowDialog(false);
      resetForm();
      toast.success("Meta atualizada");
    },
    onError: (error) => toast.error(error.message || "Erro ao atualizar meta"),
  });
  const deleteGoal = trpc.goals.delete.useMutation({
    onSuccess: () => {
      goalsQuery.refetch();
      toast.success("Meta removida");
    },
  });

  const [showDialog, setShowDialog] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  
  // Form State
  const [name, setName] = useState("");
  const [term, setTerm] = useState<"short" | "medium" | "long">("medium");
  const [targetValue, setTargetValue] = useState("");
  const [savedValue, setSavedValue] = useState("");

  const resetForm = () => {
    setEditingGoal(null);
    setName("");
    setTerm("medium");
    setTargetValue("");
    setSavedValue("");
  };

  const handleOpenEdit = (goal: Goal) => {
    setEditingGoal(goal);
    setName(goal.name);
    setTerm(goal.term);
    setTargetValue(goal.targetValue);
    setSavedValue(goal.savedValue);
    setShowDialog(true);
  };

  const handleSave = () => {
    if (!name.trim()) {
      toast.error("Informe o nome da meta");
      return;
    }
    
    const payload = {
      name,
      term,
      targetValue: targetValue || "0",
      savedValue: savedValue || "0"
    };

    if (editingGoal) {
      updateGoal.mutate({ id: editingGoal.id, ...payload });
    } else {
      createGoal.mutate(payload);
    }
  };

  const goals = goalsQuery.data || [];
  
  const shortTerm = goals.filter(g => g.term === "short");
  const mediumTerm = goals.filter(g => g.term === "medium");
  const longTerm = goals.filter(g => g.term === "long");

  const GoalCard = ({ goal }: { goal: Goal }) => {
    const target = parseMoney(goal.targetValue);
    const saved = parseMoney(goal.savedValue);
    const progress = target > 0 ? Math.min(Math.round((saved / target) * 100), 100) : 0;
    const isCompleted = progress >= 100 && target > 0;

    return (
      <div className="bg-card border border-border p-4 rounded-lg relative overflow-hidden group">
        {isCompleted && (
          <div className="absolute top-0 right-0 p-2 text-green-400">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        )}
        <div className="flex justify-between items-start mb-3">
          <h3 className={`font-mono text-sm ${isCompleted ? 'text-green-400' : 'text-primary'} truncate pr-6`}>
            {goal.name}
          </h3>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(goal)} className="h-6 w-6 p-0 text-gray-400 hover:text-white">
              <Edit2 className="w-3 h-3" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => deleteGoal.mutate({ id: goal.id })} className="h-6 w-6 p-0 text-gray-400 hover:text-red-400">
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>

        <div className="flex justify-between items-end mb-2">
          <div className="text-xl font-mono font-bold text-white">
            {formatBrl(saved)}
          </div>
          <div className="text-xs font-mono text-gray-500">
            de {formatBrl(target)}
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-[10px] font-mono text-gray-400">
            <span>Progresso</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>
      </div>
    );
  };

  const Section = ({ title, items }: { title: string, items: Goal[] }) => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-3 mb-8">
        <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          <Target className="w-3 h-3" /> {title}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(goal => <GoalCard key={goal.id} goal={goal} />)}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-mono text-white">Investimentos e Metas</h2>
          <p className="text-xs font-mono text-gray-500 mt-1">Acompanhe seu patrimônio e objetivos de vida</p>
        </div>
        <Button onClick={() => { resetForm(); setShowDialog(true); }} size="sm" className="gap-2">
          <Plus className="w-4 h-4" /> Nova Meta
        </Button>
      </div>

      {goals.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-border rounded-lg bg-card/50">
          <Target className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-50" />
          <p className="text-sm font-mono text-gray-400">Nenhuma meta cadastrada.</p>
          <p className="text-xs font-mono text-gray-500 mt-1">Clique em "Nova Meta" para começar a investir.</p>
        </div>
      ) : (
        <div className="mt-6">
          <Section title="Curto Prazo (até 1 ano)" items={shortTerm} />
          <Section title="Médio Prazo (1 a 5 anos)" items={mediumTerm} />
          <Section title="Longo Prazo (+5 anos)" items={longTerm} />
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={(open) => { if (!open) setShowDialog(false); }}>
        <DialogContent className="max-w-sm bg-card text-card-foreground border border-border">
          <DialogHeader>
            <DialogTitle className="text-primary font-mono text-sm uppercase tracking-widest">
              {editingGoal ? "Editar Meta" : "Nova Meta"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase text-gray-500">Nome do Investimento/Meta</label>
              <input
                className="w-full rounded border border-border bg-background/50 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-cyan-400"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Reserva de Emergência"
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase text-gray-500">Prazo</label>
              <Select value={term} onValueChange={(val: any) => setTerm(val)}>
                <SelectTrigger className="w-full bg-background border-border text-sm font-mono text-white">
                  <SelectValue placeholder="Selecione o prazo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="short">Curto Prazo (Até 1 ano)</SelectItem>
                  <SelectItem value="medium">Médio Prazo (1 a 5 anos)</SelectItem>
                  <SelectItem value="long">Longo Prazo (+5 anos)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase text-gray-500">Valor Alvo (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full rounded border border-border bg-background/50 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-cyan-400"
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  placeholder="10000.00"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase text-gray-500">Já Guardado (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full rounded border border-border bg-background/50 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-cyan-400"
                  value={savedValue}
                  onChange={(e) => setSavedValue(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4 gap-2">
            <Button variant="ghost" onClick={() => setShowDialog(false)} className="text-gray-400 text-xs">Cancelar</Button>
            <Button onClick={handleSave} disabled={createGoal.isPending || updateGoal.isPending} className="text-xs">
              {createGoal.isPending || updateGoal.isPending ? "Salvando..." : "Salvar Meta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
