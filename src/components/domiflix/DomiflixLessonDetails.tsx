import { Download, ExternalLink, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { DomiflixResource } from "@/hooks/useDomiflix";
import { DomiflixModuleBadge } from "@/components/domiflix/DomiflixModuleBadge";
import { DomiflixModuleOffer } from "@/components/domiflix/DomiflixModuleOffer";
import { getCompanyWhatsAppNumber } from "@/components/landing/whatsappNumbers";

const WhatsAppLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
);

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
        className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-sm bg-[#25D366] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#1EBE5D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366] focus-visible:ring-offset-2 focus-visible:ring-offset-[#141414]"
      >
        <WhatsAppLogo className="h-4 w-4 text-white" />
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
