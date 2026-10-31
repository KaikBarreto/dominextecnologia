import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';

export type PartyLabelScope = 'party' | 'equipment' | 'all';
export type PartyLabelEntity = 'customer' | 'supplier' | 'equipment';

export interface PartyLabel {
  id: string;
  company_id: string;
  name: string;
  color: string;
  is_active: boolean;
  scope: PartyLabelScope;
  show_in_portal: boolean;
  created_at: string;
  updated_at?: string;
}

interface PartyLabelAssignment {
  entityType: PartyLabelEntity;
  entityId: string;
  labelId: string;
  position: number;
}

type PartyLabelInput = Pick<PartyLabel, 'name' | 'color'> & Partial<Pick<PartyLabel, 'is_active' | 'show_in_portal'>>;
const consumerKeys = ['party-labels', 'customers', 'suppliers', 'equipment'];
const EMPTY_LABELS: PartyLabel[] = [];

export function usePartyLabels(scope: Exclude<PartyLabelScope, 'all'> = 'party') {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ['party-labels', companyId, scope],
    enabled: !!companyId,
    queryFn: async () => {
      if (!companyId) return { labels: [] as PartyLabel[], assignments: [] as PartyLabelAssignment[] };
      const labelsResult = await supabase.from('party_labels').select('*').eq('company_id', companyId).in('scope', [scope, 'all']).order('name');
      if (labelsResult.error) throw labelsResult.error;
      const assignments: PartyLabelAssignment[] = [];
      if (scope === 'party') {
        const [customersResult, suppliersResult] = await Promise.all([
          supabase.from('customer_label_assignments').select('customer_id,label_id,position').eq('company_id', companyId),
          supabase.from('supplier_label_assignments').select('supplier_id,label_id,position').eq('company_id', companyId),
        ]);
        if (customersResult.error) throw customersResult.error;
        if (suppliersResult.error) throw suppliersResult.error;
        for (const row of customersResult.data ?? []) assignments.push({ entityType: 'customer', entityId: row.customer_id, labelId: row.label_id, position: row.position });
        for (const row of suppliersResult.data ?? []) assignments.push({ entityType: 'supplier', entityId: row.supplier_id, labelId: row.label_id, position: row.position });
      } else {
        const equipmentResult = await supabase.from('equipment_label_assignments').select('equipment_id,label_id,position').eq('company_id', companyId);
        if (equipmentResult.error) throw equipmentResult.error;
        for (const row of equipmentResult.data ?? []) {
          assignments.push({ entityType: 'equipment', entityId: row.equipment_id, labelId: row.label_id, position: row.position });
        }
      }
      return { labels: (labelsResult.data ?? []) as PartyLabel[], assignments };
    },
  });

  const invalidate = () => consumerKeys.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));

  const createLabel = useMutation({
    mutationFn: async (input: PartyLabelInput) => {
      if (!companyId) throw new Error('Usuário sem empresa associada.');
      const { data, error } = await supabase.from('party_labels').insert({ ...input, company_id: companyId, scope, is_active: true }).select().single();
      if (error) throw error;
      return data as PartyLabel;
    },
    onSuccess: () => { invalidate(); toast({ title: 'Etiqueta criada!' }); },
    onError: (error) => toast({ variant: 'destructive', title: 'Erro ao criar etiqueta', description: getErrorMessage(error) }),
  });

  const updateLabel = useMutation({
    mutationFn: async ({ id, ...input }: Partial<PartyLabelInput> & { id: string }) => {
      if (!companyId) throw new Error('Usuário sem empresa associada.');
      const { data, error } = await supabase.from('party_labels').update(input).eq('id', id).eq('company_id', companyId).select().single();
      if (error) throw error;
      return data as PartyLabel;
    },
    onSuccess: invalidate,
    onError: (error) => toast({ variant: 'destructive', title: 'Erro ao atualizar etiqueta', description: getErrorMessage(error) }),
  });

  const deleteLabel = useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error('Usuário sem empresa associada.');
      const { error } = await supabase.from('party_labels').delete().eq('id', id).eq('company_id', companyId);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast({ title: 'Etiqueta removida!' }); },
    onError: (error) => toast({ variant: 'destructive', title: 'Erro ao remover etiqueta', description: getErrorMessage(error) }),
  });

  const setEntityLabels = useMutation({
    mutationFn: async ({ entityType, entityId, labelIds }: { entityType: PartyLabelEntity; entityId: string; labelIds: string[] }) => {
      const result = entityType === 'customer'
        ? await supabase.rpc('set_customer_labels', { p_customer_id: entityId, p_label_ids: labelIds })
        : entityType === 'supplier'
          ? await supabase.rpc('set_supplier_labels', { p_supplier_id: entityId, p_label_ids: labelIds })
          : await supabase.rpc('set_equipment_labels', { p_equipment_id: entityId, p_label_ids: labelIds });
      const { error } = result;
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (error) => toast({ variant: 'destructive', title: 'Erro ao salvar etiquetas', description: getErrorMessage(error) }),
  });

  const labels = query.data?.labels ?? EMPTY_LABELS;
  const assignmentMap = useMemo(() => {
    const map = new Map<string, string[]>();
    const assignments = query.data?.assignments ?? [];
    [...assignments].sort((a, b) => a.position - b.position).forEach((assignment) => {
      const key = `${assignment.entityType}:${assignment.entityId}`;
      map.set(key, [...(map.get(key) ?? []), assignment.labelId]);
    });
    return map;
  }, [query.data?.assignments]);
  const activeLabels = labels.filter((label) => label.is_active);
  const byId = useCallback((id?: string | null) => labels.find((label) => label.id === id), [labels]);
  const byIds = useCallback(
    (ids?: string[] | null) => (ids ?? []).map((id) => byId(id)).filter((label): label is PartyLabel => !!label),
    [byId],
  );
  const labelIdsFor = useCallback(
    (entityType: PartyLabelEntity, entityId?: string | null) => entityId ? assignmentMap.get(`${entityType}:${entityId}`) ?? [] : [],
    [assignmentMap],
  );
  const labelsFor = useCallback(
    (entityType: PartyLabelEntity, entityId?: string | null) => byIds(labelIdsFor(entityType, entityId)),
    [byIds, labelIdsFor],
  );

  return { labels, activeLabels, byId, byIds, labelIdsFor, labelsFor, isLoading: query.isLoading, isError: query.isError, createLabel, updateLabel, deleteLabel, setEntityLabels };
}
