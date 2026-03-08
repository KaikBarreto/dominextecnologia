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

    const currentToken = localStorage.getItem("session_token");
    if (!currentToken) return;

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

    const currentToken = localStorage.getItem("session_token");
    if (!currentToken) return;

    const updateActivity = async () => {
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
