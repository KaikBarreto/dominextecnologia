import { useQuery } from '@tanstack/react-query';
import { useGoodsFiscalAccess } from './useGoodsFiscalAccess';
import { supabase } from '@/integrations/supabase/client';
import type { GoodsModel } from './useGoodsFiscal';
export interface GoodsFiscalReadinessIssue { code: string; message: string; section: 'empresa' | 'certificado' | 'mercadorias' }
export interface GoodsFiscalReadiness { ready: boolean; issues: GoodsFiscalReadinessIssue[]; environment: 'homologacao' | 'producao' }
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function projectGoodsReadiness(value: unknown): GoodsFiscalReadiness {
  const row = object(value);
  if (row.ok !== true || typeof row.ready !== 'boolean' || !Array.isArray(row.issues) || !['homologacao','producao'].includes(String(row.environment))) throw new Error('Não foi possível conferir a configuração fiscal. Tente novamente.');
  const issues = row.issues.map(raw => {
    const issue = object(raw);
    if (typeof issue.code !== 'string' || typeof issue.message !== 'string' || !issue.message.trim() || !['empresa','certificado','mercadorias'].includes(String(issue.section)) || /SQLSTATE|constraint|public\.|rpc|supabase|token|certificate_ref/i.test(issue.message)) throw new Error('Não foi possível conferir a configuração fiscal. Tente novamente.');
    return {code:issue.code,message:issue.message.slice(0,500),section:issue.section as GoodsFiscalReadinessIssue['section']};
  });
  return {ready:row.ready === true && issues.length === 0,issues,environment:row.environment as GoodsFiscalReadiness['environment']};
}
export function useGoodsFiscalReadiness(model: GoodsModel, enabled = true) {
  const access = useGoodsFiscalAccess();
  const query = useQuery({
    queryKey:[...access.key,'readiness',model],enabled:access.allowed && enabled,staleTime:30_000,gcTime:0,retry:false,
    queryFn:async()=>{
      const {data,error}=await supabase.functions.invoke('fiscal-goods-document',{body:{action:'readiness',model}});
      if(error)throw new Error('Não foi possível conferir a configuração fiscal. Tente novamente.');
      return projectGoodsReadiness(data);
    },
  });
  return {...query,data:access.allowed && enabled && !query.isError ? query.data : undefined};
}
