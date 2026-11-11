import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

import {
  PUSH_LOGOUT_TIMEOUT_MS,
  pushDeviceLabel,
  supportsWebPush,
  urlBase64ToUint8Array,
  waitForBestEffort,
} from "@/lib/pushNotifications";

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
