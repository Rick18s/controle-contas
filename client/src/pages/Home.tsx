import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2, PieChart, Shield, Zap } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

export default function Home() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col overflow-hidden selection:bg-primary/30">
      {/* Navbar */}
      <nav className="container mx-auto px-6 py-6 flex items-center justify-between relative z-10">
        <div className="font-bold text-xl tracking-normal text-gradient-primary">
          Controle de Contas
        </div>
        <div className="flex items-center gap-4">
          {isAuthenticated ? (
            <Link href="/dashboard">
              <Button variant="ghost" className="hidden sm:flex">Acessar Dashboard</Button>
            </Link>
          ) : (
            <Link href="/login">
              <Button variant="ghost" className="hidden sm:flex">Entrar</Button>
            </Link>
          )}
          <Link href={isAuthenticated ? "/dashboard" : "/register"}>
            <Button className="rounded-full px-6 shadow-lg shadow-primary/20">
              {isAuthenticated ? "Ir para Dashboard" : "Começar grátis"}
            </Button>
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center relative pt-20 pb-32">
        {/* Abstract Background Effects */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/10 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute top-[20%] right-[10%] w-[400px] h-[400px] bg-blue-500/10 blur-[100px] rounded-full pointer-events-none" />

        <div className="container mx-auto px-6 text-center relative z-10 max-w-4xl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8 border border-primary/20">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            Gestão Financeira Simplificada
          </div>
          
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-normal mb-8 leading-[1.05]">
            O controle das suas contas, <br />
            <span className="text-gradient-primary">de forma inteligente.</span>
          </h1>
          
          <p className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed">
            Abandone as planilhas complexas. Gerencie suas despesas, cartões de crédito e fluxo de caixa em um único painel intuitivo e bonito.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href={isAuthenticated ? "/dashboard" : "/register"}>
              <Button size="lg" className="h-14 px-8 text-base rounded-full w-full sm:w-auto shadow-xl shadow-primary/25 group">
                {isAuthenticated ? "Acessar meu painel" : "Criar conta gratuita"}
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            {!isAuthenticated && (
              <Link href="/login">
                <Button variant="outline" size="lg" className="h-14 px-8 text-base rounded-full w-full sm:w-auto bg-background/50 backdrop-blur-sm border-border/50">
                  Já tenho uma conta
                </Button>
              </Link>
            )}
          </div>

          {/* Feature highlights */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-32 text-left">
            <div className="glass-card p-6 rounded-2xl">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary mb-4">
                <PieChart className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Visão Geral Clara</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">Acompanhe todos os seus cartões, contas e receitas em um dashboard limpo e sem distrações.</p>
            </div>
            <div className="glass-card p-6 rounded-2xl">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary mb-4">
                <Zap className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Rápido e Simples</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">Registre entradas e saídas em segundos. Desenvolvido para não perder seu tempo precioso.</p>
            </div>
            <div className="glass-card p-6 rounded-2xl">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary mb-4">
                <Shield className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Seguro e Privado</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">Seus dados ficam isolados em sua própria organização. Acesso restrito e criptografado.</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
