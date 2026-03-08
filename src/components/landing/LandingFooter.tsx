import logoWhite from '@/assets/logo-horizontal-verde.png';

const columns = [
  {
    title: 'Produto',
    links: ['Funcionalidades', 'Planos', 'Integrações', 'API', 'Status'],
  },
  {
    title: 'Empresa',
    links: ['Quem somos', 'Blog', 'Casos de sucesso', 'Vagas'],
  },
  {
    title: 'Suporte',
    links: ['Central de ajuda', 'Contato', 'Termos', 'Privacidade', 'LGPD'],
  },
];

export default function LandingFooter() {
  return (
    <footer className="bg-[hsl(0,0%,3%)] border-t border-white/5 pt-16 pb-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <img src={logoWhite} alt="Dominex" className="h-10 w-auto" />
            </div>
            <p className="text-sm text-white/30 mb-4">
              Gestão de equipes de campo e ordens de serviço.
            </p>
            <div className="flex gap-3">
              {['LinkedIn', 'Instagram', 'YouTube'].map((s) => (
                <div key={s} className="h-8 w-8 rounded-full bg-white/5 flex items-center justify-center text-xs text-white/30 hover:text-white/60 transition-colors cursor-pointer">
                  {s[0]}
                </div>
              ))}
            </div>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="text-sm font-semibold text-white mb-4">{col.title}</h4>
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link}>
                    <span className="text-sm text-white/30 hover:text-white/60 cursor-pointer transition-colors">
                      {link}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-white/5 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-white/50">
            © {new Date().getFullYear()} Dominex. Todos os direitos reservados. Feito para quem domina o campo.
          </p>
          <p className="text-xs text-white/50">
            Criado por{' '}
            <a
              href="https://auctustech.com.br"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-white/70 hover:text-white transition-colors"
            >
              Auctus
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
