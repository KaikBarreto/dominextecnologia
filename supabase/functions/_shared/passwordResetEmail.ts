// HTML template para email de recuperação de senha — tema escuro Dominex
// Cor primária: #00C77F (hsl 160 100% 39%)
// Logo: mesmo arquivo da tela de login (src/assets/logo-horizontal-verde.png),
// copiado também em public/ para ficar acessível via URL pública

const APP_BASE_URL = 'https://www.dominex.app';

function buildResetUrl(email: string, code: string): string {
  const params = new URLSearchParams({ email, code });
  return `${APP_BASE_URL}/reset-password?${params.toString()}`;
}

export function renderPasswordResetEmail(opts: {
  email: string;
  code: string;
  expiresMinutes: number;
}): string {
  const formattedCode = opts.code.split('').join(' ');
  const resetUrl = buildResetUrl(opts.email, opts.code);
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting">
<title>Código de Recuperação — Dominex</title>
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
          <h1 style="margin:0 0 16px 0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">RECUPERAÇÃO DE SENHA</h1>
          <p style="margin:0;color:rgba(255,255,255,0.7);font-size:14px;line-height:1.6;">
            Você solicitou a recuperação da sua senha. Use o código abaixo para continuar o processo:
          </p>
        </td>
      </tr>

      <tr>
        <td style="padding:24px 40px 16px 40px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:linear-gradient(135deg,#00C77F 0%,#10b981 100%);border-radius:12px;">
            <tr>
              <td style="padding:32px 24px;text-align:center;">
                <div style="color:#ffffff;font-size:11px;font-weight:600;letter-spacing:3px;text-transform:uppercase;margin-bottom:12px;opacity:0.9;">SEU CÓDIGO DE VERIFICAÇÃO</div>
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
                  REDEFINIR SENHA AGORA →
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 0 0 0;text-align:center;">
                <p style="margin:0;color:rgba(255,255,255,0.5);font-size:11px;line-height:1.5;">
                  Clique no botão acima e a recuperação será validada automaticamente.
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
              Este código expira em <strong style="color:#fff;">${opts.expiresMinutes} minutos</strong>.
            </p>
            <p style="margin:0;color:rgba(255,255,255,0.55);font-size:12px;line-height:1.5;">
              <span style="display:inline-block;width:8px;height:8px;border-radius:2px;border:1px solid rgba(255,255,255,0.3);margin-right:10px;vertical-align:middle;"></span>
              Se você não solicitou esta recuperação, ignore este email.
            </p>
          </div>
        </td>
      </tr>

      <tr>
        <td style="padding:24px 40px 32px 40px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);background:#000;">
          <p style="margin:0;color:rgba(255,255,255,0.4);font-size:11px;letter-spacing:1px;text-transform:uppercase;">
            © ${new Date().getFullYear()} Dominex • Todos os direitos reservados
          </p>
        </td>
      </tr>

    </table>
  </div>
</body>
</html>`;
}

export function renderPasswordResetText(opts: { email: string; code: string; expiresMinutes: number }): string {
  const resetUrl = buildResetUrl(opts.email, opts.code);
  return `Recuperação de Senha — Dominex

Você solicitou a recuperação da sua senha.
Seu código:

  ${opts.code}

Ou redefina diretamente em:
  ${resetUrl}

Este código expira em ${opts.expiresMinutes} minutos.
Se você não solicitou esta recuperação, ignore este email.

© ${new Date().getFullYear()} Dominex`;
}
