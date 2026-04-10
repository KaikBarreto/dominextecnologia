import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const osId = url.searchParams.get("os_id");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const APP_DOMAIN = "https://dominex.app";

    if (!osId) {
      return Response.redirect(APP_DOMAIN, 302);
    }

    const { data: serviceOrder } = await supabase
      .from("service_orders")
      .select(`id, order_number, company_id, snapshot_data, customer:customers(name)`)
      .eq("id", osId)
      .single();

    const { data: company } = await supabase
      .from("company_settings")
      .select("name, white_label_enabled, white_label_logo_url, logo_url")
      .eq("company_id", serviceOrder?.company_id || "")
      .maybeSingle();

    const companyName = company?.name || "Ordem de Serviço";
    const customerName = (serviceOrder?.customer as { name?: string } | null)?.name
      || (serviceOrder?.snapshot_data as any)?.customer?.name;
    const title = `${companyName} — Ordem de Serviço`;
    const description = customerName
      ? `Acompanhe a OS #${serviceOrder?.order_number ?? ""} de ${customerName}`
      : `Acompanhe a ordem de serviço de ${companyName}`;

    // Use company logo for OG image
    const logoUrl = company?.white_label_logo_url || company?.logo_url || null;
    const imageUrl = logoUrl
      ? `${supabaseUrl}/functions/v1/og-image?os_id=${encodeURIComponent(osId)}`
      : "";

    const finalTarget = `${APP_DOMAIN}/os-tecnico/${osId}?modo=cliente`;

    const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="${escapeHtml(description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    ${imageUrl ? `<meta property="og:image" content="${escapeHtml(imageUrl)}" />` : ""}
    <meta property="og:url" content="${escapeHtml(finalTarget)}" />
    <meta property="og:locale" content="pt_BR" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    ${imageUrl ? `<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />` : ""}
    <meta http-equiv="refresh" content="0;url=${escapeHtml(finalTarget)}" />
    <link rel="canonical" href="${escapeHtml(finalTarget)}" />
  </head>
  <body>
    <script>window.location.replace(${JSON.stringify(finalTarget)});</script>
    <p>Redirecionando para a ordem de serviço... <a href="${escapeHtml(finalTarget)}">Abrir</a></p>
  </body>
</html>`;

    return new Response(html, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    });
  } catch (error) {
    console.error("Error serving OS share page:", error);
    return new Response("Erro ao gerar compartilhamento", {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }
});
