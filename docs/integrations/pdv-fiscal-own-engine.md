# PDV e motor fiscal próprio

Contrato interno revisado em 16/11/2026. Responsável: domínio Fiscal Dominex.

A Edge `fiscal-goods-document` resolve usuário, empresa, assinatura e permissão antes de operar. Os modelos55/65 usam exclusivamente os adapters server-side `nfe-client.ts`/`nfce-client.ts`, configurados por `FISCAL_SERVICE_URL` e `FISCAL_SERVICE_TOKEN`. Nenhum desses valores é enviado ao browser. O motor canônico é o serviço privado compartilhado no repositório `motor-fiscal`; não há provedor fiscal terceirizado nesta ponte.

## Ações autenticadas internas

- `readiness` recebe somente `model`55/65. Consulta pré-requisitos sem criar documento, reservar número ou chamar SEFAZ. Devolve `ready`, `environment` e `issues` com `code/message/section`. Nunca devolve referência de certificado, material cifrado, dados brutos do cadastro ou tokens. A emissão usa o mesmo helper de pré-requisitos.
- `save_draft` e `emit` preservam a origem comercial e comparam itens/descontos/pagamentos com os dados persistidos da venda. Antes de preparar, o claim compara o JSON do rascunho salvo; edição concorrente exige reabrir em vez de transmitir conteúdo divergente.
- `revise` reabre somente falha local sem chave ou preparação sem chave interrompida por pelo menos cinco minutos. O número reservado é preservado. A nova operação invalida as escritas atrasadas da anterior por comparação de `operation_id`, status e última alteração. A intenção é auditada. Rejeição com chave não é reaberta cegamente.
- `resume` aceita exclusivamente documento assinado. Confere pré-requisitos, ambiente/UF, origem, hash do snapshot e XML persistido. Reutiliza operação, XML, chave e numeração. Um claim `signed→transmitting` impede duas autorizações; `uncertain`/`transmitting` e estados finais nunca são reenviados.
- `consult`, `cancel` e `artifact` conservam o documento e o contexto autorizado. Arquivos só recebem URL temporária se estiverem no prefixo empresa/modelo/documento; downloads de XML assinado também recusam caminhos de outra empresa. Cancelamento fiscal não estorna a venda comercial.

## Escritas concorrentes e estados irreversíveis

Cada transição fiscal compara no próprio UPDATE a operação, o status e o `updated_at` retornados pela leitura ou pelo PATCH anterior. O resultado atrasado que perdeu essa comparação retorna conflito orientado para consultar/refazer a leitura; o aplicativo invalida a consulta fiscal também quando a ação falha. Não há leitura seguida de escrita sem comparação para decidir quem vence.

- Uma autorização atrasada não sobrescreve um cancelamento pendente ou confirmado. Consulta de documento já cancelado retorna o estado final sem chamar o motor ou reescrever a nota.
- O tratamento de timeout só altera a revisão de processamento que pertence àquela tentativa. Uma autorização ou cancelamento já recuperados por outra consulta permanecem intactos.
- Durante cancelamento pendente, consulta que ainda encontra autorização ou resultado inconclusivo mantém a pendência e não libera outra solicitação. Somente prova de cancelamento permite avançar para cancelada.
- Uma consulta inconclusiva não rebaixa autorização persistida. Cancelada é final para estas ações.
- A auditoria distingue retorno antigo ignorado de atualização aplicada. O status atual não é reescrito por esse registro de auditoria.

Os XML/PDF oficiais usam caminhos endereçados pelo hash do conteúdo, dentro do mesmo prefixo empresa/modelo/documento. Assim, uma resposta que perdeu o CAS pode guardar seu próprio conteúdo, mas nunca substituir os bytes do arquivo já vinculado pela revisão vencedora. Os arquivos de cancelamento são separados por operação; o XML processado também inclui o hash. Caminhos anteriores continuam legíveis pelo mesmo contrato de acesso.

As regressões Deno intercalam handlers com respostas fiscais atrasadas e um double PostgREST que aplica filtros atomicamente, inclusive o caso de status igual com revisão diferente. Esses testes não substituem homologação SEFAZ nem uma certificação de concorrência física do banco em produção.

## Fluxo da loja

A venda permanece concluída mesmo quando a emissão falha. No modo Perguntar, a pergunta só aparece quando há acesso fiscal, prontidão e venda confirmada. O painel mostra pendências e oferece acesso às Configurações Fiscais. Os rascunhos são retomados na própria lista; arquivos têm janela reservada no clique e link de recuperação quando o navegador bloqueia popup. Troca de empresa remove imediatamente edição e arquivos antigos.

## Limites da entrega

Produção e modo automático permanecem sujeitos aos gates explícitos existentes; nenhuma aprovação é concedida pelo payload do cliente. Rejeições oficiais com chave exigem consulta e tratamento fiscal próprio, nunca recriação automática. O código e os testes não substituem autorização/cancelamento reais em homologação. O cadastro demo ainda depende de inscrição estadual válida confirmada. Não houve envio real à SEFAZ nesta rodada.

## API pública

Estas ações pertencem à Edge autenticada interna do aplicativo. Não adicionam rota, scope ou operação à API pública `/api/v1`. Foi conferida a separação com `docs/api/openapi.v1.yaml`, documentação `/docs`, Markdown público e exemplos; o contrato público permanece inalterado.

## Verificação

Executar Deno nos testes da Edge/settings/readiness, Vitest nos hooks/componentes fiscais e políticas de PDV, e lint nos arquivos alterados. O healthcheck público200 e a recusa401 de `/readyz` comprovam disponibilidade e proteção do serviço, não homologação SEFAZ.
