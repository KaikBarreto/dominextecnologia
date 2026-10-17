// deno-lint-ignore-file no-import-prefix
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  canonicalJson,
  isIpAllowed,
  isIsoWithOffset,
  isValidIpOrCidr,
  parseApiKey,
  publicApiPath,
  randomApiSecret,
  randomPublicId,
  sha256Hex,
} from "./public-api.ts";

Deno.test("gera chave no formato publico com 256 bits de segredo", async () => {
  const publicId = randomPublicId();
  const secret = randomApiSecret();
  assertEquals(publicId.length, 16);
  assertEquals(secret.length, 43);
  assertEquals(parseApiKey(`Bearer dmx_live_${publicId}.${secret}`), {
    publicId,
    secret,
  });
  assertEquals((await sha256Hex(secret)).length, 64);
});

Deno.test("recusa formatos ambiguos ou incompletos de Authorization", () => {
  assertEquals(parseApiKey(null), null);
  assertEquals(parseApiKey("Basic abc"), null);
  assertEquals(parseApiKey("Bearer dmx_live_short.secret"), null);
  assertEquals(
    parseApiKey(
      "Bearer dmx_live_aaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.extra",
    ),
    null,
  );
});

Deno.test("normaliza caminho do dominio e da URL interna da edge", () => {
  assertEquals(publicApiPath("/v1/capabilities"), "/v1/capabilities");
  assertEquals(
    publicApiPath("/functions/v1/public-api-v1/v1/service-orders/abc"),
    "/v1/service-orders/abc",
  );
  assertEquals(
    publicApiPath("/functions/v1/public-api-v1/availability"),
    "/v1/availability",
  );
});

Deno.test("canonicalJson independe da ordem das chaves e preserva arrays", () => {
  assertEquals(
    canonicalJson({ z: 1, a: { d: 2, c: [3, 4] } }),
    canonicalJson({ a: { c: [3, 4], d: 2 }, z: 1 }),
  );
});

Deno.test("allowlist aceita IPv4, IPv6 e CIDR e falha fechado em entrada invalida", () => {
  assert(isValidIpOrCidr("192.0.2.0/24"));
  assert(isValidIpOrCidr("2001:db8::/32"));
  assert(!isValidIpOrCidr("192.0.2.0/33"));
  assert(isIpAllowed("192.0.2.10", ["192.0.2.0/24"]));
  assert(!isIpAllowed("192.0.3.10", ["192.0.2.0/24"]));
  assert(isIpAllowed("2001:db8::42", ["2001:db8::/32"]));
  assert(!isIpAllowed("unknown", ["0.0.0.0/0"]));
  assert(isIpAllowed("203.0.113.1", []));
});

Deno.test("datas publicas exigem offset explicito", () => {
  assert(isIsoWithOffset("2026-10-21T09:30:00-03:00"));
  assert(isIsoWithOffset("2026-10-21T12:30:00Z"));
  assert(!isIsoWithOffset("2026-10-21T09:30:00"));
  assert(!isIsoWithOffset("21/10/2026 09:30"));
});
