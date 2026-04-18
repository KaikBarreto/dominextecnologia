import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import logoWhite from '@/assets/logo-horizontal-verde.png';

const navLinks = [
  { label: 'Plataforma', href: '#features', id: 'features' },
  { label: 'Recursos', href: '#how-it-works', id: 'how-it-works' },
  { label: 'Segmentos', href: '#segments', id: 'segments' },
  { label: 'Preços', href: '#pricing', id: 'pricing' },
];

export default function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeId, setActiveId] = useState<string>('');

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 25);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Track active section: pick the last section whose top has crossed the header line
  useEffect(() => {
    const updateActive = () => {
      const offset = 120; // header height + small buffer
      let current = '';
      for (const link of navLinks) {
        const el = document.getElementById(link.id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top - offset <= 0) {
          current = link.id;
        } else {
          break;
        }
      }
      setActiveId(current);
    };

    updateActive();
    window.addEventListener('scroll', updateActive, { passive: true });
    window.addEventListener('resize', updateActive);
    return () => {
      window.removeEventListener('scroll', updateActive);
      window.removeEventListener('resize', updateActive);
    };
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-[hsl(0,0%,5%)]/90 backdrop-blur-xl border-b border-white/5' : 'bg-transparent'
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <img src={logoWhite} alt="Dominex" className="h-10 w-auto" />
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((l) => {
              const isActive = activeId === l.id;
              return (
                <a
                  key={l.href}
                  href={l.href}
                  className={cn(
                    'relative text-sm transition-colors py-1',
                    isActive ? 'text-white font-medium' : 'text-white/60 hover:text-white'
                  )}
                >
                  {l.label}
                  <span
                    className={cn(
                      'absolute left-0 right-0 -bottom-1 h-[2px] rounded-full bg-primary transition-all duration-300',
                      isActive ? 'opacity-100 scale-x-100' : 'opacity-0 scale-x-0'
                    )}
                  />
                </a>
              );
            })}
          </div>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-3">
            <Button variant="ghost" className="text-white border border-white/20 hover:bg-white/10 hover:text-white gap-2" asChild>
              <Link to="/login">
                <LogIn className="h-4 w-4" />
                Entrar
              </Link>
            </Button>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" asChild>
              <Link to="/cadastro">Criar Conta</Link>
            </Button>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden text-white"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden bg-[hsl(0,0%,5%)]/95 backdrop-blur-xl border-t border-white/5 px-4 pb-6 pt-2">
          {navLinks.map((l) => {
            const isActive = activeId === l.id;
            return (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'block py-3 text-sm border-b border-white/5 transition-colors',
                  isActive ? 'text-white font-medium border-l-2 border-l-primary pl-3' : 'text-white/70 hover:text-white'
                )}
              >
                {l.label}
              </a>
            );
          })}
          <div className="mt-4 flex flex-col gap-3">
            <Button variant="ghost" className="w-full text-white border border-white/20 hover:bg-white/10 hover:text-white gap-2" asChild>
              <Link to="/login">
                <LogIn className="h-4 w-4" />
                Entrar
              </Link>
            </Button>
            <Button className="w-full bg-primary text-primary-foreground" asChild>
              <Link to="/cadastro">Criar Conta</Link>
            </Button>
          </div>
        </div>
      )}
    </nav>
  );
}
