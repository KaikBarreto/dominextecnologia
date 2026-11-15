export type ScheduledAccount = {
  id: string; direction: 'credit' | 'debit'; description: string; amount: number;
  due_date: string; status: 'pending' | 'settled' | 'cancelled'; bank_account_id: string | null;
  counterparty: string | null; category_id: string | null; notes: string | null;
  series_id: string | null; series_occurrence: number | null; version: number;
};
export type ScheduledBank = { id: string; name: string; account_kind: string; is_active: boolean };
export const accountMoney = (n: number) => Number(n).toLocaleString('pt-BR', {style:'currency',currency:'BRL'});
export const accountDate = (s: string) => s.slice(0,10).split('-').reverse().join('/');
export const accountToday = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function recurringDates(first: string, count: number): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(first) || count < 1 || count > 60 || !Number.isInteger(count)) return [];
  const [year,month,day]=first.split('-').map(Number);
  return Array.from({length:count},(_,i)=>{
    const last = new Date(Date.UTC(year,month+i,0));
    return `${last.getUTCFullYear()}-${String(last.getUTCMonth()+1).padStart(2,'0')}-${String(Math.min(day,last.getUTCDate())).padStart(2,'0')}`;
  });
}
export function accountError(error: unknown): string {
  const msg = String((error as {message?:string})?.message ?? '');
  if (/conflict|version|stale/i.test(msg)) return 'Esta conta mudou desde que foi aberta. Feche, atualize a lista e confira os dados antes de tentar novamente.';
  if (/permission|denied|authorized/i.test(msg)) return 'Seu perfil não permite esta operação. Solicite acesso aos lançamentos financeiros.';
  if (/mismatch|already|unique|duplicate/i.test(msg)) return 'Confira o movimento: valor, conta e direção devem corresponder, e ele não pode estar vinculado a outra conta.';
  if (/invalid|category|account_not_found/i.test(msg)) return 'Confira valor, vencimento, categoria e conta bancária. Selecione uma conta ativa.';
  return 'Não foi possível salvar. Confira sua conexão e tente novamente; repetir a tentativa não cria outra conta.';
}
