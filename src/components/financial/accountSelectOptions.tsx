import { BankLogo } from '@/components/financial/BankInstitutionCombobox';
import { filterAccountsForReceivable } from '@/lib/financial-account-filter';
import type { SearchableSelectOption } from '@/components/ui/SearchableSelect';

/** Só o que a opção de conta precisa — qualquer shape de conta serve. */
export interface AccountOptionSource {
  id: string;
  name: string;
  type?: string | null;
  color?: string | null;
  institution_code?: string | null;
  institution_name?: string | null;
  bank_name?: string | null;
  is_active?: boolean | null;
}

/**
 * Identidade visual da conta: logo do banco + bolinha da cor cadastrada.
 *
 * Existe porque o reconhecimento da conta é VISUAL — o operador acha "a conta
 * do Itaú" pela marca, não lendo o nome. Vários selects mostravam só o texto e
 * pareciam de outro sistema. Mesmo padrão do EcoSistema (`BankAccountSelect`).
 */
export function AccountOptionIcon({ account }: { account: AccountOptionSource }) {
  return (
    <span className="flex items-center gap-1.5">
      <BankLogo
        code={account.institution_code}
        name={account.institution_name || account.bank_name || undefined}
        size={18}
      />
      {account.color && (
        <span
          className="h-2 w-2 rounded-full shrink-0"
          style={{ backgroundColor: account.color }}
        />
      )}
    </span>
  );
}

/**
 * Monta as opções de um select de conta bancária / caixa, com a identidade
 * visual padrão. Régua única: todo select de conta do sistema passa por aqui,
 * pra nenhum deles voltar a ser uma lista de texto puro.
 *
 * `cashSuffix` é o rótulo de conta tipo caixa (vem do i18n do chamador).
 */
export function buildAccountOptions(
  accounts: AccountOptionSource[] | null | undefined,
  opts: { cashSuffix?: string; includeCard?: boolean } = {},
): SearchableSelectOption[] {
  const { cashSuffix, includeCard = false } = opts;
  const visible = filterAccountsForReceivable(
    (accounts ?? []) as AccountOptionSource[] as any,
    { includeCard },
  ) as unknown as AccountOptionSource[];
  return visible.map(
    (a) => ({
      value: a.id,
      label: a.type === 'caixa' && cashSuffix ? `${a.name} ${cashSuffix}` : a.name,
      icon: <AccountOptionIcon account={a} />,
      // Nome da instituição entra como termo de busca: quem procura "itau"
      // acha a conta mesmo que ela tenha sido cadastrada como "Conta principal".
      keywords: [a.institution_name, a.bank_name].filter((k): k is string => !!k),
    }),
  );
}
