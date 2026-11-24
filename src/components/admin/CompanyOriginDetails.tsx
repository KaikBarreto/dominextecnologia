import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Info, Loader2, RefreshCw, Route } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  type AcquisitionTouch,
  sanitizeAcquisitionAttribution,
} from "@/lib/acquisitionAttributionSchema";

const date = (value?: string) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : "Não registrado";
const evidence: Record<string, string> = {
  utm: "Parâmetros UTM do link",
  click_id: "Plataforma inferida pelo identificador de clique",
  referrer: "Origem inferida pelo site de referência",
  direct: "Sem sinal de origem disponível",
  referral_link: "Parâmetros de indicação no link",
};
const labels: Record<string, string> = {
  source: "Fonte",
  medium: "Meio",
  campaign: "Campanha",
  term: "Termo",
  content: "Conteúdo / criativo",
  utm_id: "ID da campanha",
  utm_source_platform: "Plataforma da origem",
  utm_creative_format: "Formato do criativo",
  utm_marketing_tactic: "Tática de marketing",
  campaign_id: "ID da campanha",
  adset_id: "ID do conjunto de anúncios",
  adgroup_id: "ID do grupo de anúncios",
  ad_id: "ID do anúncio",
  creative_id: "ID do criativo",
  placement: "Posicionamento",
  network: "Rede",
  device: "Dispositivo indicado pelo anúncio",
  matchtype: "Tipo de correspondência",
  keyword: "Palavra-chave",
  origem: "Origem no link",
  vendedor: "Código do vendedor no link",
  afiliado: "Código do afiliado no link",
  ref: "Código de indicação",
  gclid: "Google Ads · GCLID",
  dclid: "Google · DCLID",
  gbraid: "Google · GBRAID",
  wbraid: "Google · WBRAID",
  fbclid: "Meta · FBCLID",
  msclkid: "Microsoft Ads · MSCLKID",
  ttclid: "TikTok · TTCLID",
  li_fat_id: "LinkedIn · LI_FAT_ID",
  twclid: "X · TWCLID",
  sccid: "Snapchat · SCCID",
  yclid: "Yandex · YCLID",
  epik: "Pinterest · EPIK",
};
const friendly = (value: string) =>
  value === "direct"
    ? "Direto / não identificado"
    : value === "none"
    ? "Não informado"
    : value;
