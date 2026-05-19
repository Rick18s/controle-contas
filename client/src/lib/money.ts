export function parseMoney(value: string | number | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value) return 0;

  const normalized = value
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatBrl(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(value) ? value : 0);
}


export function getPaidAmount(item: { value?: string | number | null; paidValue?: string | number | null; status?: string | null }) {
  const value = parseMoney(item.value);
  if (item.status === "pago") return value;
  if (item.status === "pendente") return 0;
  return Math.min(parseMoney(item.paidValue), value);
}

export function getRemainingAmount(item: { value?: string | number | null; paidValue?: string | number | null; status?: string | null }) {
  return Math.max(parseMoney(item.value) - getPaidAmount(item), 0);
}
