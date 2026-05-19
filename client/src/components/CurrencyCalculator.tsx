import { useState, useEffect } from "react";
import { formatBrl, parseMoney } from "@/lib/money";

const SESSION_KEY = "cc_calc_state";

function loadFromSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

export default function CurrencyCalculator() {
  const saved = loadFromSession();
  const [currency, setCurrency] = useState<string>(saved?.currency ?? "USD");
  const [amount, setAmount] = useState<string>(saved?.amount ?? "1000");
  const [rate, setRate] = useState<string>(saved?.rate ?? "5.70");
  const [fee, setFee] = useState<string>(saved?.fee ?? "1.3");

  // Persist to sessionStorage on every change
  useEffect(() => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ currency, amount, rate, fee }));
  }, [currency, amount, rate, fee]);

  const grossBrl = parseMoney(amount) * parseMoney(rate);
  const feeAmount = grossBrl * (parseMoney(fee) / 100);
  const netBrl = grossBrl - feeAmount;

  return (
    <div className="rounded-lg border border-border bg-card glass-card hover:border-primary/50 p-4">
      <h2 className="text-sm font-mono uppercase tracking-widest text-primary mb-4" >
        💱 Calculadora de Câmbio
      </h2>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] font-mono text-gray-500 uppercase">Moeda</label>
          <select
            value={currency}
            onChange={e => setCurrency(e.target.value)}
            className="w-full bg-background/50 border border-border rounded px-2 py-1.5 text-sm font-mono text-white focus:outline-none focus:border-cyan-400"
          >
            <option value="USD">Dólar (USD)</option>
            <option value="EUR">Euro (EUR)</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-mono text-gray-500 uppercase">Valor ({currency})</label>
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="w-full bg-background/50 border border-border rounded px-2 py-1.5 text-sm font-mono text-white focus:outline-none focus:border-cyan-400"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-mono text-gray-500 uppercase">Cotação (R$/{currency})</label>
          <input
            type="number"
            step="0.01"
            value={rate}
            onChange={e => setRate(e.target.value)}
            className="w-full bg-background/50 border border-border rounded px-2 py-1.5 text-sm font-mono text-white focus:outline-none focus:border-cyan-400"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-mono text-gray-500 uppercase">Taxa + IOF (%)</label>
          <input
            type="number"
            step="0.1"
            value={fee}
            onChange={e => setFee(e.target.value)}
            className="w-full bg-background/50 border border-border rounded px-2 py-1.5 text-sm font-mono text-white focus:outline-none focus:border-cyan-400"
          />
        </div>
      </div>

      {/* Results */}
      <div className="mt-4 pt-3 border-t space-y-2" style={{ borderColor: 'rgba(0,240,255,0.1)' }}>
        <div className="flex justify-between text-xs font-mono">
          <span className="text-gray-500">Bruto em R$</span>
          <span className="text-white">{formatBrl(grossBrl)}</span>
        </div>
        <div className="flex justify-between text-xs font-mono">
          <span className="text-gray-500">Desconto ({fee}%)</span>
          <span className="text-red-400">-{formatBrl(feeAmount)}</span>
        </div>
        <div className="flex justify-between text-sm font-mono font-bold pt-2 border-t" style={{ borderColor: 'rgba(0,240,255,0.1)' }}>
          <span className="text-gray-400 uppercase">Líquido na Conta</span>
          <span className="text-primary">{formatBrl(netBrl)}</span>
        </div>
      </div>
    </div>
  );
}
