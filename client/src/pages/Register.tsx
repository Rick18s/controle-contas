import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useLocation, Link } from "wouter";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, ArrowRight } from "lucide-react";

export default function Register() {
  const { loading, isAuthenticated, refresh } = useAuth();
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const register = trpc.auth.register.useMutation({
    onSuccess: async () => {
      await refresh();
      toast.success("Conta criada com sucesso! Bem-vindo!");
      setLocation("/dashboard");
    },
    onError: (err) => toast.error(err.message || "Não foi possível criar a conta"),
  });

  useEffect(() => {
    if (isAuthenticated) {
      setLocation("/dashboard");
    }
  }, [isAuthenticated, setLocation]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name || !username || !password) {
      toast.error("Preencha todos os campos");
      return;
    }
    if (password.length < 6) {
      toast.error("A senha deve ter no mínimo 6 caracteres");
      return;
    }
    register.mutate({ name, username, password });
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
      <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-500/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block mb-6 text-xl font-bold tracking-normal text-foreground hover:opacity-80 transition-opacity">
            Controle de Contas
          </Link>
          <h1 className="text-3xl font-semibold tracking-normal text-foreground mb-2">Crie sua conta</h1>
          <p className="text-sm text-muted-foreground">
            Comece a gerenciar suas finanças gratuitamente
          </p>
        </div>

        <form onSubmit={handleSubmit} className="glass-panel p-8 rounded-2xl space-y-5 shadow-xl">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground/80" htmlFor="name">
              Nome ou Empresa
            </label>
            <input
              id="name"
              className="w-full bg-background/50 border border-border/50 rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Como quer ser chamado"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground/80" htmlFor="username">
              Nome de usuário
            </label>
            <input
              id="username"
              className="w-full bg-background/50 border border-border/50 rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              value={username}
              onChange={(event) => setUsername(event.target.value.replace(/\s+/g, '').toLowerCase())}
              autoComplete="username"
              placeholder="usuario (sem espaços)"
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
              autoComplete="new-password"
              placeholder="Mínimo de 6 caracteres"
            />
          </div>

          <Button
            type="submit"
            disabled={register.isPending}
            className="w-full py-6 mt-2 rounded-lg font-medium shadow-lg hover:shadow-primary/25 transition-all flex items-center justify-center gap-2 group"
          >
            {register.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                Criar conta
                <ArrowRight className="w-4 h-4 opacity-70 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </Button>

          <div className="text-center mt-6 text-sm text-muted-foreground">
            Já tem uma conta?{" "}
            <Link href="/login" className="text-primary hover:underline font-medium">
              Faça login
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
