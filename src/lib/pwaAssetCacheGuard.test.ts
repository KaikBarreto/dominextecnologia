import { describe, expect, it } from "vitest";
import { buildAssetCacheGuard } from "./pwaAssetCacheGuard";

const response = (contentType: string, status = 200) =>
  new Response("x", { status, headers: { "content-type": contentType } });

describe("buildAssetCacheGuard (cache de chunks do PWA)", () => {
  const guard = buildAssetCacheGuard;

  it("não guarda a página HTML que o host devolve no lugar de um chunk que saiu do ar", async () => {
    // Cloudflare Pages responde 200 text/html para /assets/<chunk antigo>.js.
    // Guardar isso por 30 dias prendia o cliente na tela de recuperação.
    const html = response("text/html; charset=utf-8");
    expect(await guard.cacheWillUpdate({ response: html })).toBeNull();
  });

  it("guarda normalmente JS, CSS e imagem com status 200", async () => {
    for (const type of ["application/javascript", "text/css; charset=utf-8", "image/png"]) {
      const ok = response(type);
      expect(await guard.cacheWillUpdate({ response: ok })).toBe(ok);
    }
  });

  it("não guarda resposta de erro", async () => {
    expect(await guard.cacheWillUpdate({ response: response("application/javascript", 404) })).toBeNull();
  });

  it("ignora entrada HTML já guardada por versões anteriores e volta à rede", async () => {
    const poisoned = response("text/html; charset=utf-8");
    expect(await guard.cachedResponseWillBeUsed({ cachedResponse: poisoned })).toBeNull();

    const healthy = response("application/javascript");
    expect(await guard.cachedResponseWillBeUsed({ cachedResponse: healthy })).toBe(healthy);
    expect(await guard.cachedResponseWillBeUsed({ cachedResponse: undefined })).toBeNull();
  });

  it("é autossuficiente: o Workbox serializa cada função sozinha para dentro do sw.js", () => {
    for (const fn of [guard.cacheWillUpdate, guard.cachedResponseWillBeUsed]) {
      const rebuilt = new Function(`return (${fn.toString()})`)();
      expect(typeof rebuilt).toBe("function");
    }
  });
});
