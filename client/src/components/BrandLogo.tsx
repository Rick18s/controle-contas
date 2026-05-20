import { cn } from "@/lib/utils";
import { Link } from "wouter";

type BrandLogoProps = {
  href?: string;
  compact?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizeClasses = {
  sm: {
    mark: "h-8 w-8",
    text: "text-lg leading-5",
    gap: "gap-2",
  },
  md: {
    mark: "h-10 w-10",
    text: "text-2xl leading-6",
    gap: "gap-3",
  },
  lg: {
    mark: "h-16 w-16 sm:h-20 sm:w-20",
    text: "text-4xl sm:text-5xl leading-[0.95]",
    gap: "gap-4",
  },
};

function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" className={className} role="img" aria-label="Controle de Contas">
      <defs>
        <linearGradient id="brand-logo-gradient" x1="18" y1="80" x2="82" y2="14" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7c3aed" />
          <stop offset="0.48" stopColor="#a855f7" />
          <stop offset="1" stopColor="#ec4899" />
        </linearGradient>
        <filter id="brand-logo-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path
        d="M70.5 73.2A34 34 0 1 1 74 25.3"
        fill="none"
        stroke="url(#brand-logo-gradient)"
        strokeWidth="10"
        strokeLinecap="round"
        filter="url(#brand-logo-glow)"
      />
      <path
        d="M24 58.5 38.5 43l13 10.8L76 25"
        fill="none"
        stroke="url(#brand-logo-gradient)"
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M68 23.5 82 19l-2.5 15"
        fill="none"
        stroke="#ec4899"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BrandLogoContent({ compact = false, size = "md", className }: Omit<BrandLogoProps, "href">) {
  const sizing = sizeClasses[size];
  return (
    <span className={cn("inline-flex items-center", sizing.gap, className)}>
      <LogoMark className={cn(sizing.mark, "shrink-0")} />
      {!compact && (
        <span className={cn("font-extrabold tracking-normal text-white", sizing.text)}>
          Controle
          <span className="block">de Contas</span>
        </span>
      )}
    </span>
  );
}

export default function BrandLogo({ href, compact, size = "md", className }: BrandLogoProps) {
  if (href) {
    return (
      <Link href={href} className="inline-flex transition-opacity hover:opacity-90">
        <BrandLogoContent compact={compact} size={size} className={className} />
      </Link>
    );
  }

  return <BrandLogoContent compact={compact} size={size} className={className} />;
}