function Rows({ rows }: { rows: [string, string | undefined][] }) {
  return (
    <dl className="divide-y">
      {rows.filter(([, v]) => !!v).map(([key, value]) => (
        <div
          key={key}
          className="grid gap-1 py-3 sm:grid-cols-[190px_minmax(0,1fr)] sm:gap-5"
        >
          <dt className="text-xs text-muted-foreground">
            {labels[key] || key}
          </dt>
          <dd className="min-w-0 whitespace-pre-wrap break-all text-sm font-medium">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
function TouchDetails({ touch }: { touch: AcquisitionTouch }) {
  const campaigns = [
    "campaign",
    "term",
    "content",
    "utm_id",
    "utm_source_platform",
    "utm_creative_format",
    "utm_marketing_tactic",
  ] as const;
  const campaignRows: [string, string | undefined][] = campaigns.map(
    (k) => [k, touch[k]],
  );
  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-sm font-semibold">Visita identificada</h3>
        <Rows
          rows={[
            ["Fonte", friendly(touch.source)],
            ["Meio", friendly(touch.medium)],
            [
              "Identificada por",
              evidence[touch.evidence || ""] ||
              "Registro histórico; método não informado",
            ],
            ["Data e hora (Brasília)", date(touch.captured_at)],
            ["Página de entrada", touch.page_path],
            ["Site de referência", touch.referrer_host],
            ["Idioma da página", touch.locale],
          ]}
        />
      </section>
      <section>
        <h3 className="text-sm font-semibold">UTMs da campanha</h3>
        {campaignRows.some(([, v]) => v)
          ? <Rows rows={campaignRows} />
          : (
            <p className="mt-2 text-sm text-muted-foreground">
              Nenhum detalhe de campanha registrado neste contato.
            </p>
          )}
      </section>
      <section>
        <h3 className="text-sm font-semibold">Identificadores de clique</h3>
        {Object.keys(touch.click_ids || {}).length
          ? <Rows rows={Object.entries(touch.click_ids!)} />
          : (
            <p className="mt-2 text-sm text-muted-foreground">
              Nenhum identificador de clique registrado.
            </p>
          )}
      </section>
      {Object.keys(touch.parameters || {}).length > 0 && (
        <section>
          <h3 className="text-sm font-semibold">
            Parâmetros do anúncio e da indicação
          </h3>
          <Rows rows={Object.entries(touch.parameters!)} />
        </section>
      )}
    </div>
  );
}
export function CompanyOriginDetails(
  { companyId, origin }: { companyId: string; origin?: string | null },
) {
  const [open, setOpen] = useState(false),
    [copied, setCopied] = useState(false),
    [copyError, setCopyError] = useState(false);
  const query = useQuery({
    queryKey: ["company-acquisition-attribution", companyId],
    enabled: open && !!companyId,
    staleTime: 60_000,
    retry: 1,
    queryFn: async () => {
      // Optional additive column; normalize historical and current shapes at this boundary.
      const { data, error } = await (supabase as any).from("companies").select(
        "acquisition_attribution",
      ).eq("id", companyId).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Empresa indisponível para este acesso.");
      return sanitizeAcquisitionAttribution(data.acquisition_attribution);
    },
  });
  const attribution = query.data;
  const tabClass =
    "rounded-none border-b-2 border-transparent bg-transparent px-0 pb-3 pt-2 text-sm shadow-none data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none";
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-11 w-11 shrink-0 sm:h-7 sm:w-7"
        aria-label="Ver detalhes da origem"
        title="Ver detalhes da origem"
        onClick={() => {
          setOpen(true);
          setCopied(false);
          setCopyError(false);
        }}
      >
        <Info className="h-4 w-4" />
      </Button>
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title="Origem da empresa"
        description="Sinais de aquisição registrados no cadastro."
        className="sm:max-w-2xl"
        mobileFullHeight
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            <p role="status" className="text-xs text-muted-foreground">
              {copyError
                ? "Não foi possível copiar."
                : copied
                ? "Detalhes copiados."
                : ""}
            </p>
            <Button
              variant="outline"
              disabled={!attribution}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    JSON.stringify(
                      { origem_comercial: origin, ...attribution },
                      null,
                      2,
                    ),
                  );
                  setCopied(true);
                  setCopyError(false);
                } catch {
                  setCopyError(true);
                }
              }}
            >
              <Copy className="mr-2 h-4 w-4" />Copiar detalhes
            </Button>
          </div>
        }
      >
        {query.isLoading
          ? (
            <div role="status" className="flex items-center gap-2 py-8 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />Carregando origem…
            </div>
          )
          : query.isError
          ? (
            <div role="alert" className="space-y-3 py-5">
              <p className="font-medium">Não foi possível carregar a origem.</p>
              <Button variant="outline" onClick={() => query.refetch()}>
                <RefreshCw className="mr-2 h-4 w-4" />Tentar novamente
              </Button>
            </div>
          )
          : !attribution
          ? (
            <div className="space-y-4 py-4">
              <Route className="h-6 w-6" />
              <div>
                <h3 className="font-semibold">
                  Sem rastreamento detalhado registrado
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  A origem comercial é{" "}
                  {origin || "não informada"}. Este cadastro não tem UTMs ou
                  contatos de aquisição salvos. Não é possível reconstruir com
                  precisão a campanha apenas pelo rótulo da origem.
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                Novos cadastros registram os sinais disponíveis no navegador.
                Links sem parâmetros, bloqueadores ou troca de dispositivo podem
                limitar essas informações.
              </p>
            </div>
          )
          : (
            <Tabs defaultValue="summary" className="space-y-4">
              <TabsList className="h-auto w-full justify-start gap-5 rounded-none border-b bg-transparent p-0">
                <TabsTrigger value="summary" className={tabClass}>
                  Resumo
                </TabsTrigger>
                <TabsTrigger value="first" className={tabClass}>
                  Primeiro contato
                </TabsTrigger>
                <TabsTrigger value="last" className={tabClass}>
                  Último contato
                </TabsTrigger>
              </TabsList>
              <TabsContent value="summary" className="space-y-5 outline-none">
                <Rows
                  rows={[
                    ["Origem comercial", origin || "Não informada"],
                    [
                      "Primeira fonte identificada",
                      friendly(attribution.first_touch.source),
                    ],
                    [
                      "Primeiro contato (Brasília)",
                      date(attribution.first_touch.captured_at),
                    ],
                    [
                      "Última fonte identificada",
                      friendly(attribution.last_touch.source),
                    ],
                    [
                      "Último contato (Brasília)",
                      date(attribution.last_touch.captured_at),
                    ],
                    [
                      "Campanha mais recente",
                      attribution.last_touch.campaign || "Não informada",
                    ],
                    [
                      "Página de entrada inicial",
                      attribution.first_touch.page_path,
                    ],
                  ]}
                />
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Primeiro contato é a entrada inicial registrada; último
                  contato é o sinal de aquisição mais recente antes do cadastro.
                  Na captura atual, navegação interna não cria novos contatos. A janela atual de
                  captura é de 30 dias no mesmo navegador.
                </p>
              </TabsContent>
              <TabsContent value="first" className="outline-none">
                <TouchDetails touch={attribution.first_touch} />
              </TabsContent>
              <TabsContent value="last" className="outline-none">
                <TouchDetails touch={attribution.last_touch} />
              </TabsContent>
              <p className="border-t pt-4 text-xs leading-relaxed text-muted-foreground">
                Parâmetros do link e site de referência são sinais, não
                comprovação da origem. Um ID de clique não revela sozinho o nome
                do anúncio nem comprova mídia paga. Dados não enviados pelo
                canal aparecem como não registrados.
              </p>
            </Tabs>
          )}
      </ResponsiveDialog>
    </>
  );
}
