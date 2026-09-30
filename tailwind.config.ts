import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        brand: {
          50: "hsl(160 60% 97%)",
          100: "hsl(160 60% 90%)",
          200: "hsl(160 65% 78%)",
          300: "hsl(160 70% 65%)",
          400: "hsl(160 90% 48%)",
          500: "hsl(160 100% 39%)",
          600: "hsl(160 100% 33%)",
          700: "hsl(160 100% 27%)",
          800: "hsl(160 90% 22%)",
          900: "hsl(160 80% 17%)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["Montserrat", "system-ui", "sans-serif"],
      },
      boxShadow: {
        "brand-glow": "0 0 20px -5px hsl(160 100% 39% / 0.3)",
        "card-hover": "0 10px 40px -10px hsl(0 0% 0% / 0.1)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        marquee: {
          "0%": { transform: "translateX(0%)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 0 hsl(var(--primary) / 0.4)" },
          "50%": { boxShadow: "0 0 20px 8px hsl(var(--primary) / 0.15)" },
        },
        "ping-wave": {
          "0%": { transform: "scale(1)", opacity: "0.6" },
          "80%, 100%": { transform: "scale(1.4)", opacity: "0" },
        },
        "ping-wave-sm": {
          "0%": { transform: "scale(1)", opacity: "0.55" },
          "80%, 100%": { transform: "scale(1.12)", opacity: "0" },
        },
        "caret-blink": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        shimmer: "shimmer 2s infinite",
        marquee: "marquee 30s linear infinite",
        "marquee-slow": "marquee 58s linear infinite",
        "marquee-mid": "marquee 44s linear infinite",
        "glow-pulse": "glow-pulse 2s cubic-bezier(0.4,0,0.6,1) infinite",
        "ping-wave": "ping-wave 4s cubic-bezier(0,0,0.2,1) infinite",
        "ping-wave-sm": "ping-wave-sm 4s cubic-bezier(0,0,0.2,1) infinite",
        "caret-blink": "caret-blink 1.1s ease-in-out infinite",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    require("@tailwindcss/typography"),
    // Quiosque de ponto (tablet fixo no balcão): grade de 2 colunas só quando o
    // aparelho está DEITADO e com altura de verdade. `orientation: landscape`
    // sozinho também bate com celular deitado (ex.: 667x375), que deve seguir em
    // coluna única — daí o piso de 600px: um tablet 10" landscape passa de ~800px
    // de altura, celular deitado fica bem abaixo disso.
    //
    // Registrada como VARIANTE (plugin), e NÃO em `theme.extend.screens`: um
    // `screens` contendo objeto `raw` desliga em silêncio TODOS os variants
    // `min-*`/`max-*` do Tailwind 3 (o build avisa, mas não falha). Medido em
    // 30/09/2026 no repo irmão: derrubava os usos de `max-lg:` do CSS gerado.
    //
    // Também NÃO usar a variante arbitrária sem espaços
    // `[@media(orientation:landscape)and(min-height:600px)]` — é CSS INVÁLIDO: o
    // tokenizer lê `)and(` como function-token, a query vira `not all` e nunca
    // casa em browser nenhum.
    plugin(({ addVariant }) => {
      // `&&` (classe duplicada) de propósito: sobe a especificidade pra 0-2-0.
      // Registrada por plugin, esta variante é emitida ANTES do bloco `sm:`
      // (min-width:640px) no CSS final — e um tablet deitado casa com OS DOIS.
      // Sem o bump, `sm:h-[26rem]` venceria `kiosk-landscape:h-[38rem]` só por
      // vir depois na cascata, e a câmera do quiosque ficava no tamanho errado.
      // Medido em 30/09/2026.
      addVariant("kiosk-landscape", "@media (orientation: landscape) and (min-height: 600px) { && }");
    }),
  ],
} satisfies Config;
