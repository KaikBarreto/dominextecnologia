import { ReactNode, useEffect, useRef, useState } from "react";
import { LogOut, Plus, UserPlus, X, Crown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { useSavedSessions, type SavedSession } from "@/hooks/useSavedSessions";

interface AccountSwitcherDropdownProps {
  children: ReactNode;
  /** Mantidos por compatibilidade com chamadas antigas — não são mais usados. */
  align?: "start" | "end" | "center";
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
  className?: string;
}

const getInitials = (name: string) => {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
};

const RoleBadge = ({ role }: { role: string }) => {
  if (role === "company_admin") {
    return (
      <Badge className="bg-green-600 hover:bg-green-600 text-white font-semibold text-[10px] px-1.5 py-0 gap-1 inline-flex">
        <Crown className="h-2.5 w-2.5" />
        MASTER
      </Badge>
    );
  }
  if (role === "admin") {
    // Vermelho saturado pra contrastar com MASTER (verde) — sinaliza
    // staff interno Auctus. No Dominex, este role mapeia de super_admin.
    return (
      <Badge className="bg-red-600 hover:bg-red-600 text-white font-semibold text-[10px] px-1.5 py-0">
        ADMIN
      </Badge>
    );
  }
  return null;
};

/**
 * Switcher de contas com expansão INLINE (sem portal, sem overlay, sem blur).
 *
 * Wrapper inline pattern: receive children (o trigger card) e quando fechado
 * renderiza o trigger; quando aberto, trigger SOME e expansão inline aparece
 * no mesmo lugar — o conteúdo abaixo é empurrado naturalmente pelo flow.
 * Sem dropdown standalone, sem portal, sem overlay.
 *
 * Click fora fecha (pointerdown capture phase + shield 300ms). ESC fecha.
 *
 * Referência: docs/planos/2026-05-20-account-switcher-ui-ecosistema.md
 * Implementação 1:1 do EcoSistema (src/components/account-switcher/AccountSwitcherDropdown.tsx).
 */
export const AccountSwitcherDropdown = ({
  children,
  className,
}: AccountSwitcherDropdownProps) => {
  const {
    activeSession,
    otherSessions,
    isLoading,
    canAddMore,
    switchToSession,
    removeSession,
    clearAllSessions,
    startAddAccount,
  } = useSavedSessions();

  const [open, setOpen] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  // Timestamp do último fechamento por click-fora. Usado pra "blindar" o
  // click subsequente que o navegador sintetiza no elemento que assume a
  // posição depois do switcher retrair (bug "vaza pro item de baixo").
  const [justClosedAt, setJustClosedAt] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  // Click fora fecha. Usa `pointerdown` em capture phase pra interceptar
  // ANTES do click ser disparado no elemento alvo. `preventDefault()` no
  // pointerdown cancela o `click` sintetizado que o navegador faria depois
  // — exatamente o que evita o vazamento. Em mobile, pointerdown cobre
  // touch + mouse no mesmo listener (sem duplicar com touchstart).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        setJustClosedAt(Date.now());
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open]);

  // Cinto de segurança: alguns navegadores podem ainda assim sintetizar
  // o `click` mesmo com preventDefault no pointerdown (Safari iOS antigo,
  // edge cases). Por 300ms após fechar, qualquer click no documento é
  // ignorado em capture phase — usuário precisa clicar de novo
  // conscientemente no item desejado.
  useEffect(() => {
    if (!justClosedAt) return;
    const onClickShield = (e: MouseEvent) => {
      if (Date.now() - justClosedAt < 300) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("click", onClickShield, true);
    return () => document.removeEventListener("click", onClickShield, true);
  }, [justClosedAt]);

  // ESC fecha — atalho universal de fechamento de overlays.
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open]);

  const handleSwitch = async (userId: string) => {
    setOpen(false);
    await switchToSession(userId);
  };

  const handleRemove = async (
    e: React.MouseEvent,
    session: SavedSession,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    await removeSession(session.user_id);
  };

  const handleAddAccount = async () => {
    setOpen(false);
    await startAddAccount();
  };

  const handleSignOutActive = async () => {
    if (!activeSession) return;
    setOpen(false);
    await removeSession(activeSession.user_id);
  };

  const handleClearAll = async () => {
    setConfirmClearAll(false);
    setOpen(false);
    await clearAllSessions();
  };

  // Sem sessão ativa salva: só renderiza o trigger normal. Não há nada
  // pra "abrir" — sem activeSession nem otherSessions, o card não tem
  // o que mostrar quando expandido.
  if (!isLoading && !activeSession) {
    return <>{children}</>;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div ref={ref} className="w-full">
        {/* ============ TRIGGER (mostrado quando fechado) ============
            Quando o switcher abre, o trigger SOME (não fica invisível) —
            o conteúdo expandido toma seu lugar no flow normal. Isso faz
            com que o conteúdo ABAIXO do componente seja empurrado pra
            baixo naturalmente, dentro do scroll do drawer pai. */}
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-full text-left"
            aria-label="Trocar de conta"
            aria-expanded={false}
          >
            {children}
          </button>
        )}

        {/* ============ EXPANSÃO INLINE ============
            Renderizado no flow normal (sem portal, sem position:fixed).
            Cresce em altura — empurra naturalmente o conteúdo abaixo
            dentro do drawer/container pai. Animação max-height suave. */}
        {open && (
          <div
            className={cn(
              "w-full rounded-xl border border-border/60 bg-background overflow-hidden",
              className,
            )}
            style={{
              animation: "switcherExpand 220ms cubic-bezier(0.32, 0.72, 0, 1)",
              transformOrigin: "top center",
            }}
          >
            {isLoading ? (
              <div className="p-3 space-y-2">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-3/4" />
                    <Skeleton className="h-2 w-1/2" />
                  </div>
                </div>
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            ) : (
              <div className="flex flex-col">
                {/* ============ LINHA 1 — CONTA ATIVA ============
                    "Espelha" o trigger fechado (mesma estrutura visual).
                    Botão Sair MENOR (h-7 w-7) — discreto, sem competir
                    com a hierarquia visual da identidade. */}
                {activeSession && (
                  <div className="px-3 py-2.5 bg-muted/30 border-b border-border/40">
                    <div className="flex items-start gap-3">
                      <Avatar className="h-11 w-11 shrink-0">
                        <AvatarImage
                          src={activeSession.avatar_url || undefined}
                          alt={activeSession.full_name}
                        />
                        <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                          {getInitials(activeSession.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-semibold text-foreground truncate leading-tight">
                            {activeSession.full_name.split(" ").slice(0, 2).join(" ")}
                          </p>
                          <RoleBadge role={activeSession.role} />
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
                          {activeSession.email}
                        </p>
                        {activeSession.company_name && (
                          <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
                            {activeSession.company_name}
                          </p>
                        )}
                      </div>
                      {/* Botão Sair MENOR — h-7 w-7. Idle sem fundo (ícone neutro),
                          hover vermelho saturado com ícone branco. */}
                      <button
                        type="button"
                        onClick={handleSignOutActive}
                        aria-label="Sair desta conta"
                        title="Sair desta conta"
                        className="ml-auto h-7 w-7 p-0 flex items-center justify-center rounded-md text-foreground hover:bg-red-600 hover:text-white transition-colors shrink-0 self-start"
                      >
                        <LogOut className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* ============ BLOCO INFERIOR — fade-in atrasado ============
                    delay 80ms cria a sensação de "o card cresceu
                    primeiro, depois revelou as opções". */}
                <div
                  className="flex flex-col animate-in fade-in duration-150"
                  style={{ animationDelay: "80ms", animationFillMode: "backwards" }}
                >
                  {/* ============ LISTA DE OUTRAS CONTAS ============
                      max-h-[168px] = ~3 contas visíveis (item ~52px:
                      Avatar h-9 + py-2). A partir do 4º, scroll vertical
                      aparece naturalmente via overflow-y-auto. A conta
                      ATIVA do topo fica fora desse scroll, sempre visível. */}
                  <div className="max-h-[168px] overflow-y-auto">
                    {otherSessions.length > 0 ? (
                      <div className="py-1.5">
                        {otherSessions.map((session) => (
                          <div
                            key={session.user_id}
                            className="group relative border-b border-border/40 last:border-b-0"
                          >
                            <button
                              type="button"
                              onClick={() => handleSwitch(session.user_id)}
                              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/60 transition-colors text-left"
                            >
                              <Avatar className="h-9 w-9 shrink-0">
                                <AvatarImage
                                  src={session.avatar_url || undefined}
                                  alt={session.full_name}
                                />
                                <AvatarFallback className="bg-primary/80 text-primary-foreground text-xs">
                                  {getInitials(session.full_name)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0 flex-1 overflow-hidden pr-7">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className="text-[13px] font-medium text-foreground truncate leading-tight">
                                    {session.full_name.split(" ").slice(0, 2).join(" ")}
                                  </p>
                                  <RoleBadge role={session.role} />
                                </div>
                                <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
                                  {session.email}
                                </p>
                                {session.company_name && (
                                  <p className="text-[10px] text-muted-foreground/80 truncate leading-tight">
                                    {session.company_name}
                                  </p>
                                )}
                              </div>
                            </button>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={(e) => handleRemove(e, session)}
                                  aria-label="Remover conta salva"
                                  // Mobile (touch): sempre visível (opacity-100).
                                  // Desktop (lg+): esconde por padrão e mostra no hover do grupo.
                                  className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground opacity-100 lg:opacity-0 lg:group-hover:opacity-100 hover:bg-red-600 hover:text-white transition-all"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="left">Remover conta salva</TooltipContent>
                            </Tooltip>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="px-4 py-3 text-center">
                        <p className="text-[11px] text-muted-foreground leading-snug">
                          Apenas essa conta está salva. Use "+ Adicionar conta" pra incluir outra.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-border/40" />

                  {/* ============ "+ ADICIONAR CONTA" ============ */}
                  <div className="p-1.5">
                    {canAddMore ? (
                      <button
                        type="button"
                        onClick={handleAddAccount}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-[13px] font-medium text-foreground hover:bg-muted/60 transition-colors"
                      >
                        <span className="h-8 w-8 shrink-0 rounded-full border border-dashed border-border flex items-center justify-center">
                          <Plus className="h-4 w-4 text-muted-foreground" />
                        </span>
                        <span>Adicionar conta</span>
                      </button>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            disabled
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-[13px] font-medium text-muted-foreground/60 cursor-not-allowed"
                          >
                            <span className="h-8 w-8 shrink-0 rounded-full border border-dashed border-border/60 flex items-center justify-center">
                              <UserPlus className="h-4 w-4" />
                            </span>
                            <span>Adicionar conta</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          Limite de 5 contas atingido — remova uma antes
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>

                  <div className="border-t border-border/40" />

                  {/* ============ "SAIR DE TODAS" ============
                      Discreto, centralizado. Hover vermelho saturado
                      (regra do Kaik pra ações negativas com idle ghost). */}
                  <div className="p-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setConfirmClearAll(true)}
                      className="w-full justify-center gap-2 h-9 px-3 text-[12px] font-medium text-muted-foreground hover:bg-red-600 hover:text-white dark:hover:bg-red-600 dark:hover:text-white"
                    >
                      <LogOut className="h-3.5 w-3.5 shrink-0" />
                      <span>Sair de todas as contas</span>
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Keyframes da animação de expansão (só altura, sem opacity).
          Removido o fade-in do container — só anima altura em ease-out
          de 200ms. Os itens internos têm seu próprio fade-in atrasado. */}
      <style>{`
        @keyframes switcherExpand {
          from {
            max-height: 80px;
          }
          to {
            max-height: 600px;
          }
        }
      `}</style>

      {/* Confirm "Sair de todas" */}
      <AlertDialog open={confirmClearAll} onOpenChange={setConfirmClearAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sair de todas as contas?</AlertDialogTitle>
            <AlertDialogDescription>
              Vai sair de TODAS as contas salvas neste dispositivo. Você
              precisará entrar com email e senha de novo pra cada conta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearAll}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sair de todas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
};
