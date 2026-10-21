-- Evita repetir o nome da natureza contábil no subgrupo. O usuário continua
-- podendo renomear os grupos; só migramos os nomes canônicos antigos.
update public.dre_groups
set name = case nature
      when 'revenue' then 'Receitas de serviços'
      when 'deduction' then 'Impostos sobre vendas'
      when 'cost' then 'Custos diretos'
      when 'operating_expense' then 'Despesas com pessoal'
      when 'non_operating' then 'Resultado financeiro'
      else name
    end,
    updated_at = now()
where is_system = true
  and (
    (nature = 'revenue' and lower(trim(name)) = 'receita bruta')
    or (nature = 'deduction' and lower(trim(name)) = 'deduções da receita')
    or (nature = 'cost' and lower(trim(name)) = 'custos')
    or (nature = 'operating_expense' and lower(trim(name)) = 'despesas operacionais')
    or (nature = 'non_operating' and lower(trim(name)) = 'resultado não operacional')
  )
  and not exists (
    select 1
    from public.dre_groups other
    where other.company_id = dre_groups.company_id
      and other.id <> dre_groups.id
      and lower(trim(other.name)) = lower(case dre_groups.nature
        when 'revenue' then 'Receitas de serviços'
        when 'deduction' then 'Impostos sobre vendas'
        when 'cost' then 'Custos diretos'
        when 'operating_expense' then 'Despesas com pessoal'
        when 'non_operating' then 'Resultado financeiro'
      end)
  );

create or replace function public.seed_system_dre_groups()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.dre_groups (company_id, name, nature, sort_order, is_system, is_active)
  values
    (new.id, 'Receitas de serviços',      'revenue',            10, true, true),
    (new.id, 'Impostos sobre vendas',     'deduction',          20, true, true),
    (new.id, 'Custos diretos',            'cost',               30, true, true),
    (new.id, 'Despesas com pessoal',      'operating_expense', 40, true, true),
    (new.id, 'Resultado financeiro',       'non_operating',     50, true, true),
    (new.id, 'Excluídos do DRE',          'excluded',          60, true, true)
  on conflict do nothing;

  return new;
end;
$function$;
