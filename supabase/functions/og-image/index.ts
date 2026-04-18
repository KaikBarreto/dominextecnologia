import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/,
  /^fd[0-9a-f]{2}:/i,
  /^localhost$/i,
  /^metadata\.google\.internal$/i,
];

function isSafeLogoUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:') return false;
    const hostname = url.hostname;
    return !PRIVATE_IP_PATTERNS.some(pattern => pattern.test(hostname));
  } catch {
    return false;
  }
}

function fallbackSvg(companyName: string): Response {
  const safe = companyName
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <rect width="1200" height="630" fill="white"/>
    <text x="600" y="315" text-anchor="middle" dominant-baseline="central" font-family="Arial, sans-serif" font-size="48" fill="#1e293b">${safe || "Ordem de Serviço"}</text>
  </svg>`;
  return new Response(svg, {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" },
  });
}

Deno.serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  try {
    const url = new URL(req.url);
    const companyId = url.searchParams.get("company_id");
    const osId = url.searchParams.get("os_id");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let logoUrl: string | null = null;
    let companyName = "";
    let resolvedCompanyId = companyId;

    if (osId && !resolvedCompanyId) {
      const { data: os } = await supabase
        .from("service_orders")
        .select("company_id")
        .eq("id", osId)
        .single();
      if (os?.company_id) {
        resolvedCompanyId = os.company_id;
      }
    }

    if (resolvedCompanyId) {
      const { data } = await supabase
        .from("company_settings")
        .select("name, white_label_enabled, white_label_logo_url, logo_url")
        .eq("company_id", resolvedCompanyId)
        .single();

      if (data) {
        logoUrl = data.white_label_logo_url || data.logo_url || null;
        companyName = data.name || "";
      }
    }

    if (!logoUrl || !isSafeLogoUrl(logoUrl)) {
      return fallbackSvg(companyName);
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const logoResponse = await fetch(logoUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (!logoResponse.ok) return fallbackSvg(companyName);

      const logoBase64 = btoa(String.fromCharCode(...new Uint8Array(await logoResponse.arrayBuffer())));
      const logoMime = logoResponse.headers.get("content-type") || "image/png";
      const safeMime = /^image\/(png|jpeg|jpg|svg\+xml|webp|gif)$/.test(logoMime) ? logoMime : "image/png";

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630">
        <rect width="1200" height="630" fill="white"/>
        <image x="300" y="115" width="600" height="400" preserveAspectRatio="xMidYMid meet" href="data:${safeMime};base64,${logoBase64}"/>
      </svg>`;

      return new Response(svg, {
        headers: {
          ...getCorsHeaders(req),
          "Content-Type": "image/svg+xml",
          "Cache-Control": "public, max-age=3600",
        },
      });
    } catch {
      return fallbackSvg(companyName);
    }
  } catch (error) {
    console.error("Error generating OG image:", error);
    return fallbackSvg("");
  }
});
