import { Building2, Mail, MapPin, Phone, UserRound } from 'lucide-react';
import { CustomerAvatar } from '@/components/customers/CustomerAvatar';
import type { Customer } from '@/types/database';

export function QuoteRecipientSummary({ customer, prospect }: {
  customer?: Customer;
  prospect?: { name: string; phone: string; email: string };
}) {
  const name = customer?.name || prospect?.name.trim();
  const phone = customer?.celular || customer?.phone || prospect?.phone;
  const email = customer?.email || prospect?.email;
  const street = [customer?.address, customer?.address_number].filter(Boolean).join(', ');
  const city = [customer?.city, customer?.state].filter(Boolean).join(' / ');
  const address = [street, customer?.complement, customer?.neighborhood, city].filter(Boolean).join(' · ');
  const details = [
    ...(customer ? [{ label: 'CPF / CNPJ', value: customer.document, icon: Building2 }] : []),
    { label: 'Telefone', value: phone, icon: Phone },
    { label: 'E-mail', value: email, icon: Mail },
    ...(customer ? [{ label: 'Endereço', value: address, icon: MapPin }] : []),
  ];

  return (
    <aside aria-label="Resumo do destinatário" className="min-w-0 border-t pt-7 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-1">
      <p className="text-sm font-semibold text-muted-foreground">{customer ? 'Cliente selecionado' : prospect ? 'Novo prospecto' : 'Dados do cliente'}</p>
      {name ? (
        <>
          <div className="mb-7 mt-4 flex items-start gap-4">
            <CustomerAvatar name={name} photoUrl={customer?.photo_url} className="h-16 w-16 [&>span]:text-xl" />
            <div className="min-w-0 self-center">
              <h3 className="break-words text-xl font-semibold leading-tight sm:text-2xl">{name}</h3>
              {customer?.nome_fantasia && customer.nome_fantasia !== name && (
                <p className="mt-1 break-words text-sm text-muted-foreground">{customer.nome_fantasia}</p>
              )}
            </div>
          </div>
          <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {details.map(({ label, value, icon: Icon }) => (
              <div key={label} className={label === 'Endereço' ? 'sm:col-span-2 lg:col-span-1 xl:col-span-2' : 'min-w-0'}>
                <dt className="flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-muted-foreground" />{label}</dt>
                <dd className="mt-1.5 break-words text-base [overflow-wrap:anywhere]">{value || <span className="text-muted-foreground">Não informado</span>}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <div className="mt-5 max-w-sm space-y-3 pb-3">
          <UserRound className="mb-5 h-9 w-9" strokeWidth={1.5} />
          <h3 className="text-xl font-semibold sm:text-2xl">Quem receberá a proposta?</h3>
          <p className="text-base leading-relaxed text-muted-foreground">{prospect ? 'Preencha os dados ao lado para conferir o destinatário antes de montar o orçamento.' : 'Selecione um cliente para conferir a foto, os contatos e o endereço antes de continuar.'}</p>
        </div>
      )}
    </aside>
  );
}
