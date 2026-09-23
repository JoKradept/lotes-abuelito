/** Tipos del dominio. Espejo del schema del Sheet, camelCase. */
import { leerRango, toObjects } from "./sheets";

export type Estado = "Disponible" | "Apartado" | "Vendido" | "Liquidado";

export type Lote = {
  loteId: string;      // derivado: manzana + "-" + numero
  numero: number;
  manzana: string;
  frente: number;
  fondo: number;
  calle: string;
  esquina: boolean;
  precioLista: number;
  estado: Estado;
  plano: string;
  notas: string;
};

export type Cliente = {
  clienteId: string;
  nombre: string;
  telefono: string;
  direccion: string;
  notas: string;
};

export type FrecuenciaPago = "Semanal" | "Quincenal" | "Mensual" | "Otro" | "";
export type Venta = {
  ventaId: string;
  loteId: string;
  clienteId: string;
  fecha: string;
  precioFinal: number;
  enganche: number;
  frecuenciaPago: FrecuenciaPago;
  cuotaPeriodo: number;
  notas: string;
};

export type Abono = {
  abonoId: string;
  ventaId: string;
  fecha: string;
  monto: number;
  metodo: string;
  nota: string;
  cancelado: boolean;
  registradoEn: string;
  avanzaFecha: boolean;
};


const n = (s: string) => Number(String(s ?? "").replace(/[^\d.-]/g, "")) || 0;
const b = (s: string) => (s ?? "").toUpperCase() === "SI" || s === "TRUE" || s === "true" || s === "Yes";

export async function loadLotes(): Promise<Lote[]> {
  const rows = await leerRango("Lotes!A1:K500");
  return toObjects<Record<string, string>>(rows).map((l) => ({
    loteId: `${l.manzana}-${String(n(l.numero)).padStart(3, "0")}`,
    numero: n(l.numero),
    manzana: l.manzana ?? "",
    frente: n(l.frente),
    fondo: n(l.fondo),
    calle: l.calle ?? "",
    esquina: b(l.esquina),
    precioLista: n(l.precioLista),
    estado: (l.estado as Estado) || "Disponible",
    plano: l.plano ?? "",
    notas: l.notas ?? "",
  }));
}

export async function loadClientes(): Promise<Cliente[]> {
  const rows = await leerRango("Clientes!A1:E500");
  return toObjects<Record<string, string>>(rows).map((c) => ({
    clienteId: c.clienteId ?? "",
    nombre: c.nombre ?? "",
    telefono: c.telefono ?? "",
    direccion: c.direccion ?? "",
    notas: c.notas ?? "",
  }));
}

export async function loadVentas(): Promise<Venta[]> {
  const rows = await leerRango("Ventas!A1:I500");
  return toObjects<Record<string, string>>(rows).map((v) => ({
    ventaId: v.ventaId ?? "",
    loteId: v.loteId ?? "",
    clienteId: v.clienteId ?? "",
    fecha: v.fecha ?? "",
    precioFinal: n(v.precioFinal),
    enganche: n(v.enganche),
    frecuenciaPago: (v.frecuenciaPago as FrecuenciaPago) ?? "",
    cuotaPeriodo: n(v.cuotaPeriodo),
    notas: v.notas ?? "",
  }));
}

export async function loadAbonos(): Promise<Abono[]> {
  const rows = await leerRango("Abonos!A1:I5000");
  return toObjects<Record<string, string>>(rows).map((a) => ({
    abonoId: a.abonoId ?? "",
    ventaId: a.ventaId ?? "",
    fecha: a.fecha ?? "",
    monto: n(a.monto),
    metodo: a.metodo ?? "",
    nota: a.nota ?? "",
    cancelado: b(a.cancelado),
    registradoEn: a.registradoEn ?? "",
    avanzaFecha: b(a.avanzaFecha),
  }));
}

export { DIAS_FRECUENCIA, proximoAbono, saldoVenta } from "./venta-utils";
