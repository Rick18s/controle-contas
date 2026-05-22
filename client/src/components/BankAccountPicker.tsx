import { Landmark } from "lucide-react";
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
  const normalizedValue = value.trim().toLowerCase();

  return (
    <div className="space-y-2">
      <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        {label}
      </label>

      {accounts.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {accounts.map(account => {
            const selected = account.accountName.trim().toLowerCase() === normalizedValue;
            return (
              <Button
                key={account.id}
                type="button"
                variant="ghost"
                disabled={disabled}
                onClick={() => onChange(account.accountName)}
                className={`h-auto min-h-10 justify-start gap-2 rounded-lg border px-3 py-2 text-left text-xs ${
                  selected
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background/30 text-muted-foreground hover:text-foreground"
                }`}
              >
                <Landmark className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{account.accountName}</span>
              </Button>
            );
          })}
        </div>
      )}

      <input
        className="w-full rounded border border-border bg-background/50 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-cyan-400 disabled:opacity-50"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
      />

      {helperText && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
}
