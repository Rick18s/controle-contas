import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

interface MonthPickerDialogProps {
  open: boolean;
  existingLabels: string[];
  onClose: () => void;
  onCreate: (label: string) => void;
}

export default function MonthPickerDialog({ open, existingLabels, onClose, onCreate }: MonthPickerDialogProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12

  const label = `${year}-${String(month).padStart(2, '0')}`;
  const alreadyExists = existingLabels.includes(label);

  const handleCreate = () => {
    if (alreadyExists) return;
    onCreate(label);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="bg-card text-card-foreground border border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-primary font-mono text-sm uppercase tracking-widest">
            Criar Novo Mês
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Year */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-gray-500 uppercase">Ano</label>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setYear(y => y - 1)} className="text-primary h-7 w-7 p-0">−</Button>
              <span className="flex-1 text-center font-mono font-bold text-white">{year}</span>
              <Button variant="ghost" size="sm" onClick={() => setYear(y => y + 1)} className="text-primary h-7 w-7 p-0">+</Button>
            </div>
          </div>

          {/* Month grid */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-gray-500 uppercase">Mês</label>
            <div className="grid grid-cols-3 gap-1.5">
              {MONTH_NAMES.map((name, idx) => {
                const m = idx + 1;
                const lbl = `${year}-${String(m).padStart(2, '0')}`;
                const exists = existingLabels.includes(lbl);
                const selected = month === m;
                return (
                  <button
                    key={m}
                    onClick={() => !exists && setMonth(m)}
                    disabled={exists}
                    className={`py-1.5 rounded text-[11px] font-mono transition-all border ${
                      selected
                        ? 'border-cyan-400 text-primary bg-cyan-950/50'
                        : exists
                          ? 'border-gray-800 text-gray-700 cursor-not-allowed'
                          : 'border-gray-700 text-gray-400 hover:border-cyan-700 hover:text-gray-200'
                    }`}
                  >
                    {name.slice(0, 3)}
                    {exists && <span className="block text-[8px] text-gray-700">existe</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Preview */}
          <div className="text-center text-xs font-mono text-gray-400">
            Criando: <span className="text-primary">{MONTH_NAMES[month - 1]} {year}</span>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} className="text-gray-400 text-xs">Cancelar</Button>
          <Button
            onClick={handleCreate}
            disabled={alreadyExists}
            className="text-xs"
            
          >
            {alreadyExists ? "Já existe" : "Criar Mês"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
