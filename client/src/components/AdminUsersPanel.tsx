import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, Plus, Shield, UserMinus, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

export default function AdminUsersPanel() {
  const usersQuery = trpc.users.list.useQuery();
  const createUser = trpc.users.create.useMutation({
    onSuccess: () => {
      usersQuery.refetch();
      setName("");
      setUsername("");
      setEmail("");
      setPassword("");
      setRole("viewer");
      toast.success("Membro criado neste centro");
    },
    onError: (error) => toast.error(error.message || "Não foi possível criar o usuário"),
  });
  const removeUser = trpc.users.remove.useMutation({
    onSuccess: () => {
      usersQuery.refetch();
      toast.success("Membro removido deste centro");
    },
    onError: (error) => toast.error(error.message || "Não foi possível remover o membro"),
  });
  const resetPassword = trpc.users.resetPassword.useMutation({
    onSuccess: () => toast.success("Senha redefinida"),
    onError: (error) => toast.error(error.message || "Não foi possível redefinir a senha"),
  });
  const updateRole = trpc.users.updateRole.useMutation({
    onSuccess: () => {
      usersQuery.refetch();
      toast.success("Permissão atualizada");
    },
    onError: (error) => toast.error(error.message || "Não foi possível alterar a permissão"),
  });

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "finance" | "viewer">("viewer");

  const handleCreate = () => {
    if (!name.trim() || !username.trim() || !password.trim()) {
      toast.error("Informe nome, usuário e senha");
      return;
    }
    createUser.mutate({ name, username, email, password, role });
  };

  const handleResetPassword = (id: number, displayName: string | null) => {
    const nextPassword = prompt(`Nova senha para ${displayName || "usuário"}:`);
    if (!nextPassword) return;
    resetPassword.mutate({ id, newPassword: nextPassword });
  };

  const users = usersQuery.data || [];

  return (
    <section className="rounded-lg border border-border bg-card glass-card hover:border-primary/50 p-4">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded border border-pink-500/40 bg-pink-950/30 text-pink-300">
            <Shield className="h-4 w-4" />
          </span>
          <h2 className="text-sm font-mono uppercase tracking-widest text-primary">Usuários e Acessos</h2>
        </div>
        <span className="text-[10px] font-mono uppercase text-gray-500">Membros veem apenas este centro</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-4">
        <div className="rounded border border-border bg-black/25 p-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input className="bg-background/50 border border-border rounded px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-400" value={name} onChange={event => setName(event.target.value)} placeholder="Nome" />
            <input className="bg-background/50 border border-border rounded px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-400" value={username} onChange={event => setUsername(event.target.value)} placeholder="Usuário" />
            <input className="bg-background/50 border border-border rounded px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-400" value={email} onChange={event => setEmail(event.target.value)} placeholder="Email opcional" />
            <input className="bg-background/50 border border-border rounded px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-400" type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Senha inicial" />
          </div>
          <div className="flex items-center gap-2">
            <select className="flex-1 bg-background/50 border border-border rounded px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-400" value={role} onChange={event => setRole(event.target.value as "admin" | "finance" | "viewer")}>
              <option value="viewer">Visualizador</option>
              <option value="finance">Financeiro</option>
              <option value="admin">Administrador do centro</option>
            </select>

            <Button onClick={handleCreate} disabled={createUser.isPending} size="sm" className="gap-1 text-xs" >
              <Plus className="h-3 w-3" /> Criar
            </Button>
          </div>
        </div>

        <div className="divide-y divide-cyan-900/20 rounded border border-border bg-black/20 overflow-hidden">
          {users.length === 0 ? (
            <div className="p-4 text-xs font-mono text-gray-500">Nenhum usuário cadastrado.</div>
          ) : users.map(user => (
            <div key={user.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-3 py-3">
              <div className="min-w-0 flex items-center gap-3">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded border ${user.active ? 'border-green-600/40 bg-green-950/20 text-green-300' : 'border-red-600/40 bg-red-950/20 text-red-300'}`}>
                  <UserRound className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-xs font-mono font-bold text-white">{user.name || user.username}</div>
                  <div className="truncate text-[10px] font-mono text-gray-500">
                    @{user.username || user.openId} · {roleLabel(user.membershipRole)} · {user.active ? 'ativo' : 'desativado'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 self-end sm:self-auto">
                <select
                  className="h-7 rounded border border-border bg-background/50 px-2 text-xs text-white focus:outline-none focus:border-cyan-400"
                  value={user.membershipRole}
                  onChange={(event) => updateRole.mutate({ id: user.id, role: event.target.value as "admin" | "finance" | "viewer" })}
                >
                  <option value="viewer">Visualizador</option>
                  <option value="finance">Financeiro</option>
                  <option value="admin">Admin</option>
                </select>
                <Button variant="ghost" size="sm" onClick={() => handleResetPassword(user.id, user.name)} className="h-7 px-2 text-primary hover:text-primary/80 text-xs gap-1">
                  <KeyRound className="h-3 w-3" /> Senha
                </Button>
                <Button variant="ghost" size="sm" onClick={() => removeUser.mutate({ id: user.id })} className="h-7 px-2 text-red-400 hover:text-red-300 text-xs gap-1">
                  <UserMinus className="h-3 w-3" /> Remover
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function roleLabel(role: "admin" | "finance" | "viewer") {
  if (role === "admin") return "admin do centro";
  if (role === "finance") return "financeiro";
  return "visualizador";
}
