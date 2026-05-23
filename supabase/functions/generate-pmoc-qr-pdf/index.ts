// =============================================================================
// generate-pmoc-qr-pdf — Gera PDF A4 imprimível com QR Code do Portal PMOC.
// =============================================================================
// AUTENTICADA (Authorization obrigatório). Cross-tenant → 404 (oracle blindado
// mesmo autenticado — RLS rules §4 + Cenário 10).
//
// GET ?contract_id=<uuid>
//   1. Valida JWT → auth.uid().
//   2. Same-tenant via get_user_company_id(auth.uid()).
//   3. Contrato existe E é PMOC.
//   4. Lê dados do tenant + unidade + token + RT.
//   5. Renderiza PDF A4 com QR Code grande + dados regulatórios.
//   6. Retorna application/pdf, Cache-Control: private, no-store.
//
// Stack: qrcode (SVG do QR) + pdf-lib (compõe PDF). Leve, sem Puppeteer.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import QRCode from "https://esm.sh/qrcode@1.5.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const APP_DOMAIN = "https://dominex.app";
const PORTAL_PATH = "/pmoc/unidade"; // /pmoc/unidade/<token>
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function slugify(s: string | null | undefined): string {
  if (!s) return "unidade";
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "unidade";
}

// A4 portrait em pontos (1pt = 1/72in). 595.28 x 841.89.
const PAGE_W = 595.28;
const PAGE_H = 841.89;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }

    const url = new URL(req.url);
    const contractId = url.searchParams.get("contract_id");
    if (!contractId || !UUID_REGEX.test(contractId)) {
      return jsonResponse({ error: "invalid_contract_id" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Cliente com o JWT do usuário pra extrair auth.uid().
    const supabaseAuthed = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabaseAuthed.auth.getUser();
    if (userErr || !userData?.user?.id) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }
    const userId = userData.user.id;

    // Cliente service_role pra ler dados (RLS bypass + queries explícitas).
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Tenant do user.
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("user_id", userId)
      .maybeSingle();
    const userCompany = profileRow?.company_id ?? null;

    // Verifica se super_admin (bypass de tenant).
    const { data: rolesRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isSuperAdmin = (rolesRows ?? []).some((r) => r.role === "super_admin");

    // Contrato + token + dados pro PDF.
    const { data: contract } = await supabase
      .from("contracts")
      .select(
        [
          "id",
          "company_id",
          "name",
          "customer_id",
          "responsible_technician_id",
          "is_pmoc",
          "public_pmoc_token",
        ].join(","),
      )
      .eq("id", contractId)
      .maybeSingle();

    // Oracle blindado: contrato inexistente E cross-tenant retornam mesma resposta.
    if (!contract) {
      return jsonResponse({ error: "not_found" }, 404);
    }
    if (!isSuperAdmin && contract.company_id !== userCompany) {
      return jsonResponse({ error: "not_found" }, 404);
    }
    if (contract.is_pmoc !== true) {
      return jsonResponse({ error: "not_a_pmoc_contract" }, 400);
    }
    if (!contract.public_pmoc_token) {
      // Defensivo: trigger ensure_pmoc_token deveria ter preenchido.
      return jsonResponse({ error: "token_missing" }, 500);
    }

    const [{ data: customer }, { data: companySettings }, { data: rt }] = await Promise.all([
      supabase
        .from("customers")
        .select("name, address, city, state")
        .eq("id", contract.customer_id)
        .maybeSingle(),
      supabase
        .from("company_settings")
        .select("name, logo_url, white_label_enabled, white_label_logo_url")
        .eq("company_id", contract.company_id)
        .maybeSingle(),
      contract.responsible_technician_id
        ? supabase
            .from("responsible_technicians")
            .select("full_name, cft_crea, modality")
            .eq("id", contract.responsible_technician_id)
            .maybeSingle()
        : Promise.resolve({ data: null } as { data: null }),
    ]);

    let tenantName = (companySettings?.name ?? "").trim();
    if (!tenantName) {
      const { data: companyRow } = await supabase
        .from("companies")
        .select("name")
        .eq("id", contract.company_id)
        .maybeSingle();
      tenantName = (companyRow?.name ?? "").trim() || "Empresa";
    }

    const useWhiteLabel = companySettings?.white_label_enabled === true;
    const logoUrl = useWhiteLabel
      ? companySettings?.white_label_logo_url ?? companySettings?.logo_url ?? null
      : companySettings?.logo_url ?? null;

    const portalUrl = `${APP_DOMAIN}${PORTAL_PATH}/${contract.public_pmoc_token}`;

    // -------------------------------------------------------------------------
    // QR Code → PNG buffer (mais robusto que SVG em pdf-lib).
    // -------------------------------------------------------------------------
    const qrPngDataUrl = await QRCode.toDataURL(portalUrl, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 800,
      color: { dark: "#000000", light: "#FFFFFF" },
    });
    const qrPngBytes = Uint8Array.from(
      atob(qrPngDataUrl.replace(/^data:image\/png;base64,/, "")),
      (c) => c.charCodeAt(0),
    );

    // -------------------------------------------------------------------------
    // PDF A4
    // -------------------------------------------------------------------------
    const pdf = await PDFDocument.create();
    pdf.setTitle(`PMOC — ${customer?.name ?? "Unidade"}`);
    pdf.setSubject("Plano de Manutenção, Operação e Controle — Lei 13.589/2018");
    pdf.setProducer("Dominex");

    const page = pdf.addPage([PAGE_W, PAGE_H]);
    const helv = await pdf.embedFont(StandardFonts.Helvetica);
    const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    const black = rgb(0, 0, 0);
    const gray = rgb(0.4, 0.4, 0.4);
    const margin = 50;
    let cursorY = PAGE_H - margin;

    // -- Cabeçalho: logo + nome do tenant
    let logoEmbedded = null as null | { width: number; height: number; image: unknown };
    if (logoUrl) {
      try {
        const res = await fetch(logoUrl);
        if (res.ok) {
          const buf = new Uint8Array(await res.arrayBuffer());
          const ct = res.headers.get("content-type") ?? "";
          let img;
          if (ct.includes("png")) img = await pdf.embedPng(buf);
          else if (ct.includes("jpeg") || ct.includes("jpg")) img = await pdf.embedJpg(buf);
          if (img) {
            const maxLogoH = 50;
            const ratio = maxLogoH / img.height;
            logoEmbedded = {
              width: img.width * ratio,
              height: maxLogoH,
              image: img,
            };
          }
        }
      } catch (e) {
        console.warn("[generate-pmoc-qr-pdf] logo fetch failed", (e as Error)?.message);
      }
    }

    if (logoEmbedded) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      page.drawImage(logoEmbedded.image as any, {
        x: margin,
        y: cursorY - logoEmbedded.height,
        width: logoEmbedded.width,
        height: logoEmbedded.height,
      });
    }

    page.drawText(tenantName, {
      x: logoEmbedded ? margin + logoEmbedded.width + 16 : margin,
      y: cursorY - 30,
      size: 16,
      font: helvBold,
      color: black,
    });

    cursorY -= 90;

    // -- Título central
    const title = "PMOC — Plano de Manutenção, Operação e Controle";
    const titleWidth = helvBold.widthOfTextAtSize(title, 18);
    page.drawText(title, {
      x: (PAGE_W - titleWidth) / 2,
      y: cursorY,
      size: 18,
      font: helvBold,
      color: black,
    });
    cursorY -= 36;

    // -- Subtítulo: nome da unidade
    const unitName = customer?.name ?? "Unidade";
    const unitWidth = helvBold.widthOfTextAtSize(unitName, 14);
    page.drawText(unitName, {
      x: (PAGE_W - unitWidth) / 2,
      y: cursorY,
      size: 14,
      font: helvBold,
      color: black,
    });
    cursorY -= 22;

    // -- Endereço
    const addressParts = [
      customer?.address,
      [customer?.city, customer?.state].filter(Boolean).join("/"),
    ].filter(Boolean) as string[];
    const addressLine = addressParts.join(" — ");
    if (addressLine) {
      const aw = helv.widthOfTextAtSize(addressLine, 11);
      page.drawText(addressLine, {
        x: (PAGE_W - aw) / 2,
        y: cursorY,
        size: 11,
        font: helv,
        color: gray,
      });
      cursorY -= 18;
    }

    cursorY -= 16;

    // -- QR Code central (≥6cm = ~170pt)
    const qrSize = 220;
    const qrImage = await pdf.embedPng(qrPngBytes);
    page.drawImage(qrImage, {
      x: (PAGE_W - qrSize) / 2,
      y: cursorY - qrSize,
      width: qrSize,
      height: qrSize,
    });
    cursorY -= qrSize + 18;

    // -- Texto sob QR
    const scanText = "Escaneie para acompanhar o PMOC desta unidade";
    const sw = helv.widthOfTextAtSize(scanText, 12);
    page.drawText(scanText, {
      x: (PAGE_W - sw) / 2,
      y: cursorY,
      size: 12,
      font: helv,
      color: black,
    });
    cursorY -= 18;

    // -- URL legível (pra quem prefere digitar)
    const portalUrlText = portalUrl;
    const uw = helv.widthOfTextAtSize(portalUrlText, 10);
    page.drawText(portalUrlText, {
      x: (PAGE_W - uw) / 2,
      y: cursorY,
      size: 10,
      font: helv,
      color: gray,
    });
    cursorY -= 30;

    // -- RT (se houver)
    if (rt) {
      const rtParts: string[] = [];
      if (rt.full_name) rtParts.push(`Responsável Técnico: ${rt.full_name}`);
      if (rt.cft_crea) rtParts.push(rt.cft_crea);
      if (rt.modality) rtParts.push(rt.modality);
      const rtLine = rtParts.join("  •  ");
      if (rtLine) {
        const rw = helv.widthOfTextAtSize(rtLine, 11);
        page.drawText(rtLine, {
          x: (PAGE_W - rw) / 2,
          y: cursorY,
          size: 11,
          font: helv,
          color: black,
        });
        cursorY -= 18;
      }
    }

    // -- Rodapé: selo regulatório
    const sealText = "Conforme Lei Federal 13.589/2018";
    const sealW = helvBold.widthOfTextAtSize(sealText, 11);
    page.drawText(sealText, {
      x: (PAGE_W - sealW) / 2,
      y: margin,
      size: 11,
      font: helvBold,
      color: black,
    });

    const pdfBytes = await pdf.save();
    const filename = `pmoc-qr-${slugify(customer?.name ?? null)}.pdf`;

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[generate-pmoc-qr-pdf] unexpected error", {
      message: (err as Error)?.message ?? String(err),
    });
    return jsonResponse({ error: "render_failed" }, 500);
  }
});
