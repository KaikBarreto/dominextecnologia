import { Link } from 'react-router-dom';

export default function TermsOfUse() {
  return (
    <div className="min-h-screen bg-background py-12">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Voltar</Link>
        </div>

        <h1 className="text-3xl font-bold mb-2">Termos de Uso</h1>
        <p className="text-sm text-muted-foreground mb-8">Versão 1.0 — última atualização: abril de 2026</p>

        <div className="prose prose-sm max-w-none space-y-8 text-foreground">

          <section>
            <h2 className="text-xl font-semibold mb-3">1. Aceitação dos Termos</h2>
            <p>
              Ao se cadastrar e utilizar a plataforma Dominex, você ("Usuário") concorda com estes Termos de Uso e com
              nossa <Link to="/privacidade" className="text-primary underline">Política de Privacidade</Link>.
              Caso não concorde, não utilize o serviço.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Descrição do Serviço</h2>
            <p>
              O Dominex é uma plataforma SaaS (Software as a Service) para gestão de equipes de campo, ordens de serviço,
              clientes, equipamentos, financeiro e recursos humanos, destinada a empresas prestadoras de serviços técnicos.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Cadastro e Conta</h2>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>O Usuário é responsável pela veracidade das informações fornecidas no cadastro.</li>
              <li>A conta é pessoal e intransferível. Não compartilhe suas credenciais.</li>
              <li>O Usuário é responsável por todas as atividades realizadas com sua conta.</li>
              <li>Informe imediatamente qualquer acesso não autorizado à sua conta.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Período de Teste</h2>
            <p>
              Oferecemos um período gratuito de 14 dias com acesso ao plano selecionado. Ao término do período,
              a conta é suspensa automaticamente caso não haja assinatura ativa. Os dados são mantidos por 90 dias
              adicionais para eventual reativação.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Propriedade dos Dados</h2>
            <p>
              Os dados inseridos na plataforma (clientes, ordens de serviço, funcionários, financeiro) são de
              propriedade da empresa-usuária. O Dominex os processa exclusivamente para prestar o serviço contratado,
              nos termos da <Link to="/privacidade" className="text-primary underline">Política de Privacidade</Link>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Uso Aceitável</h2>
            <p>É vedado utilizar a plataforma para:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Atividades ilegais ou que violem direitos de terceiros</li>
              <li>Envio de spam ou conteúdo malicioso</li>
              <li>Tentativas de acesso não autorizado a sistemas ou dados</li>
              <li>Revenda ou sublicenciamento do serviço sem autorização</li>
              <li>Engenharia reversa ou extração do código-fonte</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Disponibilidade e SLA</h2>
            <p>
              Nos esforçamos para manter a plataforma disponível 24/7, porém não garantimos disponibilidade ininterrupta.
              Manutenções programadas serão comunicadas com antecedência mínima de 24 horas.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Suspensão e Cancelamento</h2>
            <p>
              Reservamo-nos o direito de suspender ou encerrar contas que violem estes Termos, após notificação ao
              Usuário. O cancelamento voluntário pode ser feito a qualquer momento nas configurações da conta.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Limitação de Responsabilidade</h2>
            <p>
              O Dominex não se responsabiliza por danos indiretos, perda de dados por falha do Usuário em realizar backups
              próprios, ou interrupções causadas por força maior ou falhas de terceiros (provedores de internet, infraestrutura
              de nuvem).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. Alterações nos Termos</h2>
            <p>
              Podemos atualizar estes Termos periodicamente. Alterações significativas serão comunicadas com antecedência
              mínima de 30 dias por e-mail. O uso continuado do serviço após as alterações implica aceitação.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">11. Foro e Lei Aplicável</h2>
            <p>
              Estes Termos são regidos pelas leis brasileiras. Fica eleito o foro da Comarca de São Paulo — SP para
              dirimir quaisquer controvérsias.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">12. Contato</h2>
            <p>
              Dúvidas sobre estes Termos:{' '}
              <a href="mailto:contato@dominex.com.br" className="text-primary underline">contato@dominex.com.br</a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
