// HTML template para email de recuperação de senha — tema escuro Dominex
// Cor primária: #00C77F (hsl 160 100% 39%)
// Logo: mesmo arquivo da tela de login (src/assets/logo-horizontal-verde.png),
// copiado também em public/ para ficar acessível via URL pública

const APP_BASE_URL = 'https://www.dominex.app';

// ---------------------------------------------------------------------------
// Dicionário i18n inline — 4 idiomas suportados pelo app
// Fallback sempre 'pt-br'. Traduções semânticas (não palavra-a-palavra).
// ATENÇÃO: apóstrofos em fr usam ' (U+2019) para não fechar template literals.
// ---------------------------------------------------------------------------
type Locale = 'pt-br' | 'en' | 'es' | 'fr';

interface EmailStrings {
  subject: string;
  htmlLang: string;
  heading: string;
  intro: string;
  codeLabel: string;
  ctaButton: string;
  ctaNote: string;
  expiryLine: (minutes: number) => string;
  ignoreLine: string;
  footer: (year: number) => string;
  textTitle: string;
  textIntro: string;
  textCodeLabel: string;
  textOrLink: string;
  textExpiry: (minutes: number) => string;
  textIgnore: string;
}

const I18N: Record<Locale, EmailStrings> = {
  'pt-br': {
    subject: 'Código de Recuperação de Senha — Dominex',
    htmlLang: 'pt-BR',
    heading: 'RECUPERAÇÃO DE SENHA',
    intro: 'Você solicitou a recuperação da sua senha. Use o código abaixo para continuar o processo:',
    codeLabel: 'SEU CÓDIGO DE VERIFICAÇÃO',
    ctaButton: 'REDEFINIR SENHA AGORA →',
    ctaNote: 'Clique no botão acima e a recuperação será validada automaticamente.',
    expiryLine: (m) => `Este código expira em <strong style="color:#fff;">${m} minutos</strong>.`,
    ignoreLine: 'Se você não solicitou esta recuperação, ignore este email.',
    footer: (y) => `© ${y} Dominex • Todos os direitos reservados`,
    textTitle: 'Recuperação de Senha — Dominex',
    textIntro: 'Você solicitou a recuperação da sua senha.',
    textCodeLabel: 'Seu código:',
    textOrLink: 'Ou redefina diretamente em:',
    textExpiry: (m) => `Este código expira em ${m} minutos.`,
    textIgnore: 'Se você não solicitou esta recuperação, ignore este email.',
  },
  en: {
    subject: 'Password Recovery Code — Dominex',
    htmlLang: 'en',
    heading: 'PASSWORD RECOVERY',
    intro: 'You requested a password reset. Use the code below to continue:',
    codeLabel: 'YOUR VERIFICATION CODE',
    ctaButton: 'RESET PASSWORD NOW →',
    ctaNote: 'Click the button above and your password reset will be validated automatically.',
    expiryLine: (m) => `This code expires in <strong style="color:#fff;">${m} minutes</strong>.`,
    ignoreLine: 'If you did not request this, please ignore this email.',
    footer: (y) => `© ${y} Dominex • All rights reserved`,
    textTitle: 'Password Recovery — Dominex',
    textIntro: 'You requested a password reset.',
    textCodeLabel: 'Your code:',
    textOrLink: 'Or reset directly at:',
    textExpiry: (m) => `This code expires in ${m} minutes.`,
    textIgnore: 'If you did not request this, please ignore this email.',
  },
  es: {
    subject: 'Código de recuperación de contraseña — Dominex',
    htmlLang: 'es',
    heading: 'RECUPERACIÓN DE CONTRASEÑA',
    intro: 'Solicitaste recuperar tu contraseña. Usa el código a continuación para continuar:',
    codeLabel: 'TU CÓDIGO DE VERIFICACIÓN',
    ctaButton: 'RESTABLECER CONTRASEÑA AHORA →',
    ctaNote: 'Haz clic en el botón y la recuperación se validará automáticamente.',
    expiryLine: (m) => `Este código expira en <strong style="color:#fff;">${m} minutos</strong>.`,
    ignoreLine: 'Si no solicitaste esto, ignora este correo.',
    footer: (y) => `© ${y} Dominex • Todos los derechos reservados`,
    textTitle: 'Recuperación de contraseña — Dominex',
    textIntro: 'Solicitaste recuperar tu contraseña.',
    textCodeLabel: 'Tu código:',
    textOrLink: 'O restablece directamente en:',
    textExpiry: (m) => `Este código expira en ${m} minutos.`,
    textIgnore: 'Si no solicitaste esto, ignora este correo.',
  },
  fr: {
    subject: 'Code de récupération de mot de passe — Dominex',
    htmlLang: 'fr',
    heading: 'RÉCUPÉRATION DE MOT DE PASSE',
    intro: 'Vous avez demandé la récupération de votre mot de passe. Utilisez le code ci-dessous pour continuer:',
    codeLabel: 'VOTRE CODE DE VÉRIFICATION',
    ctaButton: 'RÉINITIALISER LE MOT DE PASSE →',
    ctaNote: 'Cliquez sur le bouton ci-dessus et la récupération sera validée automatiquement.',
    expiryLine: (m) => `Ce code expire dans <strong style="color:#fff;">${m} minutes</strong>.`,
    ignoreLine: 'Si vous n’avez pas fait cette demande, ignorez cet e-mail.',
    footer: (y) => `© ${y} Dominex • Tous droits réservés`,
    textTitle: 'Récupération de mot de passe — Dominex',
    textIntro: 'Vous avez demandé la récupération de votre mot de passe.',
    textCodeLabel: 'Votre code:',
    textOrLink: 'Ou réinitialisez directement à:',
    textExpiry: (m) => `Ce code expire dans ${m} minutes.`,
    textIgnore: 'Si vous n’avez pas fait cette demande, ignorez cet e-mail.',
  },
};

