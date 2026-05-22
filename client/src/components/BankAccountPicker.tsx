import { useState } from "react";
import { ChevronDown, Landmark, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

type BankAccount = {
  id: number;
  accountName: string;
};

export default function BankAccountPicker({
  value,
  onChange,
  accounts,
  label = "Banco",
  placeholder = "Ex: Inter, C6, Caixa",
  helperText,
  disabled = false,
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  accounts: BankAccount[];
  label?: string;
  placeholder?: string;
  helperText?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const [showCustomInput, setShowCustomInput] = useState(accounts.length === 0);
  const selectedAccount = accounts.find(account => account.accountName === value);
  const shouldShowCustomInput = showCustomInput || accounts.length === 0 || (value.trim() && !selectedAccount);

  return (
    <div className="space-y-2">
      <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        {label}
      </label>

      {accounts.length > 0 && (
        <div className="relative">
          <Landmark className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
          <select
            className="h-11 w-full appearance-none rounded-lg border border-border bg-background/70 py-2 pl-10 pr-10 text-sm text-white outline-none transition-colors focus:border-cyan-400 disabled:opacity-50"
            value={selectedAccount ? selectedAccount.accountName : ""}
            onChange={(event) => {
              const nextValue = event.target.value;
              if (nextValue === "__custom__") {
                setShowCustomInput(true);
                onChange("");
                return;
              }
              setShowCustomInput(false);
              onChange(nextValue);
            }}
            disabled={disabled}
            autoFocus={autoFocus && !shouldShowCustomInput}
          >
            <option value="" disabled>Selecione o banco</option>
            {accounts.map(account => (
              <option key={account.id} value={account.accountName}>
                {account.accountName}
              </option>
            ))}
            <option value="__custom__">+ Criar/digitar outra conta</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>
      )}

      {shouldShowCustomInput && (
        <div className="relative">
          <Plus className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="h-11 w-full rounded-lg border border-border bg-background/50 py-2 pl-10 pr-3 text-sm text-white outline-none focus:border-cyan-400 disabled:opacity-50"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={accounts.length > 0 ? "Nome da nova conta" : placeholder}
            disabled={disabled}
            autoFocus={autoFocus && shouldShowCustomInput}
          />
        </div>
      )}

      {helperText && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
}
