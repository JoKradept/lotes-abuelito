/**
 * Configuración general del sistema (Cumbres de Tiripetío).
 * Actúa como los valores predeterminados a menos que se sobreescriban a nivel de lote o venta.
 */

export type ConfiguracionVentas = {
  comisionPctDefault: number;      // 20%
  engancheDefault: number;          // $5,000 MXN
  tasaInteresMensual: number;       // 1.5% mensual a partir del 3er mes
  mesesGraciaContado: number;       // 3 meses (<= 3 es de contado, > 3 es a crédito con interés)
};

export const DEFAULT_CONFIG: ConfiguracionVentas = {
  comisionPctDefault: 20,
  engancheDefault: 5000,
  tasaInteresMensual: 1.5,
  mesesGraciaContado: 3,
};

const MOTOR_URL = (
  (typeof process !== "undefined" && process.env?.MOTOR_URL) ||
  (typeof import.meta !== "undefined" && (import.meta as any).env?.MOTOR_URL) ||
  "http://localhost:3031/v1"
).replace(/\/$/, "");

const MOTOR_TOKEN =
  (typeof process !== "undefined" && process.env?.MOTOR_TOKEN) ||
  (typeof import.meta !== "undefined" && (import.meta as any).env?.MOTOR_TOKEN) ||
  "O13xxar6WuBH5eCG6tZ7Hr5aFjMN24EBNGUkc47hnCo";

export async function loadConfiguracion(): Promise<ConfiguracionVentas> {
  try {
    const res = await fetch(`${MOTOR_URL}/_meta/ajustes`, {
      headers: { Authorization: `Bearer ${MOTOR_TOKEN}` },
    });
    if (res.ok) {
      const data = await res.json();
      const v = data?.ventas;
      return {
        comisionPctDefault: Number(v?.comisionPctDefault) || DEFAULT_CONFIG.comisionPctDefault,
        engancheDefault: Number(v?.engancheDefault) || DEFAULT_CONFIG.engancheDefault,
        tasaInteresMensual: Number(v?.tasaInteresMensual) || DEFAULT_CONFIG.tasaInteresMensual,
        mesesGraciaContado: Number(v?.mesesGraciaContado) || DEFAULT_CONFIG.mesesGraciaContado,
      };
    }
  } catch {
    // Si Motor no está disponible, usar defaults
  }
  return { ...DEFAULT_CONFIG };
}

export type CotizacionResultado = {
  esCredito: boolean;
  modalidad: "Contado" | "Crédito";
  meses: number;
  precioBase: number;
  interesPct: number;
  interesMonto: number;
  precioTotal: number;
  enganche: number;
  saldoFinanciar: number;
  cuotaMensual: number;
  comisionMonto: number;
  comisionPct: number;
};

/**
 * Calcula la cotización de venta:
 * - Si meses <= mesesGraciaContado (3 meses): Es de CONTADO (0% interés).
 * - Si meses > mesesGraciaContado: Es a CRÉDITO. A partir de 3 meses se agrega la tasa de interés.
 */
export function calcularCotizacion(
  precioBase: number,
  engancheInput: number,
  mesesInput: number,
  config: ConfiguracionVentas = DEFAULT_CONFIG
): CotizacionResultado {
  const meses = Math.max(1, Math.round(Number(mesesInput) || 1));
  const base = Math.max(0, Number(precioBase) || 0);
  const enganche = Math.min(Math.max(0, Number(engancheInput) || 0), base);
  const saldoBase = Math.max(0, base - enganche);

  const esCredito = meses > config.mesesGraciaContado;
  let interesPct = 0;
  let interesMonto = 0;

  if (esCredito) {
    const mesesConInteres = meses - config.mesesGraciaContado;
    interesPct = Number((mesesConInteres * config.tasaInteresMensual).toFixed(2));
    interesMonto = Math.round(saldoBase * (interesPct / 100));
  }

  const precioTotal = base + interesMonto;
  const saldoFinanciar = saldoBase + interesMonto;
  const cuotaMensual = meses > 0 ? Math.round(saldoFinanciar / meses) : saldoFinanciar;
  const comisionPct = config.comisionPctDefault;
  const comisionMonto = Math.round(precioTotal * (comisionPct / 100));

  return {
    esCredito,
    modalidad: esCredito ? "Crédito" : "Contado",
    meses,
    precioBase: base,
    interesPct,
    interesMonto,
    precioTotal,
    enganche,
    saldoFinanciar,
    cuotaMensual,
    comisionMonto,
    comisionPct,
  };
}
