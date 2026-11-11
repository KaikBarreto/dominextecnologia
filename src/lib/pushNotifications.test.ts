import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

import {
  PUSH_LOGOUT_TIMEOUT_MS,
  enablePushNotifications,
  pushDeviceLabel,
  supportsWebPush,
  urlBase64ToUint8Array,
  waitForBestEffort,
} from "@/lib/pushNotifications";
import { supabase } from "@/integrations/supabase/client";

describe("urlBase64ToUint8Array", () => {
  it("converte base64url sem padding", () => {
    expect([...urlBase64ToUint8Array("AQIDBA")]).toEqual([1, 2, 3, 4]);
  });
});

describe("pushDeviceLabel", () => {
  it("gera um nome curto sem enviar o user agent completo para a UI", () => {
    expect(pushDeviceLabel("Mozilla/5.0 (iPhone) AppleWebKit/605.1 Version/18.0 Mobile Safari/604.1"))
      .toBe("iPhone · Safari");
    expect(pushDeviceLabel("Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/130.0 Mobile"))
      .toBe("Android · Chrome");
  });

  it("reconhece iPhone em modo PWA mesmo quando o Safari informa Macintosh", () => {
    const macSafari = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15";

    expect(pushDeviceLabel(macSafari, {
      platform: "MacIntel",
      maxTouchPoints: 5,
      screenWidth: 390,
      screenHeight: 844,
      standalone: true,
    })).toBe("iPhone · PWA");
  });

  it("não confunde Mac real com aparelho iOS", () => {
    const macSafari = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15";

    expect(pushDeviceLabel(macSafari, {
      platform: "MacIntel",
      maxTouchPoints: 0,
      screenWidth: 1440,
      screenHeight: 900,
      standalone: false,
    })).toBe("Mac · Safari");
  });
});

describe("supportsWebPush", () => {
  it("falha fechado quando PushManager não existe", () => {
    const original = Object.getOwnPropertyDescriptor(window, "PushManager");
    Object.defineProperty(window, "PushManager", { configurable: true, value: undefined });
    expect(supportsWebPush()).toBe(false);
    if (original) Object.defineProperty(window, "PushManager", original);
    else Reflect.deleteProperty(window, "PushManager");
  });
});

describe("waitForBestEffort", () => {
  it("libera o logout no teto mesmo se a limpeza continuar pendente", async () => {
    vi.useFakeTimers();
    const never = new Promise<void>(() => {});
    const result = waitForBestEffort(never, PUSH_LOGOUT_TIMEOUT_MS);

    await vi.advanceTimersByTimeAsync(PUSH_LOGOUT_TIMEOUT_MS);
    await expect(result).resolves.toBe("timeout");
    vi.useRealTimers();
  });

  it("encerra antes do teto quando a limpeza termina", async () => {
    await expect(waitForBestEffort(Promise.resolve(), PUSH_LOGOUT_TIMEOUT_MS))
      .resolves.toBe("completed");
  });
});

describe("enablePushNotifications", () => {
  it("usa o service worker já ativo sem ficar preso em serviceWorker.ready", async () => {
    const subscription = {
      endpoint: "https://web.push.apple.com/example",
      toJSON: () => ({
        endpoint: "https://web.push.apple.com/example",
        keys: { p256dh: "p".repeat(32), auth: "a".repeat(24) },
      }),
    } as unknown as PushSubscription;
    const subscribe = vi.fn().mockResolvedValue(subscription);
    const registration = {
      active: {},
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(null),
        subscribe,
      },
    } as unknown as ServiceWorkerRegistration;
    const getRegistration = vi.fn().mockResolvedValue(registration);

    Object.defineProperty(window, "PushManager", { configurable: true, value: class {} });
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: { permission: "granted", requestPermission: vi.fn() },
    });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        getRegistration,
        ready: new Promise<ServiceWorkerRegistration>(() => {}),
      },
    });
    vi.mocked(supabase.functions.invoke)
      .mockResolvedValueOnce({ data: { public_key: "A".repeat(65) }, error: null } as never)
      .mockResolvedValueOnce({ data: { subscription: { id: "sub-1" } }, error: null } as never);

    await expect(enablePushNotifications("company-1")).resolves.toBe("subscribed");
    expect(getRegistration).toHaveBeenCalledWith("/");
    expect(subscribe).toHaveBeenCalledOnce();
  });
});
