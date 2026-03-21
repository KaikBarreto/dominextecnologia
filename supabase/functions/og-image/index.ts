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
    let resolvedCompanyId = companyId;

    // If os_id provided, look up the company from the service order
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
        .select("white_label_enabled, white_label_logo_url, logo_url")
        .eq("company_id", resolvedCompanyId)
        .single();

      if (data?.white_label_enabled) {
        logoUrl = data.white_label_logo_url || data.logo_url || null;
      }
    } else {
      // Fallback: first company with white label enabled
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
      const defaultUrl = supabaseUrl.replace('.supabase.co', '.lovable.app') + '/favicon.png';
      return Response.redirect(defaultUrl, 302);
    }

    // Redirect to the actual logo image so crawlers get a real image file
    return Response.redirect(logoUrl, 302);
  } catch (error) {
    console.error("Error generating OG image:", error);
    return new Response("Error", { status: 500, headers: corsHeaders });
  }
});
