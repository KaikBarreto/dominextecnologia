import { Link } from 'react-router-dom';
import { Play, MapPin, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useScrollReveal } from '@/hooks/useScrollReveal';

export default function HeroSection() {
  const ref = useScrollReveal();

  return (
    <section className="relative min-h-screen flex items-center pt-16 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-[hsl(0,0%,4%)]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(160,100%,39%,0.08)_0%,transparent_70%)]" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'radial-gradient(hsl(0,0%,40%) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      <div ref={ref} className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 lg:py-32 scroll-reveal">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left */}
          <div className="space-y-8">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm text-primary animate-glow-pulse">
              <span>✦</span>
              <span>Mais de 3.000 equipes gerenciadas</span>
            </div>

            <h1 className="text-3xl sm:text-5xl lg:text-7xl font-bold text-white leading-[1.1] tracking-tight">
              Gestão de equipes de campo que realmente{' '}
              <span className="bg-gradient-to-r from-primary to-[hsl(160,80%,55%)] bg-clip-text text-transparent">
                funciona.
              </span>
            </h1>

            <p className="text-lg text-white/50 max-w-xl leading-relaxed">
              Chega de planilha, WhatsApp e retrabalho. O Dominex centraliza suas OS,
              rastreia sua equipe e entrega dados reais para você crescer.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                size="lg"
                className="bg-primary text-primary-foreground hover:bg-primary/90 text-base px-8 py-6 rounded-full shadow-brand-glow animate-[pulse_3s_ease-in-out_infinite] w-full sm:w-auto"
                asChild
              >
                <Link to="/cadastro?origem=Site">Começar grátis por 14 dias</Link>
              </Button>
              <Button
                size="lg"
                variant="ghost"
                className="text-white border border-white/20 hover:bg-white/10 hover:text-white rounded-full px-8 py-6 w-full sm:w-auto"
                asChild
              >
                <a href="#how-it-works">
                  <Play className="h-4 w-4 mr-2" /> Ver demonstração
                </a>
              </Button>
            </div>

            {/* Avatars */}
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                {[
                  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=64&h=64&fit=crop&crop=face',
                  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=64&h=64&fit=crop&crop=face',
                  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=64&h=64&fit=crop&crop=face',
                  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=64&h=64&fit=crop&crop=face',
                  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=64&h=64&fit=crop&crop=face',
                ].map((src, i) => (
                  <img
                    key={i}
                    src={src}
                    alt="Usuário"
                    loading="lazy"
                    className="h-8 w-8 rounded-full border-2 border-[hsl(0,0%,4%)] object-cover"
                  />
                ))}
              </div>
              <span className="text-sm text-white/50">Mais de 3.000 gestores já usam</span>
            </div>
          </div>

          {/* Right — Dashboard mockup */}
          <div className="relative">
            <div className="rounded-2xl border border-white/10 bg-[hsl(0,0%,7%)] p-4 shadow-2xl">
              {/* Topbar */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-[hsl(0,70%,50%)]" />
                  <div className="h-3 w-3 rounded-full bg-[hsl(40,80%,55%)]" />
                  <div className="h-3 w-3 rounded-full bg-primary" />
                </div>
                <div className="h-6 w-48 rounded bg-white/5" />
              </div>

              {/* OS Cards */}
              <div className="space-y-2 mb-4">
                {[
                  { status: 'Aberta', color: 'bg-info' },
                  { status: 'Em andamento', color: 'bg-warning' },
                  { status: 'Concluída', color: 'bg-primary' },
                ].map((os) => (
                  <div key={os.status} className="flex items-center gap-3 rounded-lg bg-white/5 p-3">
                    <div className={`h-2 w-2 rounded-full ${os.color}`} />
                    <div className="flex-1">
                      <div className="h-3 w-32 rounded bg-white/10 mb-1" />
                      <div className="h-2 w-20 rounded bg-white/5" />
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${os.color}/20 text-white/70`}>
                      {os.status}
                    </span>
                  </div>
                ))}
              </div>

              {/* Map placeholder */}
              <div className="rounded-lg bg-white/5 h-32 flex items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_40%,hsl(160,100%,39%,0.1)_0%,transparent_50%)]" />
                <MapPin className="h-5 w-5 text-primary absolute top-6 left-12" />
                <MapPin className="h-5 w-5 text-warning absolute top-10 right-16" />
                <MapPin className="h-5 w-5 text-info absolute bottom-8 left-1/3" />
                <span className="text-xs text-white/20">Mapa em tempo real</span>
              </div>

              {/* Notification */}
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/20 p-2">
                <Bell className="h-4 w-4 text-primary" />
                <span className="text-xs text-primary/80">OS #1042 concluída por João Silva</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
