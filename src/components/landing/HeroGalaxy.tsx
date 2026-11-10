import { useEffect, useMemo, useRef, type ComponentType, type CSSProperties } from 'react';
import {
  BadgeDollarSign,
  ClipboardCheck,
  ClipboardList,
  LayoutDashboard,
  Map,
  Package,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Users,
} from 'lucide-react';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import './HeroGalaxy.css';

const TAU = Math.PI * 2;
const DESKTOP_ARMS = 6;
const CARD_COUNT = 30;

type GalaxyItem = {
  src: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  accent: string;
};

const ITEMS: GalaxyItem[] = [
  { src: '/guia-tecnico/img/t0-dashboard-completo.jpg', label: 'Painel de gestão', Icon: LayoutDashboard, accent: '#111714' },
  { src: '/guia-tecnico/img/t5-ordens-servico.jpg', label: 'Ordens de serviço', Icon: ClipboardList, accent: '#00C597' },
  { src: '/guia-tecnico/img/t1-integracoes-whatsapp.jpg', label: 'WhatsApp integrado', Icon: WhatsAppIcon, accent: '#25D366' },
  { src: '/guia-tecnico/img/t13-cobrar-modal.jpg', label: 'Cobranças', Icon: BadgeDollarSign, accent: '#0891b2' },
  { src: '/guia-tecnico/img/t8-estoque.jpg', label: 'Estoque', Icon: Package, accent: '#7c3aed' },
  { src: '/guia-tecnico/img/t10-crm.jpg', label: 'CRM e vendas', Icon: TrendingUp, accent: '#2563eb' },
  { src: '/guia-tecnico/img/t6-mapa.jpg', label: 'Equipes no mapa', Icon: Map, accent: '#ea580c' },
  { src: '/guia-tecnico/img/t14-notas-fiscais.jpg', label: 'Notas fiscais', Icon: Receipt, accent: '#dc2626' },
  { src: '/guia-tecnico/img/t15-ponto-hoje.jpg', label: 'Ponto e equipe', Icon: Users, accent: '#ca8a04' },
  { src: '/guia-tecnico/img/t11-wizard-pmoc-unidade.jpg', label: 'PMOC', Icon: ClipboardCheck, accent: '#0d9488' },
  { src: '/guia-tecnico/img/t16-checkout.jpg', label: 'Checkout e planos', Icon: ShoppingCart, accent: '#db2777' },
  { src: '/guia-tecnico/img/t9-orcamentos.jpg', label: 'Orçamentos', Icon: Receipt, accent: '#4f46e5' },
];

function smoothstep(min: number, max: number, value: number) {
  const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return normalized * normalized * (3 - 2 * normalized);
}

function easeOutCubic(value: number) {
  const clamped = Math.max(0, Math.min(1, value));
  return 1 - Math.pow(1 - clamped, 3);
}

