/** Mensagens de domínio; cStat é evidência técnica, nunca copy crua para o usuário. */
export function goodsRejectionGuidance(code: unknown) {
  const guidance: Record<string, string> = {
    sefaz_230: 'A inscrição estadual do emitente não foi encontrada pela SEFAZ. Confira a IE nas Configurações Fiscais com a contabilidade.',
    sefaz_231: 'A inscrição estadual não está vinculada ao CNPJ do emitente na SEFAZ. Confira esse vínculo com a contabilidade.',
    sefaz_539: 'A SEFAZ recusou esta nota porque o número dela já foi usado em outra nota da empresa, emitida em outro sistema. Em Configurações fiscais, edite a série, informe o último número já utilizado e emita novamente.',
    sefaz_590: 'A tributação de um item usa CST para uma empresa do Simples Nacional. Revise o CSOSN do material com a contabilidade.',
    sefaz_591: 'A tributação de um item usa CSOSN para uma empresa fora do Simples Nacional. Revise o CST do material com a contabilidade.',
    sefaz_696: 'O destinatário está sem inscrição estadual e precisa ser tratado como consumidor final. Corrija a finalidade da operação e reemita a nota.',
    sefaz_778: 'O NCM de um item não existe na tabela oficial. Corrija o NCM no cadastro do material com a contabilidade.',
    sefaz_779: 'O NCM de um item é incompatível com NFC-e. Revise o cadastro do material e o tipo de documento com a contabilidade.',
  };
  return guidance[String(code)] ?? 'A SEFAZ rejeitou a nota. Revise o cadastro fiscal com o responsável e consulte esta mesma nota antes de solicitar uma correção.';
}
