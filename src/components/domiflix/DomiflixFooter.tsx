import { Link } from "react-router-dom";
import logoWhite from "@/assets/logo-white-horizontal.png";

const LINKS = [
  { label: "Privacidade", to: "/privacidade" },
  { label: "Termos de Uso", to: "/termos" },
];

export function DomiflixFooter() {
  return (
    <footer className="bg-[#141414] text-white/50 pt-14 pb-6 px-4 sm:px-8 md:px-16 border-t border-white/[0.07]">
      <div className="max-w-5xl mx-auto md:mx-0">
        <div className="flex flex-col items-center text-center gap-8 md:flex-row md:items-start md:text-left md:justify-between md:gap-10 mb-10">
          <Link to="/domiflix" className="inline-block">
            <img src={logoWhite} alt="Domiflix" className="h-9 w-auto object-contain opacity-90 hover:opacity-100 transition-opacity" />
          </Link>

          <div className="flex flex-col gap-2 text-[13px] items-center md:items-start">
            {LINKS.map((link) => (
              <Link key={link.label} to={link.to} className="hover:text-white/80 transition-colors leading-none py-0.5 w-fit">
                {link.label}
              </Link>
            ))}
          </div>
        </div>
        <p className="text-white/30 text-xs text-center md:text-left">
          © {new Date().getFullYear()} Dominex. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  );
}
