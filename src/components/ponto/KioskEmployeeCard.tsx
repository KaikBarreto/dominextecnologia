// src/components/ponto/KioskEmployeeCard.tsx
// -----------------------------------------------------------------------------
// Crachá do quadro de turno: foto quadrada sangrando até a borda, faixa de
// status colada embaixo dela e etiqueta com nome e status.
//
// É mobília de balcão, não card de dashboard: sem borda, sem anel, sem
// arredondamento grande. A separação entre um crachá e o vizinho vem do tom
// do painel e do respiro da grade, não de uma caixa desenhada em volta.
//
// O payload da edge (`get_kiosk`) NÃO traz `position` nem `has_pin` — por
// isso, ao contrário do card irmão do EcoSistema, este não tem cargo nem
// cadeado. Se um dia esses campos entrarem no contrato, é pendência pro Tech
// Lead decidir onde exibir.
// -----------------------------------------------------------------------------

import { KIOSK_STATUS, initialsOf, tileColorFor, type KioskEmployee } from "@/lib/ponto/kiosk";

export interface KioskStatusLabels {
  not_started: string;
  working: string;
  on_break: string;
  finished: string;
}

export interface KioskEmployeeCardProps {
  employee: KioskEmployee;
  onSelect: (employee: KioskEmployee) => void;
  /** Rótulos de status já traduzidos (i18n vem da tela, não daqui). */
  statusLabels: KioskStatusLabels;
  /**
   * Atraso da animação de entrada, em ms. `null` = sem animação, é o que a
   * lista passa em toda carga que NÃO é a primeira, pra grade não repicar a
   * cada volta de batida (dezenas de vezes por dia no mesmo tablet).
   */
  enterDelayMs?: number | null;
}

export function KioskEmployeeCard({
  employee,
  onSelect,
  statusLabels,
  enterDelayMs = null,
}: KioskEmployeeCardProps) {
  const status = KIOSK_STATUS[employee.status];
  const animated = enterDelayMs !== null;
  // Cor própria do quadrado de quem não tem foto (determinística pelo id).
  const tile = tileColorFor(employee.id);

  // Quem está de férias/atestado e ainda não bateu mostraria "Férias" em cima
  // e "Não bateu hoje" embaixo, as duas coisas verdadeiras, mas de longe o
  // tablet passaria a impressão de que a pessoa faltou. Com ausência lançada
  // e nenhuma batida, o rótulo de status DIZ a ausência. Quem está de férias
  // e veio cobrir turno bate normal, e aí o status volta a ser o real
  // ("Trabalhando"), que é a informação mais útil.
  const statusText =
    employee.absence_label && employee.status === "not_started"
      ? employee.absence_label
      : statusLabels[employee.status];

  return (
    <button
      type="button"
      onClick={() => onSelect(employee)}
      // `min-w-0` no próprio botão: item de grid nasce com `min-width:auto` e
      // um nome comprido esticaria a COLUNA inteira da grade.
      className={`group flex min-w-0 flex-col overflow-hidden rounded-md bg-white/[0.045] text-left transition-transform active:scale-[0.98] ${
        animated ? "animate-in fade-in slide-in-from-bottom-2 duration-300" : ""
      }`}
      style={animated ? { animationDelay: `${enterDelayMs}ms`, animationFillMode: "both" } : undefined}
    >
      <div className="relative w-full">
        {employee.photo_url ? (
          <img
            src={employee.photo_url}
            alt={employee.name}
            className="aspect-square w-full object-cover"
            loading="lazy"
          />
        ) : (
          /* Sem foto é o caso MAIS COMUM (empresa nova não tem foto de
             ninguém), então esse quadrado não pode ser um vazio cinza: ganha
             cor própria da pessoa e iniciais brancas pesadas, pra se achar na
             grade pela cor + posição, de longe. */
          <div
            className="flex aspect-square w-full items-center justify-center text-5xl font-bold text-white/90"
            style={{ background: `linear-gradient(150deg, ${tile.from} 0%, ${tile.to} 100%)` }}
          >
            {initialsOf(employee.name)}
          </div>
        )}
        {/* Etiqueta de ausência de hoje ("Férias", "Atestado"…). Chapa preta
            translúcida no canto, é AVISO, não bloqueio, o crachá continua
            clicável e a pessoa continua batendo ponto normalmente. Por isso a
            etiqueta é discreta (11px) e não uma tarja colorida por cima da
            foto: ela informa, não interdita. */}
        {employee.absence_label && (
          <span className="absolute left-2 top-2 max-w-[calc(100%-1rem)] truncate rounded-md bg-black/60 px-2 py-1 text-[11px] font-semibold leading-none text-white/90 backdrop-blur-sm">
            {employee.absence_label}
          </span>
        )}
      </div>

      {/* O "LED" do crachá: faixa cheia, cor do status. É o que se lê de
          longe, de relance, sem precisar decifrar texto. */}
      <div className={`h-1 w-full shrink-0 ${status.bar}`} />

      {/* `w-full` é obrigatório junto do `min-w-0`: uma div sem largura se
          dimensiona pelo CONTEÚDO, então o `min-w-0` sozinho não morde e o
          nome vaza pra FORA do cartão. */}
      <div className="w-full min-w-0 px-3 py-2.5">
        {/* Duas linhas em vez de reticências: num tablet o requisito é ler o
            nome inteiro de longe, e um nome comprido cortado no meio não
            serve pra ninguém se reconhecer. `break-words` segura o nome de
            uma palavra só, comprido demais pra caber. */}
        <p className="line-clamp-2 break-words text-[17px] font-semibold leading-snug text-white">
          {employee.name}
        </p>
        <p className={`truncate text-[12px] ${status.text}`}>{statusText}</p>
      </div>
    </button>
  );
}
