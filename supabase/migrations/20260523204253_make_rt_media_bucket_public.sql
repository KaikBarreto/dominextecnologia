begin;

-- Tornar `responsible-technicians-media` público pra que getPublicUrl() funcione.
-- Path inclui company_id no prefixo + UUID do RT — enumeração entre tenants
-- difícil. Decisão CEO: assinatura/carimbo são embedded em TRT/Dossiê que
-- já é acessível pelo portal público PMOC, não há ganho real em mantê-los
-- privados.
update storage.buckets
set public = true
where id = 'responsible-technicians-media';

-- Audit
do $audit$
declare
  v_public boolean;
begin
  select public into v_public from storage.buckets where id = 'responsible-technicians-media';
  if v_public is true then
    raise notice 'Bucket responsible-technicians-media agora é PÚBLICO. URLs via getPublicUrl() funcionam.';
  else
    raise exception 'Falha ao tornar bucket público.';
  end if;
end $audit$;

commit;
