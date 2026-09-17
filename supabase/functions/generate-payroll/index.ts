import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCors } from '../_shared/cors.ts'

// ─── Fuso por EMPRESA ────────────────────────────────────────────────────────
//
// POR QUE ISTO EXISTE
// -------------------
// Esta function não lia fuso em camada nenhuma, nem aqui no JS nem na RPC SQL.
// Ela acertava por COINCIDÊNCIA: o cron roda às 07:00 UTC (`0 7 * * *`, ver
// 20260426020000_payroll_cron_schedule.sql), que é 02:00 a 05:00 da manhã em
// qualquer fuso do Brasil (UTC-2 a UTC-5). Nessa faixa, a data UTC e a data
// local da empresa coincidem, então a janela saía certa sem ninguém ter
// desenhado pra isso.
//
// O QUE ACONTECE SE O HORÁRIO DO CRON MUDAR
// -----------------------------------------
// A coincidência some. Exemplo concreto: cron às 01:00 UTC. Em Cuiabá (UTC-4)
// ainda são 21:00 do dia ANTERIOR, então a data local é D-1 enquanto o
// Postgres vê D. No outro sentido, cron às 22:00 UTC com a empresa cadastrada
// em `Asia/Calcutta` (UTC+5:30, já existe uma na base) coloca a data local em
// D+1 enquanto o Postgres ainda vê D. Nos dois casos a janela de geração fica
// deslocada um dia, calada.
//
// COMO PASSOU A RESOLVER
// ----------------------
// Os funcionários são agrupados POR EMPRESA, e cada empresa resolve o próprio
// dia a partir de `company_settings.timezone`. A diferença em dias entre o dia
// local da empresa e o dia que o Postgres vai enxergar vira compensação no
// `p_lookahead_days`, de modo que a janela termine sempre em
// "hoje-na-empresa + 35 dias", e não em "hoje-no-servidor + 35 dias".
//
// O DIA VAI EXPLÍCITO PRA RPC
// ---------------------------
// `generate_payroll_for_employee` abria a janela em `CURRENT_DATE` chumbado, e
// o lookahead só mexia no FIM da janela: com drift = -1, uma folha que vence
// exatamente hoje-na-empresa ficava pra rodada seguinte. A migration
// 20260918120000 criou a sobrecarga `(uuid, integer, date)`, e é ela que
// recebe `p_today` com o dia local da empresa. A assinatura de 2 argumentos
// virou wrapper de compatibilidade e continua valendo.
//
// ⚠️ ORDEM DE DEPLOY: a migration precisa estar APLICADA antes desta edge subir.
// Sem ela, a chamada com `p_today` não encontra a função e a folha para.
//
// Funcionário SEM empresa continua chamando a assinatura de 2 argumentos: sem
// empresa não há fuso pra resolver, então `CURRENT_DATE` é o melhor palpite.
//
// `en-CA` no formatador não é estilo: é o único locale que o Intl formata
// exatamente como ISO YYYY-MM-DD. Fuso inválido faz o Intl lançar RangeError,
// então todo caminho cai no padrão sem derrubar a rodada inteira de folha.

const DEFAULT_TIME_ZONE = 'America/Sao_Paulo';

/** Janela padrão de geração, em dias, contada a partir de hoje NA EMPRESA. */
const BASE_LOOKAHEAD_DAYS = 35;

/**
 * Fuso que o Postgres usa em `CURRENT_DATE`. Ele segue o GUC `TimeZone` da
 * sessão, que no Supabase é UTC. Se algum dia isso mudar no projeto, é ESTA
 * constante que precisa acompanhar, e o log por empresa abaixo (`serverDate`)
 * é o que denuncia a divergência.
 */
const DB_SESSION_TIME_ZONE = 'UTC';

function safeTimeZone(timeZone: string | null | undefined): string {
  const candidate = typeof timeZone === 'string' && timeZone.trim() ? timeZone.trim() : DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: candidate });
    return candidate;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/** Dia (YYYY-MM-DD) do instante informado no fuso pedido. Nunca lança. */
function dateInTz(date: Date, timeZone: string): string {
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  };
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, ...options }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: DEFAULT_TIME_ZONE, ...options }).format(date);
  }
}

/** Diferença em dias inteiros entre duas datas YYYY-MM-DD (a menos b). */
function diffInDays(a: string, b: string): number {
  const ms = Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(ms)) return 0;
  return Math.round(ms / 86_400_000);
}

interface CompanyBatch {
  companyId: string;
  timeZone: string;
  localDate: string;
  drift: number;
  lookaheadDays: number;
  employeeIds: string[];
}

