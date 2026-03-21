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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get company settings
    let logoUrl: string | null = null;

    if (companyId) {
      const { data } = await supabase
        .from("company_settings")
        .select("white_label_enabled, white_label_logo_url, logo_url")
        .eq("company_id", companyId)
        .single();

      if (data?.white_label_enabled) {
        logoUrl = data.white_label_logo_url || data.logo_url || null;
      }
    } else {
      // Try first company settings with white label
      const { data } = await supabase
        .from("company_settings")
        .select("white_label_enabled, white_label_logo_url, logo_url")
        .eq("white_label_enabled", true)
        .limit(1)
        .single();

      if (data) {
        logoUrl = data.white_label_logo_url || data.logo_url || null;
      }
    }

    if (!logoUrl) {
      // Return default favicon
      return Response.redirect(`${supabaseUrl.replace('.supabase.co', '.lovable.app')}/favicon.png`, 302);
    }

    // Generate an SVG with the logo centered on white background (square 1200x1200)
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
        <rect width="1200" height="1200" fill="white"/>
        <image href="${escapeXml(logoUrl)}" x="200" y="200" width="800" height="800" preserveAspectRatio="xMidYMid meet"/>
      </svg>
    `;

    return new Response(svg, {
      headers: {
        ...corsHeaders,
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error generating OG image:", error);
    return new Response("Error", { status: 500, headers: corsHeaders });
  }
});

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
