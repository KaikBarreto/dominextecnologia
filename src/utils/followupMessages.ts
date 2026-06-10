/**
 * Mensagens pré-prontas da cadência de follow-up (passos 1 a 10).
 *
 * Usadas pra pré-preencher a conversa do WhatsApp quando o operador clica em
 * "WhatsApp" numa tarefa de follow-up. O operador confere e envia — nada é
 * disparado automaticamente. Tarefas de outros tipos abrem o WhatsApp sem texto.
 *
 * A chave é o `admin_tasks.followup_step` (1–10). Passo fora desse range = sem texto.
 */
export const FOLLOWUP_MESSAGES: Record<number, string> = {
  1: "Oi! 👋 Aqui é da *Dominex*.\n\nTô retomando nosso contato sobre o sistema de gestão pra sua empresa de serviços em campo. Posso te mostrar rapidinho como ele organiza suas *ordens de serviço* e a *equipe em campo* num lugar só?\n\nTe mando um resumo por aqui ou marco uma demonstração rápida — como você prefere?",
  2: "Oi, tudo bem? Voltando de onde a gente parou 🙂\n\nUma coisa que costuma chamar atenção na *Dominex*: o técnico abre a OS no celular, preenche o checklist, anexa as fotos e colhe a assinatura do cliente na hora — _funciona até sem internet_ e o relatório sai prontinho.\n\nQuer que eu te mostre como ficaria na sua operação?",
  3: "Olá! 😊 Várias empresas que trabalham com serviço em campo já tocam o dia a dia na *Dominex*.\n\nTeve cliente que me disse: _'parei de perder serviço anotado em caderno e agora sei onde cada técnico está'_.\n\nFaz sentido pro seu cenário? Posso te mostrar exatamente essa parte.",
  4: "Oi! Sei que trocar de sistema (ou sair do caderno/planilha) parece trabalhoso, mas *a implantação a gente faz junto com você*, e a equipe entra rápido porque é bem visual, parece um app.\n\nSem dor de cabeça pra começar. Topa eu te mostrar o primeiro passo?",
  5: "Oi, esqueceu de mim? 😅\n\nAinda tô por aqui, na torcida pra te ajudar a organizar a empresa. Se for um momento corrido, me avisa que eu retomo mais pra frente — sem problema nenhum.\n\nMas se quiser, dá pra ver o essencial em _10 minutinhos_.",
  6: "Oi, tudo bem? Uma pergunta rápida: hoje como você acompanha as *OS*, os *PMOC* e o que cada técnico fez no dia?\n\nSe isso ainda vive no WhatsApp, no caderno ou na planilha, é exatamente o tipo de bagunça que a *Dominex* resolve.\n\nQuer que eu te mostre?",
  7: "Oi! Sem pressão nenhuma 🙂\n\nSe preferir sentir na prática antes de decidir, consigo te dar um acesso pra você navegar e ver como ficaria a sua empresa lá dentro. Às vezes é mais fácil entender o valor mexendo do que eu explicando.\n\nQuer que eu libere pra você?",
  8: "Oi, tudo bem? Tô organizando minha agenda desta semana e queria reservar um horário pra te mostrar a *Dominex* com calma.\n\nPrefere _amanhã de manhã_ ou _no fim da tarde_? É rapidinho e você já sai com uma ideia clara se faz sentido pra sua operação.",
  9: "Oi! Não quero ser chato 🙏 mas acredito de verdade que a *Dominex* tiraria um peso da sua rotina: *menos serviço perdido*, *técnico organizado em campo* e *relatório profissional* pro seu cliente final.\n\nSe topar, te mostro em poucos minutos. E se não for a hora, me fala francamente que eu entendo.",
  10: "Oi! Esse é meu último contato por aqui 🙏 Não vou mais te incomodar.\n\nMas a porta fica aberta: se um dia quiser organizar as *OS*, a *equipe* e os *PMOC* da sua empresa num lugar só, é só me chamar que eu te atendo na hora.\n\nObrigado e sucesso na sua empresa! 🤝",
};

/**
 * Resolve a mensagem de follow-up de uma tarefa. Retorna a mensagem do passo
 * quando a tarefa é follow-up e o passo está em 1–10; caso contrário `undefined`
 * (abre o WhatsApp sem texto, como nos demais tipos de tarefa).
 */
export function getFollowupMessage(
  type: string | null | undefined,
  step: number | null | undefined,
): string | undefined {
  if (type !== 'follow-up') return undefined;
  if (step == null) return undefined;
  return FOLLOWUP_MESSAGES[step];
}
