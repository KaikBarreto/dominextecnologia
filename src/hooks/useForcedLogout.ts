import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

export const useForcedLogout = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;

    // Sanity check no mount: se não há token agora, nada pra monitorar.
    // O callback abaixo SEMPRE re-lê `session_token` do localStorage —
    // nunca usa closure capturada aqui. Isso é o que distingue
    // "self-deletion" (AccountSwitcher / signOut próprio) de
    // "outro dispositivo me desconectou":
    //   - self-deletion: `sessionUtils.clearActiveSession` limpa o
    //     localStorage ANTES do delete no banco, então quando o realtime
    //     chega aqui, `getItem` retorna null → ignoramos.
    //   - outro dispositivo: o localStorage local ainda tem o token igual
    //     ao deletado → disparamos signOut legítimo.
    if (!localStorage.getItem("session_token")) return;

    const channel = supabase
      .channel(`session-monitor-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "active_sessions",
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          const oldSession = payload.old as { session_token?: string; user_id?: string };

          // CRÍTICO: lê do localStorage AGORA, não da closure do mount.
          // Self-deletion (AccountSwitcher / signOut local) já limpou o
          // localStorage via `sessionUtils.clearActiveSession` antes do
          // delete viajar até aqui — `currentToken` é null e ignoramos,
          // evitando race condition com o `refreshSession` da conta nova
          // (incidente 1.8.30).
          const currentToken = localStorage.getItem("session_token");
          if (!currentToken) return;

          // With REPLICA IDENTITY FULL, old row data is available
          // Check if the deleted session matches OUR token
          if (oldSession?.session_token && oldSession.session_token !== currentToken) return;

          // If session_token is missing from payload (fallback), verify our session still exists
          if (!oldSession?.session_token) {
            const { data } = await supabase
              .from("active_sessions")
              .select("id")
              .eq("user_id", user.id)
              .eq("session_token", currentToken)
              .maybeSingle();

            // Our session still exists — the delete was for another session
            if (data) return;
          }

          toast({
            variant: "destructive",
            title: "Sessão encerrada",
            description: "Sua sessão foi encerrada por outro dispositivo.",
          });
          localStorage.removeItem("session_token");
          await signOut();
          navigate("/login");
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [user, signOut, navigate, toast]);

  // Update activity every 2 minutes
  useEffect(() => {
    if (!user) return;

    // Sanity check no mount; o updateActivity re-lê do localStorage em
    // cada tick (não usa closure) — mesmo padrão idiomático do effect
    // acima. Aqui é menos crítico (apenas atualiza `last_activity`),
    // mas se o token mudar entre ticks o update vai pro token certo.
    if (!localStorage.getItem("session_token")) return;

    const updateActivity = async () => {
      const currentToken = localStorage.getItem("session_token");
      if (!currentToken) return;
      await supabase
        .from("active_sessions")
        .update({ last_activity: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("session_token", currentToken);
    };

    const interval = setInterval(updateActivity, 120000);
    return () => clearInterval(interval);
  }, [user]);
};
