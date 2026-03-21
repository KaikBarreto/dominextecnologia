import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

    if (!logoUrl) {
      // Generate a simple white SVG with company name as fallback
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
        <rect width="1200" height="630" fill="white"/>
        <text x="600" y="315" text-anchor="middle" dominant-baseline="central" font-family="Arial, sans-serif" font-size="48" fill="#1e293b">${companyName || "Ordem de Serviço"}</text>
      </svg>`;
      return new Response(svg, {
        headers: { ...corsHeaders, "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" },
      });
    }

    // Fetch the logo and generate an OG image with logo centered on white background
    try {
      const logoResponse = await fetch(logoUrl);
      if (!logoResponse.ok) throw new Error("Failed to fetch logo");
      const logoBase64 = btoa(String.fromCharCode(...new Uint8Array(await logoResponse.arrayBuffer())));
      const logoMime = logoResponse.headers.get("content-type") || "image/png";

      // Generate an SVG with the logo centered on white background
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630">
        <rect width="1200" height="630" fill="white"/>
        <image x="300" y="115" width="600" height="400" preserveAspectRatio="xMidYMid meet" href="data:${logoMime};base64,${logoBase64}"/>
      </svg>`;

      return new Response(svg, {
        headers: {
          ...corsHeaders,
          "Content-Type": "image/svg+xml",
          "Cache-Control": "public, max-age=3600",
        },
      });
    } catch {
      // If logo fetch fails, redirect to the logo URL directly
      return Response.redirect(logoUrl, 302);
    }
  } catch (error) {
    console.error("Error generating OG image:", error);
    return new Response("Error", { status: 500, headers: corsHeaders });
  }
});
