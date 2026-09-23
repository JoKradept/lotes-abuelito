/** Helpers puros del dominio Venta/Abono. Safe para importar desde el cliente. */
import type { Abono, Venta } from "./domain";

export const DIAS_FRECUENCIA: Record<string, number> = {
  Semanal: 7, Quincenal: 15, Mensual: 30, Otro: 30, "": 30,
};

export function saldoVenta(v: Venta, abonos: Abono[]): number {
  const totalAbonado = abonos
    .filter((a) => a.ventaId === v.ventaId && !a.cancelado)
    .reduce((s, a) => s + a.monto, 0);
  return v.precioFinal - v.enganche - totalAbonado;
}

export function proximoAbono(v: Venta, abonos: Abono[]): Date {
  const avanzan = abonos.filter((a) => a.ventaId === v.ventaId && !a.cancelado && a.avanzaFecha).length;
  const base = v.fecha ? new Date(v.fecha) : new Date();
  return new Date(base.getTime() + (avanzan + 1) * (DIAS_FRECUENCIA[v.frecuenciaPago] ?? 30) * 86_400_000);
}
