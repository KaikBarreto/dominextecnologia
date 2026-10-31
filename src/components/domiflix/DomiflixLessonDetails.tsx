import { Download, ExternalLink, FileText, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { DomiflixResource } from "@/hooks/useDomiflix";
import { DomiflixModuleBadge } from "@/components/domiflix/DomiflixModuleBadge";
import { DomiflixModuleOffer } from "@/components/domiflix/DomiflixModuleOffer";
import { getCompanyWhatsAppNumber } from "@/components/landing/whatsappNumbers";

export function DomiflixLessonDetails({
  moduleTitle,
  lessonTitle,
  description,
  resources,
  group,
  includedInPlan,
  moduleCode,
  moduleName,
  modulePrice,
  accountStage,
  userEmail,
  companyName,
  pathTitle,
}: {
  moduleTitle: string;
  lessonTitle: string;
  description: string | null;
  resources: DomiflixResource[];
  group: "core" | "plan";
  includedInPlan: boolean;
  moduleCode: string | null;
  moduleName: string | null;
  modulePrice: number | null;
  accountStage: "trial" | "paid" | "neutral";
  userEmail: string;
  companyName: string;
  pathTitle: string;
}) {
  const supportMessage = [
    "Olá, equipe de suporte! Preciso tirar uma dúvida sobre uma aula da DomiFlix.",
    "",
    `E-mail do usuário: ${userEmail || "não identificado"}`,
    `Empresa: ${companyName || "não identificada"}`,
    `Trilha: ${pathTitle}`,
    `Módulo: ${moduleTitle}`,
    `Aula: ${lessonTitle}`,
    "",
    "Minha dúvida: ",
  ].join("\n");
  const supportUrl = `https://wa.me/${getCompanyWhatsAppNumber()}?text=${encodeURIComponent(supportMessage)}`;

  async function openResource(resource: DomiflixResource) {
    if (resource.resource_type === "link" && resource.url) {
      window.open(resource.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (!resource.storage_path) return;
    const { data } = await supabase.storage.from("domiflix-learning-assets").createSignedUrl(resource.storage_path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="px-4 py-7 text-stone-100 sm:px-7 lg:px-8">
      <DomiflixModuleBadge group={group} includedInPlan={includedInPlan} className="mb-3" />
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-500">{moduleTitle}</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{lessonTitle}</h1>
      <p className="mt-4 max-w-3xl whitespace-pre-line text-sm leading-6 text-stone-400 sm:text-base">
        {description || "Esta aula ainda não possui uma descrição."}
      </p>

      {group === "plan" && !includedInPlan && moduleCode && (
        <DomiflixModuleOffer moduleCode={moduleCode} moduleName={moduleName || moduleTitle} modulePrice={modulePrice} accountStage={accountStage} />
      )}

      <a
        href={supportUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-5 inline-flex min-h-10 items-center gap-2 rounded border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white transition-colors hover:border-emerald-500/60 hover:bg-emerald-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
      >
        <MessageCircle className="h-4 w-4 text-emerald-400" aria-hidden />
        Tirar dúvidas com o suporte
      </a>

      <div className="mt-8 border-t border-white/10 pt-6">
        <h2 className="text-sm font-semibold">Materiais e extras</h2>
        {resources.length === 0 ? (
          <p className="mt-2 text-sm text-stone-600">Nenhum material adicional nesta aula.</p>
        ) : (
          <ul className="mt-3 divide-y divide-white/[0.07] border-y border-white/[0.07]">
            {resources.map((resource) => (
              <li key={resource.id}>
                <button onClick={() => void openResource(resource)} className="group flex w-full items-center gap-3 py-3 text-left">
                  <span className="flex h-8 w-8 items-center justify-center rounded bg-white/[0.06] text-red-400"><FileText className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-stone-200">{resource.title}</span>
                    {resource.description && <span className="mt-0.5 block truncate text-xs text-stone-600">{resource.description}</span>}
                  </span>
                  {resource.resource_type === "link" ? <ExternalLink className="h-4 w-4 text-stone-600 group-hover:text-stone-300" /> : <Download className="h-4 w-4 text-stone-600 group-hover:text-stone-300" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
