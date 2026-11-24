import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { assertRowsAffected } from "@/lib/supabaseMutation";
import { toast } from "sonner";

export interface DomiflixSection {
  id: string;
  label: string;
  description: string | null;
  order_index: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DomiflixSectionTitle {
  id: string;
  section_id: string;
  title_id: string;
  order_index: number;
}

export interface DomiflixSectionWithTitleIds extends DomiflixSection {
  titleIds: string[];
}

const SECTIONS_KEY = ["domiflix-sections"] as const;
const SECTION_TITLES_KEY = ["domiflix-section-titles"] as const;

export function useDomiflixSections() {
  return useQuery({
    queryKey: SECTIONS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("domiflix_sections" as any)
        .select("*")
        .order("order_index", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as DomiflixSection[];
    },
  });
}

export function useDomiflixSectionTitles() {
  return useQuery({
    queryKey: SECTION_TITLES_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("domiflix_section_titles" as any)
        .select("*")
        .order("order_index", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as DomiflixSectionTitle[];
    },
  });
}

export function useDomiflixSectionsWithTitles() {
  const sections = useDomiflixSections();
  const links = useDomiflixSectionTitles();

  const data: DomiflixSectionWithTitleIds[] = (sections.data ?? [])
    .filter((s) => s.is_active)
    .map((s) => {
      const titleIds = (links.data ?? [])
        .filter((l) => l.section_id === s.id)
        .sort((a, b) => a.order_index - b.order_index)
        .map((l) => l.title_id);
      return { ...s, titleIds };
    });

  return {
    data,
    isLoading: sections.isLoading || links.isLoading,
    error: sections.error || links.error,
  };
}

export function useCreateSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { label: string; description?: string | null }) => {
      const { data: existing } = await supabase
        .from("domiflix_sections" as any)
        .select("order_index")
        .order("order_index", { ascending: false })
        .limit(1);
      const maxOrder = (existing as any)?.[0]?.order_index ?? -1;
      const { error } = await supabase
        .from("domiflix_sections" as any)
        .insert({
          label: payload.label,
          description: payload.description ?? null,
          order_index: (maxOrder ?? -1) + 1,
        } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SECTIONS_KEY });
      toast.success("Seção criada");
    },
    onError: () => toast.error("Erro ao criar seção"),
  });
}

export function useUpdateSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<DomiflixSection> & { id: string }) => {
      assertRowsAffected(
        await supabase
          .from("domiflix_sections" as any)
          .update(patch as any, { count: "exact" })
          .eq("id", id),
        "update",
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SECTIONS_KEY }),
    onError: () => toast.error("Erro ao atualizar seção"),
  });
}

export function useDeleteSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      assertRowsAffected(
        await supabase.from("domiflix_sections" as any).delete({ count: "exact" }).eq("id", id),
        "delete",
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SECTIONS_KEY });
      qc.invalidateQueries({ queryKey: SECTION_TITLES_KEY });
      toast.success("Seção removida");
    },
    onError: () => toast.error("Erro ao remover seção"),
  });
}

export function useReorderSections() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const results = await Promise.all(
        orderedIds.map((id, index) =>
          supabase.from("domiflix_sections" as any).update({ order_index: index } as any, { count: "exact" }).eq("id", id)
        )
      );
      // Lote com ids conhecidos: cada seção precisa ter sido gravada.
      const failed = results.find((result) => result.error);
      const count = results.reduce((total, result) => total + (result.count ?? 0), 0);
      assertRowsAffected({ error: failed?.error ?? null, count }, "update", undefined, orderedIds.length);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SECTIONS_KEY }),
    onError: () => toast.error("Erro ao reordenar seções"),
  });
}

export function useUpdateSectionTitles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sectionId, titleIds }: { sectionId: string; titleIds: string[] }) => {
      const { error: delErr } = await supabase
        .from("domiflix_section_titles" as any)
        .delete()
        .eq("section_id", sectionId);
      if (delErr) throw delErr;
      if (titleIds.length === 0) return;
      const rows = titleIds.map((title_id, index) => ({ section_id: sectionId, title_id, order_index: index }));
      const { error: insErr } = await supabase.from("domiflix_section_titles" as any).insert(rows as any);
      if (insErr) throw insErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SECTION_TITLES_KEY });
      toast.success("Seção atualizada");
    },
    onError: () => toast.error("Erro ao atualizar títulos da seção"),
  });
}