function resolveLocale(locale?: string): Locale {
  if (locale && locale in I18N) return locale as Locale;
  return 'pt-br';
}

// Exportado para uso em request-password-reset (montagem do subject)
export function getPasswordResetSubject(locale?: string): string {
  return I18N[resolveLocale(locale)].subject;
}

function buildResetUrl(email: string, code: string): string {
  const params = new URLSearchParams({ email, code });
  return `${APP_BASE_URL}/reset-password?${params.toString()}`;
}

export function renderPasswordResetEmail(opts: {
  email: string;
  code: string;
  expiresMinutes: number;
}, locale?: string): string {
  const t = I18N[resolveLocale(locale)];
  const formattedCode = opts.code.split('').join(' ');
  const resetUrl = buildResetUrl(opts.email, opts.code);
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="${t.htmlLang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting">
<title>${t.subject}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,sans-serif;">
  <div style="background:#0a0a0a;padding:40px 20px;min-height:100vh;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="600" style="max-width:600px;width:100%;background:linear-gradient(180deg,#0d0d0d 0%,#1a1a1a 100%);border-radius:16px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.5);">

      <tr>
        <td style="padding:40px 40px 24px 40px;text-align:center;background:#000;border-bottom:1px solid rgba(255,255,255,0.06);">
          <img src="${APP_BASE_URL}/logo-horizontal-verde.png" alt="Dominex" width="180" style="max-width:180px;height:auto;display:inline-block;">
        </td>
      </tr>

      <tr>
        <td style="padding:40px 40px 16px 40px;">
          <h1 style="margin:0 0 16px 0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">${t.heading}</h1>
          <p style="margin:0;color:rgba(255,255,255,0.7);font-size:14px;line-height:1.6;">
            ${t.intro}
          </p>
        </td>
      </tr>

      <tr>
        <td style="padding:24px 40px 16px 40px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:linear-gradient(135deg,#00C77F 0%,#10b981 100%);border-radius:12px;">
            <tr>
              <td style="padding:32px 24px;text-align:center;">
                <div style="color:#ffffff;font-size:11px;font-weight:600;letter-spacing:3px;text-transform:uppercase;margin-bottom:12px;opacity:0.9;">${t.codeLabel}</div>
                <div style="color:#ffffff;font-size:36px;font-weight:800;letter-spacing:8px;font-family:'SF Mono',Monaco,Menlo,Consolas,monospace;user-select:all;-webkit-user-select:all;">
                  ${formattedCode}
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- CTA primario: redefinir senha agora -->
      <tr>
        <td style="padding:8px 40px 24px 40px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td style="text-align:center;padding:8px 0;">
                <a href="${resetUrl}" style="display:inline-block;padding:14px 32px;background:#00C77F;border-radius:10px;color:#ffffff;font-size:14px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;text-decoration:none;box-shadow:0 4px 16px rgba(0,199,127,0.3);">
                  ${t.ctaButton}
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 0 0 0;text-align:center;">
                <p style="margin:0;color:rgba(255,255,255,0.5);font-size:11px;line-height:1.5;">
                  ${t.ctaNote}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <tr>
        <td style="padding:0 40px 32px 40px;">
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:16px 18px;">
            <p style="margin:0 0 10px 0;color:rgba(255,255,255,0.85);font-size:13px;line-height:1.5;">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#00C77F;margin-right:10px;vertical-align:middle;"></span>
              ${t.expiryLine(opts.expiresMinutes)}
            </p>
            <p style="margin:0;color:rgba(255,255,255,0.55);font-size:12px;line-height:1.5;">
              <span style="display:inline-block;width:8px;height:8px;border-radius:2px;border:1px solid rgba(255,255,255,0.3);margin-right:10px;vertical-align:middle;"></span>
              ${t.ignoreLine}
            </p>
          </div>
        </td>
      </tr>

      <tr>
        <td style="padding:24px 40px 32px 40px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);background:#000;">
          <p style="margin:0;color:rgba(255,255,255,0.4);font-size:11px;letter-spacing:1px;text-transform:uppercase;">
            ${t.footer(year)}
          </p>
        </td>
      </tr>

    </table>
  </div>
</body>
</html>`;
}

export function renderPasswordResetText(opts: { email: string; code: string; expiresMinutes: number }, locale?: string): string {
  const t = I18N[resolveLocale(locale)];
  const resetUrl = buildResetUrl(opts.email, opts.code);
  const year = new Date().getFullYear();
  return `${t.textTitle}

${t.textIntro}
${t.textCodeLabel}

  ${opts.code}

${t.textOrLink}
  ${resetUrl}

${t.textExpiry(opts.expiresMinutes)}
${t.textIgnore}

${t.footer(year)}`;
}
