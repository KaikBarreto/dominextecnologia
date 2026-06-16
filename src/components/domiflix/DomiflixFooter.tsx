import { Link } from "react-router-dom";
import logoWhite from "@/assets/logo-white-horizontal.png";
import { SystemFooter } from "@/components/layout/SystemFooter";

// Redes sociais — adicionar novos perfis aqui (label + href + Icon).
// YouTube fica pra depois; quando tiver canal, é só acrescentar um item.
// Se ficar vazio, a linha de redes não é renderizada.
type SocialLink = { label: string; href: string; Icon: () => JSX.Element };
const SOCIAL_LINKS: SocialLink[] = [
  {
    label: "Instagram",
    href: "https://instagram.com/dominex.app",
    Icon: () => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
];

type FooterLink = { label: string; to: string; external?: boolean };

const LINKS: FooterLink[] = [
  { label: "Privacidade", to: "/privacidade" },
  { label: "Termos de Uso", to: "/termos" },
];

export function DomiflixFooter() {
  return (
    <footer className="bg-[#141414] text-white/50 pt-14 pb-[calc(env(safe-area-inset-bottom,0px)+5rem)] lg:pb-6 px-4 sm:px-8 md:px-16 border-t border-white/[0.07]">
      <div className="max-w-5xl mx-auto md:mx-0">
        {/* Top: Logo+redes (esquerda) | Menu (direita), alinhados verticalmente */}
        <div className="flex flex-col items-center text-center gap-8 md:flex-row md:items-start md:text-left md:justify-between md:gap-10 mb-10">
          {/* Bloco da marca: logo + redes */}
          <div className="flex flex-col items-center md:items-start gap-5">
            <Link to="/domiflix" className="inline-block">
              <img
                src={logoWhite}
                alt="Domiflix"
                className="h-9 w-auto object-contain opacity-90 hover:opacity-100 transition-opacity"
              />
            </Link>

            {/* Redes sociais — ocultas até SOCIAL_LINKS ter itens */}
            {SOCIAL_LINKS.length > 0 && (
              <div className="flex items-center gap-5">
                {SOCIAL_LINKS.map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={s.label}
                    className="text-white hover:text-white/70 transition-colors"
                  >
                    <s.Icon />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Links do menu */}
          <div className="flex flex-col gap-2 text-[13px] items-center md:items-start">
            {LINKS.map((link) =>
              link.external ? (
                <a
                  key={link.label}
                  href={link.to}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white/80 transition-colors leading-none py-0.5 w-fit"
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.label}
                  to={link.to}
                  className="hover:text-white/80 transition-colors leading-none py-0.5 w-fit"
                >
                  {link.label}
                </Link>
              ),
            )}
          </div>
        </div>
      </div>

      {/* Copyright do sistema (versão, desenvolvido por Auctus, etc.) */}
      <div className="mt-4">
        <SystemFooter variant="dark" />
      </div>
    </footer>
  );
}
