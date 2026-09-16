-- Preferência do usuário: mostrar compras no cartão dentro da Visão Geral das
-- Movimentações Financeiras. Antes vivia num useState solto na tela (não
-- persistia, resetava a cada reload). O CEO decidiu que essa preferência
-- segue a PESSOA entre aparelhos (não fica presa a um dispositivo) — por
-- isso vai pra user_preferences (own-row via auth.uid()), e não pra
-- localStorage (padrão usado pelas outras opções da aba Usabilidade) nem pra
-- company_settings (que é decisão da EMPRESA, não do usuário).
alter table public.user_preferences
  add column if not exists finance_movements_include_card_purchases boolean not null default false;

comment on column public.user_preferences.finance_movements_include_card_purchases is
  'Se true, a Visão Geral de Movimentações Financeiras também mostra compras no cartão (que por padrão ficam escondidas até a fatura ser paga, pois ainda não são movimento de caixa). Preferência pessoal do usuário, segue entre aparelhos. As policies RLS own-row já existentes na tabela cobrem esta coluna.';