Deno.serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  const cronSecret = Deno.env.get('CRON_SECRET');
  const authHeader = req.headers.get('Authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // `company_id` agora vem junto: é ele que amarra o funcionário ao fuso.
    const { data: employees, error: empError } = await supabase
      .from('employees')
      .select('id, company_id')
      .eq('is_active', true);

    if (empError) throw empError;
    if (!employees || employees.length === 0) {
      return new Response(JSON.stringify({ message: 'No active employees', generated: 0 }), {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const companyIds = [...new Set(
      employees.map((e: { company_id: string | null }) => e.company_id).filter((id): id is string => !!id),
    )];

    // Fuso por empresa. Se a leitura falhar, NÃO aborta a folha: cai no padrão
    // e registra, que é exatamente o comportamento de hoje. Deixar de gerar
    // salário seria pior do que gerar com o fuso padrão.
    const timeZoneByCompany = new Map<string, string>();
    if (companyIds.length > 0) {
      const { data: settings, error: settingsError } = await supabase
        .from('company_settings')
        .select('company_id, timezone')
        .in('company_id', companyIds);

      if (settingsError) {
        console.error('[folha] Falha ao ler company_settings.timezone, usando o padrão:', settingsError);
      } else {
        for (const row of settings ?? []) {
          if (row.company_id) timeZoneByCompany.set(row.company_id, safeTimeZone(row.timezone));
        }
      }
    }

    const now = new Date();
    const serverDate = dateInTz(now, DB_SESSION_TIME_ZONE);

    // Agrupa por empresa e resolve o dia de cada uma.
    const batches = new Map<string, CompanyBatch>();
    const orphanEmployeeIds: string[] = [];

    for (const emp of employees as Array<{ id: string; company_id: string | null }>) {
      if (!emp.company_id) {
        // Funcionário sem empresa não tem fuso pra resolver. A RPC ignora o
        // caso (ela lê a empresa do próprio funcionário), mas o registro fica
        // visível no retorno em vez de sumir.
        orphanEmployeeIds.push(emp.id);
        continue;
      }

      let batch = batches.get(emp.company_id);
      if (!batch) {
        const timeZone = timeZoneByCompany.get(emp.company_id) ?? DEFAULT_TIME_ZONE;
        const localDate = dateInTz(now, timeZone);
        const drift = diffInDays(localDate, serverDate);
        batch = {
          companyId: emp.company_id,
          timeZone,
          localDate,
          drift,
          // Compensa o deslocamento no FIM da janela: a RPC abre em
          // CURRENT_DATE e fecha em CURRENT_DATE + lookahead, então
          // 35 + drift faz o fim cair em "hoje-na-empresa + 35".
          // Clamp em 0 pra nunca mandar janela negativa pro SQL.
          lookaheadDays: Math.max(0, BASE_LOOKAHEAD_DAYS + drift),
          employeeIds: [],
        };
        if (drift !== 0) {
          console.warn(
            `[folha] Empresa ${emp.company_id} (${timeZone}): dia local ${localDate}, dia do servidor ${serverDate}, ` +
            `deslocamento ${drift} dia(s). Lookahead ajustado para ${batch.lookaheadDays}.` +
            (drift < 0
              ? ' O INÍCIO da janela continua no dia do servidor, porque a RPC usa CURRENT_DATE fixo: folha que vença exatamente hoje na empresa entra só na próxima rodada.'
              : ''),
          );
        }
        batches.set(emp.company_id, batch);
      }
      batch.employeeIds.push(emp.id);
    }

    let totalGenerated = 0;
    const perCompany: Array<Record<string, unknown>> = [];

    for (const batch of batches.values()) {
      let companyGenerated = 0;
      let companyErrors = 0;

      for (const employeeId of batch.employeeIds) {
        const { data, error } = await supabase.rpc('generate_payroll_for_employee', {
          p_employee_id: employeeId,
          p_lookahead_days: batch.lookaheadDays,
          // Dia da EMPRESA, não do servidor (que roda em UTC). É o que fecha o
          // início da janela; o lookahead sozinho só corrigia o fim.
          p_today: batch.localDate,
        });
        if (error) {
          console.error(`Error generating payroll for ${employeeId}:`, error);
          companyErrors++;
          continue;
        }
        companyGenerated += Number(data ?? 0);
      }

      totalGenerated += companyGenerated;
      perCompany.push({
        company_id: batch.companyId,
        timezone: batch.timeZone,
        local_date: batch.localDate,
        server_date: serverDate,
        drift_days: batch.drift,
        lookahead_days: batch.lookaheadDays,
        employees: batch.employeeIds.length,
        generated: companyGenerated,
        errors: companyErrors,
      });
    }

    // Funcionários sem empresa ainda passam pela RPC (ela resolve a empresa
    // internamente), só não dá pra resolver fuso: usa a janela padrão.
    for (const employeeId of orphanEmployeeIds) {
      const { data, error } = await supabase.rpc('generate_payroll_for_employee', {
        p_employee_id: employeeId,
        p_lookahead_days: BASE_LOOKAHEAD_DAYS,
      });
      if (error) {
        console.error(`Error generating payroll for ${employeeId}:`, error);
        continue;
      }
      totalGenerated += Number(data ?? 0);
    }

    return new Response(
      JSON.stringify({
        message: 'Payroll generated',
        generated: totalGenerated,
        server_date: serverDate,
        companies: perCompany,
        employees_without_company: orphanEmployeeIds.length,
      }),
      { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Error in generate-payroll:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
