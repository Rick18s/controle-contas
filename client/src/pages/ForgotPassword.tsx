import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");

  const requestReset = trpc.auth.requestPasswordReset.useMutation({
    onSuccess: () => {
      toast.success("Se o e-mail existir, enviaremos o link de recuperação.");
      setEmail("");
    },
    onError: (error) => toast.error(error.message || "Não foi possível enviar o e-mail"),
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    requestReset.mutate({ email });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative px-4 overflow-hidden">
      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/login" className="inline-flex items-center gap-2 mb-6 text-sm text-muted-foreground hover:text-primary transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Voltar ao login
          </Link>
          <h1 className="text-3xl font-semibold tracking-normal text-foreground mb-2">Recuperar senha</h1>
          <p className="text-sm text-muted-foreground">
            Digite seu e-mail para receber um link seguro de redefinição.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="glass-panel p-8 rounded-2xl space-y-5 shadow-xl">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground/80" htmlFor="email">
              E-mail
            </label>
            <input
              id="email"
              className="w-full bg-background/50 border border-border/50 rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="voce@email.com"
              required
            />
          </div>

          <Button type="submit" disabled={requestReset.isPending} className="w-full py-6 rounded-lg font-medium gap-2">
            {requestReset.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Mail className="w-4 h-4" />}
            Enviar link
          </Button>
        </form>
      </div>
    </div>
  );
}
