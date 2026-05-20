import { useEffect, useMemo, useState } from "react";
import { Banknote, Building2, CalendarDays, CheckCircle2, FileUp, HelpCircle, ListChecks, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const STORAGE_KEY = "controle-contas-tutorial-seen-v1";

const steps = [
  {
    title: "1. Escolha o centro certo",
    description: "Use Centro ativo para separar Empresa, família, cliente ou qualquer organização. Tudo que você cria fica dentro do centro selecionado.",
    icon: Building2,
  },
  {
    title: "2. Crie ou selecione o mês",
    description: "Cada mês tem suas próprias entradas, despesas, cartões e saldos. Use o calendário no topo para criar o próximo mês ou copiar dados.",
    icon: CalendarDays,
  },
  {
    title: "3. Cadastre os saldos",
    description: "Em Saldos, adicione suas contas bancárias. Quando uma conta for paga ou uma entrada recebida, o saldo é atualizado automaticamente.",
    icon: Wallet,
  },
  {
    title: "4. Lance entradas",
    description: "Em Receitas, registre o que você espera receber. Quando marcar como recebido, escolha em qual banco o dinheiro entrou.",
    icon: Banknote,
  },
  {
    title: "5. Organize despesas",
    description: "Em Despesas, crie cards como Casa, Cartões, Empresa ou Projetos. Ao marcar como pago, escolha de qual banco saiu o dinheiro.",
    icon: ListChecks,
  },
  {
    title: "6. Importe extratos",
    description: "Na aba Importar, envie um arquivo OFX do banco para pré-visualizar transações antes de salvar no mês.",
    icon: FileUp,
  },
];

export default function OnboardingTutorial() {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[stepIndex];
  const Icon = step.icon;
  const isLastStep = stepIndex === steps.length - 1;
  const progressText = useMemo(() => `${stepIndex + 1} de ${steps.length}`, [stepIndex]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = window.localStorage.getItem(STORAGE_KEY);
    if (!seen) {
      const timer = window.setTimeout(() => setOpen(true), 800);
      return () => window.clearTimeout(timer);
    }
  }, []);

  const closeTutorial = () => {
    window.localStorage.setItem(STORAGE_KEY, "true");
    setOpen(false);
    setStepIndex(0);
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-8 px-2 text-primary hover:text-primary/80 text-xs gap-1"
        title="Abrir tutorial"
      >
        <HelpCircle className="h-3.5 w-3.5" />
        Tutorial
      </Button>

      <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) closeTutorial(); else setOpen(true); }}>
        <DialogContent className="bg-card text-card-foreground border border-border sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-primary font-mono text-sm uppercase tracking-widest">
              Tutorial rápido
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-xl border border-primary/30 bg-primary/10 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/40 bg-background/60 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{progressText}</span>
              </div>
              <h3 className="text-lg font-semibold text-white">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.description}</p>
            </div>

            <div className="grid grid-cols-6 gap-1">
              {steps.map((item, index) => (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => setStepIndex(index)}
                  className={`h-1.5 rounded-full transition-colors ${index <= stepIndex ? "bg-primary" : "bg-border"}`}
                  aria-label={`Ir para passo ${index + 1}`}
                />
              ))}
            </div>

            <div className="rounded-lg border border-border bg-black/20 p-3 text-xs leading-5 text-muted-foreground">
              Fluxo recomendado: <span className="text-white">Saldos</span> {"->"} <span className="text-white">Receitas</span> {"->"} <span className="text-white">Despesas</span> {"->"} <span className="text-white">Prioridades</span> {"->"} <span className="text-white">Simulador</span>.
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={closeTutorial} className="text-gray-400 text-xs">
              Pular
            </Button>
            <Button
              variant="ghost"
              onClick={() => setStepIndex(Math.max(stepIndex - 1, 0))}
              disabled={stepIndex === 0}
              className="text-xs"
            >
              Voltar
            </Button>
            <Button
              onClick={() => {
                if (isLastStep) closeTutorial();
                else setStepIndex(stepIndex + 1);
              }}
              className="text-xs gap-2"
            >
              {isLastStep && <CheckCircle2 className="h-4 w-4" />}
              {isLastStep ? "Começar" : "Próximo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
