import { supabase } from "@/integrations/supabase/client";

const PUSH_OPERATION_TIMEOUT_MS = 8_000;
export const PUSH_LOGOUT_TIMEOUT_MS = 2_000;

export type PushPermissionState =
  | "unsupported"
  | "not-configured"
  | "blocked"
  | "available"
  | "subscribed";

export interface PushDeviceSummary {
  id: string;
  device_label: string | null;
  user_agent: string | null;
  active: boolean;
  last_seen_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  created_at: string;
  is_current: boolean;
}

type SerializedSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs = PUSH_OPERATION_TIMEOUT_MS,
  timeoutMessage = "A operação de notificações demorou mais que o esperado.",
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error(timeoutMessage)),
      timeoutMs,
    );
    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

/** Aguarda uma tarefa best-effort sem permitir que ela prenda um fluxo crítico. */
export async function waitForBestEffort(
  promise: Promise<unknown>,
  timeoutMs: number,
): Promise<"completed" | "timeout"> {
  let timeout: number | undefined;
  const result = await Promise.race([
    promise.then(() => "completed" as const, () => "completed" as const),
    new Promise<"timeout">((resolve) => {
      timeout = window.setTimeout(() => resolve("timeout"), timeoutMs);
    }),
  ]);
  if (timeout !== undefined) window.clearTimeout(timeout);
  return result;
}

export function urlBase64ToUint8Array(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export function supportsWebPush(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

let serverVapidPublicKey: Promise<string | null> | null = null;

async function vapidPublicKey(companyId?: string): Promise<string | null> {
  const configured = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY?.trim();
  if (configured) return configured;
  if (!companyId) return null;

  if (!serverVapidPublicKey) {
    serverVapidPublicKey = invokeSubscriptionManager<{ public_key?: string }>({
      action: "public-key",
      company_id: companyId,
    }).then(({ public_key }) => {
      const value = public_key?.trim();
      return value && /^[A-Za-z0-9_-]{16,512}$/.test(value) ? value : null;
    }).catch(() => {
      serverVapidPublicKey = null;
      return null;
    });
  }

  return serverVapidPublicKey;
}

function serializeSubscription(subscription: PushSubscription): SerializedSubscription {
  const serialized = subscription.toJSON();
  if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys.auth) {
    throw new Error("O navegador não forneceu uma assinatura push válida.");
  }
  return {
    endpoint: serialized.endpoint,
    keys: {
      p256dh: serialized.keys.p256dh,
      auth: serialized.keys.auth,
    },
  };
}

export function pushDeviceLabel(userAgent: string): string {
  const device = /iPad/i.test(userAgent)
    ? "iPad"
    : /iPhone/i.test(userAgent)
      ? "iPhone"
      : /Android/i.test(userAgent)
        ? "Android"
        : /Windows/i.test(userAgent)
          ? "Windows"
          : /Macintosh|Mac OS/i.test(userAgent)
            ? "Mac"
            : "Dispositivo";
  const browser = /Edg\//i.test(userAgent)
    ? "Edge"
    : /Firefox\//i.test(userAgent)
      ? "Firefox"
      : /CriOS|Chrome\//i.test(userAgent)
        ? "Chrome"
        : /Safari\//i.test(userAgent)
          ? "Safari"
          : "Navegador";
  return `${device} · ${browser}`;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!supportsWebPush()) return null;
  const registration = await withTimeout(
    navigator.serviceWorker.getRegistration("/"),
    3_000,
    "O PWA demorou para localizar o serviço de notificações. Feche e abra o aplicativo e tente novamente.",
  );
  if (!registration) return null;
  return withTimeout(
    registration.pushManager.getSubscription(),
    3_000,
    "O aparelho demorou para consultar a assinatura push. Tente novamente.",
  );
}

async function invokeSubscriptionManager<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await withTimeout(
    supabase.functions.invoke("manage-push-subscription", { body }),
    PUSH_OPERATION_TIMEOUT_MS,
    "A conexão demorou para salvar o push. Confira a internet e tente novamente.",
  );
  if (error) throw new Error("Não foi possível salvar as notificações neste aparelho.");
  return data as T;
}

async function readyPushRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await withTimeout(
    navigator.serviceWorker.getRegistration("/"),
    3_000,
    "O PWA demorou para localizar o serviço de notificações. Feche e abra o aplicativo e tente novamente.",
  );
  if (existing?.active) return existing;

  return withTimeout(
    navigator.serviceWorker.ready,
    PUSH_OPERATION_TIMEOUT_MS,
    "O PWA ainda está terminando de iniciar. Feche e abra o aplicativo e tente ativar o push novamente.",
  );
}

