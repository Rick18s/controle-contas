export type CardIconKey =
  | "home"
  | "business"
  | "cards"
  | "personal"
  | "car"
  | "market"
  | "income"
  | "work"
  | "help"
  | "other";

const ICON_RULES: Array<{ key: CardIconKey; emoji: string; words: string[] }> = [
  { key: "home", emoji: "🏠", words: ["casa", "aluguel", "condominio", "condomínio", "moradia"] },
  { key: "business", emoji: "🏢", words: ["empresa", "escritorio", "escritório", "pj", "cnpj"] },
  { key: "cards", emoji: "💳", words: ["cartao", "cartão", "cartoes", "cartões", "credito", "crédito", "nubank", "itau", "itaú", "inter", "picpay", "c6", "xp", "sofisa"] },
  { key: "personal", emoji: "👤", words: ["pessoal", "pessoais", "cuidados", "cabelo", "pedro", "debora", "débora"] },
  { key: "car", emoji: "🚗", words: ["carro", "combustivel", "combustível", "veiculo", "veículo"] },
  { key: "market", emoji: "🛒", words: ["mercado", "feira", "supermercado", "compras"] },
  { key: "income", emoji: "💰", words: ["receita", "receitas", "entrada", "entradas", "faturamento", "lucro"] },
  { key: "work", emoji: "💼", words: ["trabalho", "servico", "serviço", "cliente", "projeto"] },
  { key: "help", emoji: "🤝", words: ["ajuda", "doacao", "doação", "dizimo", "dízimo", "igreja", "mae", "mãe"] },
  { key: "other", emoji: "📋", words: ["outro", "outros", "geral"] },
];

const EMOJI_BY_KEY = Object.fromEntries(ICON_RULES.map(rule => [rule.key, rule.emoji])) as Record<CardIconKey, string>;

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function inferCardIconKey(name: string, fallback: CardIconKey = "other") {
  const normalizedName = normalize(name);
  const match = ICON_RULES.find(rule =>
    rule.words.some(word => normalizedName.includes(normalize(word)))
  );

  return match?.key ?? fallback;
}

export function inferCardIcon(name: string, fallback = "📋") {
  const key = inferCardIconKey(name);
  return EMOJI_BY_KEY[key] ?? fallback;
}
