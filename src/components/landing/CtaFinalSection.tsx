import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function CtaFinalSection() {
  return (
    <section className="relative py-32 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[hsl(0,0%,4%)] via-[hsl(220,60%,8%)] to-[hsl(0,0%,3%)]" />
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: 'radial-gradient(hsl(0,0%,50%) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      />

      <div className="relative mx-auto max-w-3xl px-4 text-center">
        <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6">
          Comece hoje. Resultados em dias.
        </h2>
        <p className="text-lg text-white/40 mb-10 max-w-xl mx-auto">
          14 dias grátis, sem cartão, sem burocracia. Configure em minutos e veja sua equipe ganhar produtividade.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            size="lg"
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-10 py-6 text-base shadow-brand-glow"
            asChild
          >
            <Link to="/cadastro">
              Criar minha conta grátis <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="text-white border border-white/20 hover:bg-white/5 rounded-full px-8 py-6"
          >
            Ou agendar uma demo
          </Button>
        </div>
      </div>
    </section>
  );
}