async function persistSubscription(
  companyId: string,
  subscription: PushSubscription,
  deviceLabel?: string,
): Promise<void> {
  await invokeSubscriptionManager({
    action: "upsert",
    company_id: companyId,
    subscription: serializeSubscription(subscription),
    user_agent: navigator.userAgent.slice(0, 512),
    device_label: deviceLabel?.trim().slice(0, 100) || pushDeviceLabel(navigator.userAgent),
  });
}

export async function getPushPermissionState(companyId?: string): Promise<PushPermissionState> {
  if (!supportsWebPush()) return "unsupported";
  if (!await vapidPublicKey(companyId)) return "not-configured";
  if (Notification.permission === "denied") return "blocked";
  if (Notification.permission !== "granted") return "available";
  return (await currentSubscription()) ? "subscribed" : "available";
}

/** Único caminho que solicita permissão. Deve ser chamado por gesto do usuário. */
export async function enablePushNotifications(
  companyId: string,
  deviceLabel?: string,
): Promise<PushPermissionState> {
  if (!supportsWebPush()) return "unsupported";
  const publicKey = await vapidPublicKey(companyId);
  if (!publicKey) return "not-configured";

  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "blocked" : "available";

  const registration = await readyPushRegistration();
  let subscription = await withTimeout(
    registration.pushManager.getSubscription(),
    3_000,
    "O aparelho demorou para consultar a assinatura push. Tente novamente.",
  );
  if (!subscription) {
    try {
      subscription = await withTimeout(
        registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }),
        12_000,
        "O aparelho demorou para criar a assinatura push. Feche e abra o PWA e tente novamente.",
      );
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("O aparelho demorou")) throw error;
      throw new Error("O aparelho não conseguiu criar a assinatura push. Feche e abra o PWA e tente novamente.");
    }
  }

  await persistSubscription(companyId, subscription, deviceLabel);
  return "subscribed";
}

/** Repara vínculo/endpoint no boot sem abrir prompt de permissão. */
export async function reconcilePushSubscription(companyId: string): Promise<void> {
  if (!supportsWebPush() || !await vapidPublicKey(companyId) || Notification.permission !== "granted") return;
  const subscription = await currentSubscription();
  if (!subscription) return;
  await persistSubscription(companyId, subscription);
}

/**
 * Desvincula primeiro no servidor e sempre invalida o endpoint local. Mesmo se
 * a rede falhar, `unsubscribe()` evita vazamento quando outra conta usar este aparelho.
 */
export async function disablePushNotifications(companyId: string): Promise<void> {
  if (!supportsWebPush()) return;
  const subscription = await currentSubscription();
  if (!subscription) return;
  const { endpoint } = serializeSubscription(subscription);

  try {
    await invokeSubscriptionManager({ action: "deactivate", company_id: companyId, endpoint });
  } catch (error) {
    // Não bloqueia logout/desativação: invalidar o endpoint no provedor é a
    // proteção decisiva. O backend também o desativará ao receber 404/410.
    console.warn("[Push] não foi possível desativar o vínculo remoto", error);
  }
  await withTimeout(subscription.unsubscribe());
}

/**
 * Limpeza específica do logout. Começa backend e provedor em paralelo, mas o
 * Auth aguarda no máximo 2s. A tarefa continua após o teto; assim rede lenta
 * não prende a saída e o unsubscribe local ainda invalida o endpoint antigo.
 */
export async function detachPushForLogout(companyId: string): Promise<void> {
  if (!supportsWebPush()) return;

  const cleanup = (async () => {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    const { endpoint } = serializeSubscription(subscription);

    await Promise.allSettled([
      invokeSubscriptionManager({ action: "deactivate", company_id: companyId, endpoint }),
      subscription.unsubscribe(),
    ]);
  })().catch((error) => {
    console.warn("[Push] limpeza best-effort do logout falhou", error);
  });

  await waitForBestEffort(cleanup, PUSH_LOGOUT_TIMEOUT_MS);
}

export async function listPushDevices(companyId: string): Promise<PushDeviceSummary[]> {
  if (!companyId) return [];
  const subscription = supportsWebPush() ? await currentSubscription() : null;
  const response = await invokeSubscriptionManager<{ devices?: PushDeviceSummary[] }>({
    action: "list",
    company_id: companyId,
    current_endpoint: subscription?.endpoint ?? null,
  });
  return response.devices ?? [];
}

export async function deactivatePushDevice(companyId: string, subscriptionId: string): Promise<void> {
  await invokeSubscriptionManager({
    action: "deactivate",
    company_id: companyId,
    subscription_id: subscriptionId,
  });
}
