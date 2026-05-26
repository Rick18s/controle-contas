import { useState } from "react";
import { Building2, KeyRound, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";

export default function AccountAccessBar({ isAdmin, onOrganizationChange }: { isAdmin: boolean; onOrganizationChange?: () => void }) {
  const utils = trpc.useUtils();
  const orgsQuery = trpc.organizations.list.useQuery();
  const setActiveOrg = trpc.organizations.setActive.useMutation({
    onSuccess: async () => {
      onOrganizationChange?.();
      await utils.invalidate();
      toast.success("Organização alterada");
    },
    onError: (error) => toast.error(error.message || "Não foi possível alterar a organização"),
  });
  const createOrg = trpc.organizations.create.useMutation({
    onSuccess: async (organization) => {
      await setActiveOrg.mutateAsync({ organizationId: organization.id });
      setShowCreateOrg(false);
      setNewOrgName("");
      toast.success("Organização criada");
    },
    onError: (error) => toast.error(error.message || "Não foi possível criar a organização"),
  });
  const changePassword = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      setShowPassword(false);
      setCurrentPassword("");
      setNewPassword("");
      toast.success("Senha alterada");
    },
    onError: (error) => toast.error(error.message || "Não foi possível alterar a senha"),
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newOrgName, setNewOrgName] = useState("");

  const orgData = orgsQuery.data;
  const organizations = orgData?.organizations || [];
  const activeOrganizationId = orgData?.activeOrganizationId ?? organizations[0]?.id;

  const handleCreateOrg = () => {
    const name = newOrgName.trim();
    if (!name) {
      toast.error("Informe o nome da organização");
      return;
    }
    createOrg.mutate({ name });
  };

  const handleChangePassword = () => {
    if (!currentPassword || newPassword.length < 6) {
      toast.error("Informe a senha atual e uma nova senha com pelo menos 6 caracteres");
      return;
    }
    changePassword.mutate({ currentPassword, newPassword });
  };

  return (
    <section className="w-full rounded-2xl border border-border bg-card p-3 shadow-sm hover:border-primary/50 sm:w-auto">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-cyan-500/40 bg-primary/10 text-primary">
            <Building2 className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">Centro ativo</div>
            <Select
              value={activeOrganizationId?.toString() ?? ""}
              onValueChange={(val) => setActiveOrg.mutate({ organizationId: Number(val) })}
              disabled={setActiveOrg.isPending || organizations.length === 0}
            >
              <SelectTrigger className="h-11 w-full rounded-xl bg-background text-xs font-mono sm:h-[34px] sm:min-w-[220px]">
                <SelectValue placeholder="Selecione uma organização" />
              </SelectTrigger>
              <SelectContent>
                {organizations.map(org => (
                  <SelectItem key={org.id} value={org.id.toString()}>{org.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {isAdmin && (
            <Button variant="ghost" size="sm" onClick={() => setShowCreateOrg(true)} className="h-10 rounded-xl px-2 text-xs text-primary hover:text-primary/80 sm:h-8">
              <Plus className="h-3 w-3" /> Organização
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setShowPassword(true)} className="h-10 rounded-xl px-2 text-xs text-primary hover:text-primary/80 sm:h-8">
            <KeyRound className="h-3 w-3" /> Minha senha
          </Button>
        </div>
      </div>

      <Dialog open={showCreateOrg} onOpenChange={setShowCreateOrg}>
        <DialogContent className="border border-border bg-card text-card-foreground sm:max-w-md">
          <DialogHeader><DialogTitle className="text-primary font-mono text-sm uppercase tracking-widest">Nova organização</DialogTitle></DialogHeader>
          <input className="h-11 rounded-xl border border-border bg-background/50 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-cyan-400" value={newOrgName} onChange={event => setNewOrgName(event.target.value)} placeholder="Ex: Agência, Loja, Cliente" />
          <DialogFooter className="grid grid-cols-1 gap-2 sm:flex">
            <Button variant="ghost" onClick={() => setShowCreateOrg(false)} className="h-11 text-xs text-gray-400">Cancelar</Button>
            <Button onClick={handleCreateOrg} disabled={createOrg.isPending} className="h-11 text-xs" >Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPassword} onOpenChange={setShowPassword}>
        <DialogContent className="border border-border bg-card text-card-foreground sm:max-w-md">
          <DialogHeader><DialogTitle className="text-primary font-mono text-sm uppercase tracking-widest">Alterar senha</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <input className="h-11 w-full rounded-xl border border-border bg-background/50 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-cyan-400" type="password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} placeholder="Senha atual" />
            <input className="h-11 w-full rounded-xl border border-border bg-background/50 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-cyan-400" type="password" value={newPassword} onChange={event => setNewPassword(event.target.value)} placeholder="Nova senha" />
          </div>
          <DialogFooter className="grid grid-cols-1 gap-2 sm:flex">
            <Button variant="ghost" onClick={() => setShowPassword(false)} className="h-11 text-xs text-gray-400">Cancelar</Button>
            <Button onClick={handleChangePassword} disabled={changePassword.isPending} className="h-11 text-xs" >Alterar senha</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
