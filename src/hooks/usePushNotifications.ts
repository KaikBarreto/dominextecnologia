import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  disablePushNotifications,
  deactivatePushDevice,
  enablePushNotifications,
  getPushPermissionState,
  listPushDevices,
  type PushDeviceSummary,
  type PushPermissionState,
  supportsWebPush,
} from "@/lib/pushNotifications";

export function usePushNotifications() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const [state, setState] = useState<PushPermissionState>("available");
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, setIsPending] = useState(false);
  const [devices, setDevices] = useState<PushDeviceSummary[]>([]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      setState(await getPushPermissionState(companyId ?? undefined));
      if (companyId) {
        try {
          setDevices(await listPushDevices(companyId));
        } catch {
          setDevices([]);
        }
      } else {
        setDevices([]);
      }
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = useCallback(async (deviceLabel?: string) => {
    if (!companyId) throw new Error("Empresa não encontrada para este usuário.");
    setIsPending(true);
    try {
      const nextState = await enablePushNotifications(companyId, deviceLabel);
      setState(nextState);
      if (nextState !== "subscribed") {
        throw new Error(
          nextState === "blocked"
            ? "As notificações estão bloqueadas nos ajustes deste aparelho."
            : "Este aparelho não conseguiu ativar as notificações.",
        );
      }
      setDevices(await listPushDevices(companyId));
      return nextState;
    } finally {
      setIsPending(false);
    }
  }, [companyId]);

  const disableDevice = useCallback(async (subscriptionId: string) => {
    if (!companyId) return;
    const device = devices.find((item) => item.id === subscriptionId);
    setIsPending(true);
    try {
      if (device?.is_current) await disablePushNotifications(companyId);
      else await deactivatePushDevice(companyId, subscriptionId);
      await refresh();
    } finally {
      setIsPending(false);
    }
  }, [companyId, devices, refresh]);

  const disable = useCallback(async () => {
    if (!companyId) return;
    setIsPending(true);
    try {
      await disablePushNotifications(companyId);
      await refresh();
    } finally {
      setIsPending(false);
    }
  }, [companyId, refresh]);

  const permission: NotificationPermission | "unsupported" = supportsWebPush()
    ? Notification.permission
    : "unsupported";

  return {
    support: supportsWebPush() ? "supported" as const : "unsupported" as const,
    permission,
    state,
    isSubscribed: state === "subscribed",
    isLoading,
    isPending,
    devices,
    enable,
    disable,
    disableDevice,
    refresh,
  };
}
