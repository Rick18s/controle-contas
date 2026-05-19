import {
  BriefcaseBusiness,
  Building2,
  Car,
  CreditCard,
  HandHeart,
  Home,
  ReceiptText,
  ShoppingCart,
  UserRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { inferCardIconKey, type CardIconKey } from "@/lib/cardIcons";

const ICON_COMPONENTS: Record<CardIconKey, LucideIcon> = {
  home: Home,
  business: Building2,
  cards: CreditCard,
  personal: UserRound,
  car: Car,
  market: ShoppingCart,
  income: Wallet,
  work: BriefcaseBusiness,
  help: HandHeart,
  other: ReceiptText,
};

export function CardCategoryIcon({ name, className = "h-4 w-4" }: { name: string; className?: string }) {
  const Icon = ICON_COMPONENTS[inferCardIconKey(name)];
  return <Icon className={className} aria-hidden="true" />;
}
