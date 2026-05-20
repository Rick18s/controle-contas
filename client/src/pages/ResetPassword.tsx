import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";
import BrandLogo from "@/components/BrandLogo";

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const token = useMemo(() => new URLSearchParams(window.location.search).get("token") || "", []);

  const resetPassword = trpc.auth.resetPassword.useMutation({
    onSuccess: () => {
      toast.success("Senha redefinida. Faça login novamente.");
      setLocation("/login");
    },
    onError: (error) => toast.error(error.message || "Não foi possível redefinir a senha"),
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password.length < 6) {
      toast.error("A senha deve ter no mínimo 6 caracteres");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("As senhas não conferem");
      return;
    }
    resetPassword.mutate({ token, newPassword: password });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative px-4 overflow-hidden">
      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mb-6 flex justify-center">
            <BrandLogo href="/" size="md" />
          </div>
          <Link href="/login" className="inline-flex items-center gap-2 mb-6 text-sm text-muted-foreground hover:text-primary transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Voltar ao login
          </Link>
          <h1 className="text-3xl font-semibold tracking-normal text-foreground mb-2">Nova senha</h1>
          <p className="text-sm text-muted-foreground">
            Crie uma senha segura para continuar usando sua conta.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="glass-panel p-8 rounded-2xl space-y-5 shadow-xl">
          {!token && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              Link de recuperação inválido.
            </div>
          )}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground/80" htmlFor="password">
              Nova senha
            </label>
            <input
              id="password"
              className="w-full bg-background/50 border border-border/50 rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground/80" htmlFor="confirm-password">
              Confirmar senha
            </label>
            <input
              id="confirm-password"
              className="w-full bg-background/50 border border-border/50 rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
          </div>

          <Button type="submit" disabled={resetPassword.isPending || !token} className="w-full py-6 rounded-lg font-medium gap-2">
            {resetPassword.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-4 h-4" />}
            Salvar nova senha
          </Button>
        </form>
      </div>
    </div>
  );
}
