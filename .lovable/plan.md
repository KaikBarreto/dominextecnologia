

## Plano: Transformar Dominex em PWA + Botão de Refresh no Footer

### 1. Instalar dependência `vite-plugin-pwa`
- Adicionar `vite-plugin-pwa` como dev dependency

### 2. Criar ícones PWA
- Copiar a imagem enviada (`foto_perfil.jpg`) para `public/icons/` como base
- Criar referências para os tamanhos necessários (72, 96, 128, 144, 152, 192, 384, 512) — usaremos a mesma imagem como `icon-192x192.png` e `icon-512x512.png` (os demais tamanhos serão referenciados mas usarão o mesmo arquivo como fallback)

### 3. Criar `public/manifest.json`
- Conforme especificado pelo usuário, com ícones, shortcuts, cores, etc.

### 4. Criar `public/offline.html`
- Página simples de fallback offline com branding Dominex

### 5. Atualizar `vite.config.ts`
- Adicionar `VitePWA` plugin com configuração de workbox, runtime caching para Supabase e Google Fonts
- Adicionar `navigateFallbackDenylist: [/^\/~oauth/]` conforme instruções obrigatórias

### 6. Criar `src/lib/pwa.ts`
- Registro do service worker
- Helpers para notificações push e conversão base64

### 7. Atualizar `src/main.tsx`
- Chamar `registerServiceWorker()` no bootstrap

### 8. Atualizar `index.html`
- Adicionar meta tags PWA (manifest, theme-color, apple-mobile-web-app, etc.)

### 9. Criar componentes PWA
- **`src/components/pwa/UpdateBanner.tsx`** — banner de atualização disponível
- **`src/components/pwa/InstallBanner.tsx`** — banner de instalação na tela inicial
- **`src/components/pwa/OfflineIndicator.tsx`** — indicador de status offline

### 10. Atualizar `SystemFooter.tsx`
- Adicionar ícone RefreshCw à esquerda da versão (padrão EcoSistema)
- Ao clicar: limpa CacheStorage, unregistra service workers, limpa localStorage/sessionStorage, faz hard reload

### 11. Integrar componentes PWA no `App.tsx`
- Adicionar `UpdateBanner`, `InstallBanner` e `OfflineIndicator` no layout principal

### Resumo de arquivos

| Ação | Arquivo |
|------|---------|
| Criar | `public/manifest.json` |
| Criar | `public/offline.html` |
| Copiar | `user-uploads://foto_perfil.jpg` → `public/icons/icon-512x512.png` (+ aliases) |
| Criar | `src/lib/pwa.ts` |
| Criar | `src/components/pwa/UpdateBanner.tsx` |
| Criar | `src/components/pwa/InstallBanner.tsx` |
| Criar | `src/components/pwa/OfflineIndicator.tsx` |
| Editar | `vite.config.ts` (adicionar VitePWA) |
| Editar | `src/main.tsx` (registrar SW) |
| Editar | `index.html` (meta tags PWA) |
| Editar | `src/components/layout/SystemFooter.tsx` (botão refresh) |
| Editar | `src/App.tsx` (integrar componentes PWA) |
| Instalar | `vite-plugin-pwa` |

**Nota:** O service worker será gerado automaticamente pelo `vite-plugin-pwa` (workbox) em vez de criar `public/sw.js` manualmente — isso é mais robusto e production-ready. As estratégias de cache (NetworkFirst para Supabase, CacheFirst para fonts/assets) serão configuradas via `runtimeCaching` no plugin. O IndexedDB offline e push notifications ficam como hooks prontos para uso futuro (sem tabela `push_subscriptions` por agora, pois precisaria de VAPID key).

