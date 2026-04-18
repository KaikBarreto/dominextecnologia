import { Link } from 'react-router-dom';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background py-12">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Voltar</Link>
        </div>

        <h1 className="text-3xl font-bold mb-2">Política de Privacidade</h1>
        <p className="text-sm text-muted-foreground mb-8">Versão 1.0 — última atualização: abril de 2026</p>

        <div className="prose prose-sm max-w-none space-y-8 text-foreground">

          <section>
            <h2 className="text-xl font-semibold mb-3">1. Identificação do Controlador</h2>
            <p>
              <strong>Dominex Tecnologia</strong> é a controladora dos dados pessoais tratados nesta plataforma,
              nos termos da Lei nº 13.709/2018 (LGPD).
            </p>
            <p className="mt-2">
              <strong>Encarregado de Dados (DPO):</strong> Em processo de nomeação conforme Art. 41 da LGPD.<br />
              Canal de contato: <a href="mailto:privacidade@dominex.com.br" className="text-primary underline">privacidade@dominex.com.br</a>
            </p>
          </section>

          <section id="dados-coletados">
            <h2 className="text-xl font-semibold mb-3">2. Dados Pessoais Coletados</h2>
            <p>Coletamos as seguintes categorias de dados pessoais:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li><strong>Cadastrais:</strong> nome, e-mail, telefone, CPF/CNPJ</li>
              <li><strong>De acesso:</strong> logs de login, endereço IP, user-agent, sessões ativas</li>
              <li><strong>De funcionários:</strong> nome, CPF, telefone, endereço, chave PIX, salário, jornada</li>
              <li><strong>De geolocalização:</strong> coordenadas GPS dos técnicos durante atendimentos (a cada 30s)</li>
              <li><strong>Biométricos/imagem:</strong> selfies para registro de ponto eletrônico e fotos de equipamentos</li>
              <li><strong>De clientes da empresa-usuária:</strong> nome, CPF/CNPJ, e-mail, telefone, endereço, equipamentos</li>
              <li><strong>Financeiros:</strong> registros de transações (sem dados de cartão de crédito — processados por gateways externos)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Finalidades e Bases Legais (Art. 7º e 11 LGPD)</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse border border-border">
                <thead className="bg-muted">
                  <tr>
                    <th className="border border-border p-2 text-left">Finalidade</th>
                    <th className="border border-border p-2 text-left">Base Legal</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Prestação do serviço de gestão de OS e equipes', 'Execução de contrato (Art. 7º V)'],
                    ['Controle de ponto e jornada de trabalho', 'Cumprimento de obrigação legal (Art. 7º II)'],
                    ['Rastreamento de técnicos em campo durante atendimentos', 'Legítimo interesse + consentimento (Art. 7º IX e I)'],
                    ['Registro de ponto com selfie (biometria)', 'Consentimento específico (Art. 11 I)'],
                    ['Comunicação sobre o serviço contratado', 'Execução de contrato (Art. 7º V)'],
                    ['Melhoria e segurança da plataforma', 'Legítimo interesse (Art. 7º IX)'],
                    ['Cumprimento de obrigações fiscais e contábeis', 'Cumprimento de obrigação legal (Art. 7º II)'],
                  ].map(([fin, base]) => (
                    <tr key={fin}>
                      <td className="border border-border p-2">{fin}</td>
                      <td className="border border-border p-2">{base}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Compartilhamento com Terceiros (Sub-processadores)</h2>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>
                <strong>Supabase Inc.</strong> (EUA) — banco de dados, autenticação e armazenamento de arquivos.
                Transferência internacional baseada em cláusulas contratuais padrão (Art. 33 LGPD).
              </li>
              <li>
                <strong>OpenStreetMap/Nominatim</strong> — geocodificação de endereços (proxiado pelo servidor, sem envio direto do IP do usuário).
              </li>
              <li>
                <strong>ViaCEP</strong> — consulta de CEP para autopreenchimento de endereço.
              </li>
              <li>
                <strong>Gateways de pagamento</strong> (Stripe/Pagar.me/Mercado Pago) — processamento de cobranças.
                Não temos acesso a dados de cartão.
              </li>
            </ul>
            <p className="mt-3 text-sm text-muted-foreground">
              Não vendemos, alugamos ou compartilhamos dados pessoais com terceiros para fins publicitários.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Retenção de Dados</h2>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Dados da conta: enquanto o contrato estiver ativo + 90 dias após encerramento</li>
              <li>Registros fiscais e financeiros: 5 anos (obrigação legal)</li>
              <li>Logs de acesso: 6 meses</li>
              <li>Dados de geolocalização: 12 meses</li>
              <li>Dados de ponto eletrônico: 5 anos (obrigação trabalhista)</li>
            </ul>
          </section>

          <section id="lgpd">
            <h2 className="text-xl font-semibold mb-3">6. Direitos do Titular (Art. 18 LGPD)</h2>
            <p>Você tem os seguintes direitos em relação aos seus dados pessoais:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Confirmação da existência de tratamento</li>
              <li>Acesso aos dados</li>
              <li>Correção de dados incompletos, inexatos ou desatualizados</li>
              <li>Anonimização, bloqueio ou eliminação de dados desnecessários</li>
              <li>Portabilidade dos dados (formato estruturado)</li>
              <li>Eliminação dos dados tratados com base em consentimento</li>
              <li>Informação sobre compartilhamento com terceiros</li>
              <li>Revogação do consentimento</li>
            </ul>
            <p className="mt-3">
              Para exercer seus direitos, acesse a{' '}
              <Link to="/meus-dados" className="text-primary underline">Central de Dados</Link>{' '}
              ou envie e-mail para{' '}
              <a href="mailto:privacidade@dominex.com.br" className="text-primary underline">
                privacidade@dominex.com.br
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Cookies e Tecnologias de Rastreamento</h2>
            <p>Utilizamos apenas cookies essenciais para funcionamento da plataforma (autenticação e preferências de sessão). Não utilizamos cookies de rastreamento ou publicidade. A fonte Montserrat é carregada localmente, sem conexão ao Google Fonts.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Segurança</h2>
            <p>Adotamos medidas técnicas e organizacionais para proteger seus dados: criptografia TLS em trânsito, controle de acesso por empresa (multi-tenant com RLS no banco), autenticação segura e monitoramento de segurança.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Alterações nesta Política</h2>
            <p>Esta política pode ser atualizada periodicamente. Quando ocorrerem mudanças significativas, notificaremos por e-mail ou aviso na plataforma. A versão e data de atualização estão sempre indicadas no topo.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. Contato e DPO</h2>
            <p>
              Para dúvidas, solicitações ou reclamações relacionadas à privacidade e proteção de dados:<br />
              <a href="mailto:privacidade@dominex.com.br" className="text-primary underline">privacidade@dominex.com.br</a>
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Você também pode registrar reclamação junto à ANPD (Autoridade Nacional de Proteção de Dados) em{' '}
              <a href="https://www.gov.br/anpd" target="_blank" rel="noopener noreferrer" className="text-primary underline">www.gov.br/anpd</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
