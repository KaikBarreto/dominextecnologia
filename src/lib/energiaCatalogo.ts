/**
 * Consumo mensal cadastrado não contém horas/ciclo de ensaio. Não é possível
 * deduzir potência ou consumo horário dele, nem redimensioná-lo por horas/dia.
 * A simulação usa exclusivamente a potência ELÉTRICA em W, nunca BTU/h.
 */
export interface EnergiaCatalogoInput {
  potenciaW?: number | null;
  consumoKwhMes?: number | null;
  tarifa: number;
  horasDia: number;
  /** Regime conectado 24h; simulação nominal não modela ciclos do compressor. */
  continuo?: boolean;
}

export interface EstimativaEnergiaNominal {
  kwhHora: number;
  kwhMes: number;
  gastoHora: number | null;
  gastoMes: number | null;
  horasDia: number;
}

export interface EnergiaCatalogoResultado {
  /** Referência cadastrada, mantida independente da simulação de horas. */
  referenciaKwhMes: number | null;
  gastoReferenciaMes: number | null;
  estimativaNominal: EstimativaEnergiaNominal | null;
}

const naoNegativoFinito = (n: number | null | undefined): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0;

export function calcularEnergiaCatalogo(input: EnergiaCatalogoInput): EnergiaCatalogoResultado {
  const { consumoKwhMes, potenciaW, tarifa } = input;
  const referenciaKwhMes = naoNegativoFinito(consumoKwhMes) ? consumoKwhMes : null;
  const custo = (kwh: number | null): number | null => {
    if (kwh === null || !naoNegativoFinito(tarifa)) return null;
    const valor = kwh * tarifa;
    return Number.isFinite(valor) ? valor : null;
  };
  const horasDia = input.continuo ? 24 : input.horasDia;
  let estimativaNominal: EstimativaEnergiaNominal | null = null;
  if (naoNegativoFinito(potenciaW) && potenciaW > 0 && naoNegativoFinito(horasDia) && horasDia <= 24) {
    const kwhHora = potenciaW / 1000;
    const kwhMes = kwhHora * horasDia * 30;
    if (Number.isFinite(kwhMes) && kwhHora > 0) {
      estimativaNominal = { kwhHora, kwhMes, gastoHora: custo(kwhHora), gastoMes: custo(kwhMes), horasDia };
    }
  }
  return { referenciaKwhMes, gastoReferenciaMes: custo(referenciaKwhMes), estimativaNominal };
}
