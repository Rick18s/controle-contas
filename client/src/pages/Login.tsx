import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useLocation, Link } from "wouter";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, ArrowRight } from "lucide-react";

export default function Login() {
  const { loading, isAuthenticated, refresh } = useAuth();
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);

  const login = trpc.auth.login.useMutation({
    onSuccess: async () => {
      await refresh();
      toast.success("Login realizado com sucesso");
      setLocation("/dashboard");
    },
    onError: (err) => toast.error(err.message || "Usuário ou senha inválidos"),
  });

  useEffect(() => {
    if (isAuthenticated) {
      setLocation("/dashboard");
    }
  }, [isAuthenticated, setLocation]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!username || !password) {
      toast.error("Preencha todos os campos");
      return;
    }
    login.mutate({ username, password, rememberMe });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative px-4 overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block mb-6 text-xl font-bold tracking-normal text-foreground hover:opacity-80 transition-opacity">
            Controle de Contas
          </Link>
          <h1 className="text-3xl font-semibold tracking-normal text-foreground mb-2">Bem-vindo de volta</h1>
          <p className="text-sm text-muted-foreground">
            Acesse sua conta para gerenciar suas finanças
          </p>
        </div>

        <form onSubmit={handleSubmit} className="glass-panel p-8 rounded-2xl space-y-5 shadow-xl">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground/80" htmlFor="username">
              Usuário
            </label>
            <input
              id="username"
              className="w-full bg-background/50 border border-border/50 rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              placeholder="Seu nome de usuário"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground/80" htmlFor="password">
              Senha
            </label>
            <input
              id="password"
              className="w-full bg-background/50 border border-border/50 rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </div>

          <div className="text-right">
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                  className="accent-primary"
                />
                Lembrar meu acesso
              </label>
              <Link href="/forgot-password" className="text-xs text-primary hover:underline font-medium">
                Esqueci minha senha
              </Link>
            </div>
          </div>

          <Button
            type="submit"
            disabled={login.isPending}
            className="w-full py-6 mt-2 rounded-lg font-medium shadow-lg hover:shadow-primary/25 transition-all flex items-center justify-center gap-2 group"
          >
            {login.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                Entrar
                <ArrowRight className="w-4 h-4 opacity-70 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </Button>

          <div className="text-center mt-6 text-sm text-muted-foreground">
            Não tem uma conta?{" "}
            <Link href="/register" className="text-primary hover:underline font-medium">
              Crie uma agora
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