function spiralPath(arm: number, arms: number) {
  return Array.from({ length: 90 }, (_, index) => {
    const progress = index / 89;
    const angle = arm * (TAU / arms) + progress * TAU * 1.08;
    const radiusX = 36 + progress * 900;
    const radiusY = 24 + progress * 590;
    const x = Math.cos(angle) * radiusX;
    const y = Math.sin(angle) * radiusY;
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

export default function HeroGalaxy() {
  const rootRef = useRef<HTMLDivElement>(null);
  const guidesRef = useRef<SVGSVGElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const cards = useMemo(
    () => Array.from({ length: CARD_COUNT }, (_, index) => ITEMS[(index * 5 + Math.floor(index / 6)) % ITEMS.length]),
    [],
  );
  const paths = useMemo(
    () => Array.from({ length: DESKTOP_ARMS }, (_, arm) => spiralPath(arm, DESKTOP_ARMS)),
    [],
  );

  useEffect(() => {
    const root = rootRef.current;
    const hero = root?.closest<HTMLElement>('[data-dominex-home-hero]');
    if (!root || !hero) return;

    const pointer = { x: 0, y: 0, active: false };
    const ripple = { x: 0, y: 0, startedAt: -10 };
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let last = performance.now();
    let phase = 0.12;
    let spin = 0;
    let introTime = reducedMotion.matches ? 10 : 0;
    let introRate = 1;
    let scrollImpulse = 0;
    let lastScrollY = window.scrollY;
    let visible = true;

    const fastForwardIntro = () => {
      if (introTime < 5) introRate = 4;
    };

    const updatePointer = (event: PointerEvent) => {
      const bounds = root.getBoundingClientRect();
      pointer.x = event.clientX - bounds.left - bounds.width / 2;
      pointer.y = event.clientY - bounds.top - bounds.height / 2;
      pointer.active = event.pointerType !== 'touch';
    };

    const leavePointer = () => {
      pointer.active = false;
    };

    const accelerateFromScroll = () => {
      const nextScrollY = window.scrollY;
      const delta = nextScrollY - lastScrollY;
      lastScrollY = nextScrollY;
      scrollImpulse = Math.max(-4.8, Math.min(4.8, scrollImpulse - delta * 0.008));
      if (Math.abs(delta) > 1) fastForwardIntro();
    };

    const startRipple = (event: PointerEvent) => {
      if ((event.target as HTMLElement).closest('a, button')) return;
      updatePointer(event);
      fastForwardIntro();
      ripple.x = pointer.x;
      ripple.y = pointer.y;
      ripple.startedAt = performance.now();
    };

    const render = (now: number, animate = true) => {
      const width = root.clientWidth;
      const height = root.clientHeight;
      const mobile = width < 700;
      const arms = mobile ? 3 : DESKTOP_ARMS;
      const activeCount = mobile ? 12 : cards.length;
      const rawElapsed = Math.max(0, (now - last) / 1000);
      const elapsed = Math.min(0.05, rawElapsed);
      last = now;

      if (!reducedMotion.matches) introTime += rawElapsed * introRate;

      const cardsTime = introTime - 0.42;
      const rollout = easeOutCubic(cardsTime / 3.15);
      const burst = 1 + 2 * (1 - easeOutCubic(cardsTime / 2.2));
      const guideIntro = smoothstep(0, 1, (introTime - 0.24) / 1.05);

      if (animate && !reducedMotion.matches && !document.hidden && visible) {
        const impulseStrength = Math.abs(scrollImpulse);
        phase = (phase + elapsed * (1 / 52 + impulseStrength * 0.012) * (cardsTime > 0 ? burst : 1)) % 1;
        spin -= elapsed * 0.018;
        spin += elapsed * scrollImpulse;
        scrollImpulse *= Math.exp(-elapsed * 3.6);
      }

      if (guidesRef.current) {
        guidesRef.current.style.opacity = String(0.82 * guideIntro);
        guidesRef.current.style.transform = `rotate(${(spin * 0.78).toFixed(4)}rad) scale(1.03)`;
      }

      const outerX = width * (mobile ? 0.86 : 0.72);
      const outerY = height * (mobile ? 0.73 : 0.78);
      const slotsPerArm = Math.ceil(activeCount / arms);
      const rippleAge = (now - ripple.startedAt) / 1000;

      cardRefs.current.forEach((card, index) => {
        if (!card) return;
        if (index >= activeCount) {
          card.style.display = 'none';
          return;
        }
        card.style.display = 'block';

        const arm = index % arms;
        const slot = Math.floor(index / arms);
        const offset = (arm * 0.137 + (index % 5) * 0.019) % 1;
        const progress = (slot / slotsPerArm + phase + offset) % 1;
        const angle = arm * (TAU / arms) + progress * TAU * 1.08 + spin;
        const radiusX = 24 + progress * outerX;
        const radiusY = 18 + progress * outerY;
        let x = Math.cos(angle) * radiusX;
        let y = Math.sin(angle) * radiusY;

        const radialPosition = Math.max(0, Math.min(1.2, Math.hypot(x / outerX, y / outerY)));
        const waveRadius = rollout * 1.42;
        const revealStagger = ((index * 0.61803398875) % 1) * 0.075;
        const waveReveal = cardsTime >= 0 ? smoothstep(0, 0.21, waveRadius - radialPosition - revealStagger) : 0;
        const revealEase = easeOutCubic(waveReveal);
        const rolloutPosition = 0.8 + revealEase * 0.2;
        x *= rolloutPosition;
        y *= rolloutPosition;

        const pointerDistance = Math.hypot(pointer.x - x, pointer.y - y);
        const pointerField = pointer.active ? Math.exp(-(pointerDistance * pointerDistance) / 52000) : 0;
        x += (pointer.x - x) * pointerField * 0.055;
        y += (pointer.y - y) * pointerField * 0.055;

        const distanceFromRipple = Math.hypot(x - ripple.x, y - ripple.y);
        const rippleRadius = Math.max(0, rippleAge) * 620;
        const rippleBand = rippleAge > 0 && rippleAge < 1.45
          ? Math.exp(-Math.pow((distanceFromRipple - rippleRadius) / 95, 2)) * (1 - rippleAge / 1.45)
          : 0;

        const birth = smoothstep(0.015, 0.15, progress);
        const death = 1 - smoothstep(0.86, 1, progress);
        const opacity = Math.min(1, birth * death * (0.42 + progress * 0.58) * waveReveal);
        const blur = Math.max((1 - smoothstep(0.04, 0.34, progress)) * 12, (1 - revealEase) * 18);
        const scale = (0.42 + smoothstep(0.03, 0.84, progress) * 0.75 + pointerField * 0.045 + rippleBand * 0.13) * (0.86 + revealEase * 0.14);
        const tiltX = pointerField * (pointer.y - y) * -0.012;
        const tiltY = pointerField * (pointer.x - x) * 0.014;
        const drift = Math.sin(now / 1250 + index * 1.73) * (2 + progress * 3);

        card.style.opacity = opacity.toFixed(3);
        card.style.filter = `blur(${blur.toFixed(2)}px) saturate(${(1.02 + progress * 0.08).toFixed(2)})`;
        card.style.zIndex = String(10 + Math.round(progress * 100));
        card.style.transform = `translate3d(calc(-50% + ${(x + drift).toFixed(1)}px), calc(-50% + ${(y - drift * 0.35).toFixed(1)}px), 0) perspective(700px) rotateX(${tiltX.toFixed(2)}deg) rotateY(${tiltY.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
      });

      if (animate) frame = requestAnimationFrame((time) => render(time));
    };

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    }, { rootMargin: '200px 0px' });

    observer.observe(root);
    hero.addEventListener('pointermove', updatePointer);
    hero.addEventListener('pointerleave', leavePointer);
    hero.addEventListener('pointercancel', leavePointer);
    hero.addEventListener('pointerdown', startRipple);
    window.addEventListener('scroll', accelerateFromScroll, { passive: true });
    window.addEventListener('keydown', fastForwardIntro);
    render(last, !reducedMotion.matches);

    const handleMotionChange = () => {
      cancelAnimationFrame(frame);
      last = performance.now();
      render(last, !reducedMotion.matches);
    };
    reducedMotion.addEventListener('change', handleMotionChange);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      hero.removeEventListener('pointermove', updatePointer);
      hero.removeEventListener('pointerleave', leavePointer);
      hero.removeEventListener('pointercancel', leavePointer);
      hero.removeEventListener('pointerdown', startRipple);
      window.removeEventListener('scroll', accelerateFromScroll);
      window.removeEventListener('keydown', fastForwardIntro);
      reducedMotion.removeEventListener('change', handleMotionChange);
    };
  }, [cards]);

  return (
    <div className="dominex-hero-galaxy" ref={rootRef} aria-hidden="true">
      <svg
        className="dominex-hero-galaxy-guides"
        ref={guidesRef}
        viewBox="-800 -500 1600 1000"
        preserveAspectRatio="none"
      >
        <circle r="185" />
        <circle r="345" />
        {paths.map((path, index) => <path d={path} key={index} />)}
      </svg>
      <div className="dominex-hero-galaxy-cards">
        {cards.map((item, index) => {
          const Icon = item.Icon;
          return (
            <div
              className="dominex-hero-galaxy-card"
              ref={(element) => { cardRefs.current[index] = element; }}
              key={`${item.src}-${index}`}
              style={{ '--card-accent': item.accent } as CSSProperties}
            >
              <img src={item.src} alt="" loading={index < 18 ? 'eager' : 'lazy'} decoding="async" />
              <span className="dominex-hero-galaxy-badge">
                <Icon className="dominex-hero-galaxy-icon" />
              </span>
              <span className="sr-only">{item.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
