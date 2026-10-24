/** Cliente y adaptadores para el Motor (admin-lotes). */
import type { Lote, Cliente, Venta, Abono, Estado, FrecuenciaPago } from "./domain";

const MOTOR_URL = (
  (typeof process !== "undefined" && process.env?.MOTOR_URL) ||
  (typeof import.meta !== "undefined" && (import.meta as any).env?.MOTOR_URL) ||
  "http://localhost:3031/v1"
).replace(/\/$/, "");

// Token maestro para llamadas de servidor (Astro SSR) hacia Motor API
const MOTOR_TOKEN =
  (typeof process !== "undefined" && process.env?.MOTOR_TOKEN) ||
  (typeof import.meta !== "undefined" && (import.meta as any).env?.MOTOR_TOKEN) ||
  "O13xxar6WuBH5eCG6tZ7Hr5aFjMN24EBNGUkc47hnCo";

let _cachedAvailable: { at: number; ok: boolean } | null = null;
const AVAILABILITY_TTL = 3000;

export async function isMotorAvailable(): Promise<boolean> {
  const now = Date.now();
  if (_cachedAvailable && now - _cachedAvailable.at < AVAILABILITY_TTL) {
    return _cachedAvailable.ok;
  }
  try {
    const res = await fetch(`${MOTOR_URL}/_health`, { signal: AbortSignal.timeout(1500) });
    const ok = res.ok;
    _cachedAvailable = { at: now, ok };
    return ok;
  } catch {
    _cachedAvailable = { at: now, ok: false };
    return false;
  }
}

async function motorFetch(path: string, init?: RequestInit): Promise<any> {
  const url = `${MOTOR_URL}${path.startsWith("/") ? "" : "/"}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(MOTOR_TOKEN ? { Authorization: `Bearer ${MOTOR_TOKEN}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Motor [${res.status}] ${url}: ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function loadLotesFromMotor(): Promise<Lote[]> {
  const raw = (await motorFetch("/terrenos/lote?limit=2000")) as Record<string, any>[];
  return raw.map((l) => ({
    loteId: l.nombre ?? "",
    numero: Number(l.numero) || 0,
    manzana: l.manzana ?? "",
    frente: Number(l.frente) || 0,
    fondo: Number(l.fondo) || 0,
    calle: l.calle ?? "",
    esquina: Boolean(l.esquina),
    precioLista: Number(l.precio) || 0,
    estado: (l.estado ? l.estado[0].toUpperCase() + l.estado.slice(1) : "Disponible") as Estado,
    plano: l.ubicacion ?? "",
    notas: l.descripcion ?? "",
  }));
}

export async function loadClientesFromMotor(): Promise<Cliente[]> {
  const raw = (await motorFetch("/contactos/contacto?limit=2000")) as Record<string, any>[];
  return raw.map((c) => ({
    clienteId: c.id,
    nombre: c.nombre ?? "",
    telefono: c.telefono ?? "",
    direccion: typeof c.direccion === "object" ? (c.direccion?.calle ?? "") : (c.direccion ?? ""),
    notas: c.notas ?? "",
  }));
}

export async function loadVentasFromMotor(): Promise<Venta[]> {
  const raw = (await motorFetch("/ventas/orden?limit=2000")) as Record<string, any>[];
  const lotesVentas = raw.filter((v) =>
    v.partidas?.some((p: any) => p.entidad === "terrenos/lote" || p.descripcion?.startsWith("Lote "))
  );
  return lotesVentas.map((v) => {
    const lotePartida = v.partidas?.find(
      (p: any) => p.entidad === "terrenos/lote" || p.descripcion?.startsWith("Lote ")
    );
    const loteId = lotePartida?.descripcion?.replace(/^Lote\s+/, "") ?? "";
    const freqMatch = v.notas?.match(/frecuencia:(\w+)/i);
    const frecuencia = (freqMatch
      ? freqMatch[1][0].toUpperCase() + freqMatch[1].slice(1).toLowerCase()
      : "Mensual") as FrecuenciaPago;
    return {
      ventaId: v.id,
      loteId,
      clienteId: v.cliente ?? "",
      fecha: v.fecha ?? "",
      precioFinal: Number(v.total) || 0,
      enganche: Number(v.anticipo) || 0,
      frecuenciaPago: frecuencia,
      cuotaPeriodo: 0,
      notas: v.notas ?? "",
      vendedorId: "",
      comisionPctVenta: 0,
    };
  });
}

export async function loadAbonosFromMotor(): Promise<Abono[]> {
  const [abonos, cuentas] = await Promise.all([
    motorFetch("/pagos/abono?limit=5000") as Promise<Record<string, any>[]>,
    motorFetch("/pagos/cuenta?limit=2000") as Promise<Record<string, any>[]>,
  ]);
  const ventaIdPorCuenta = new Map(cuentas.map((c) => [c.id, c.registro]));
  return abonos.map((a) => {
    const metodo = a.metodo ? a.metodo[0].toUpperCase() + a.metodo.slice(1) : "Efectivo";
    return {
      abonoId: a.id,
      ventaId: ventaIdPorCuenta.get(a.cuenta) ?? "",
      fecha: a.fecha ?? "",
      monto: Number(a.monto) || 0,
      metodo,
      nota: a.notas ?? "",
      cancelado: Boolean(a.cancelado),
      registradoEn: a.createdAt ?? "",
      avanzaFecha: false,
      comprobanteUrl: a.referencia ?? "",
    };
  });
}

export async function motorCrearCliente(i: {
  nombre: string;
  telefono?: string;
  direccion?: string;
  notas?: string;
}) {
  const res = await motorFetch("/contactos/contacto", {
    method: "POST",
    body: JSON.stringify({
      nombre: i.nombre.trim(),
      telefono: i.telefono ?? "",
      direccion: i.direccion ? { calle: i.direccion } : undefined,
      notas: i.notas ?? "",
    }),
  });
  return { clienteId: res.id };
}

export async function motorCrearVenta(i: {
  loteId: string;
  clienteId: string;
  fecha: string;
  precioFinal: number;
  enganche: number;
  frecuenciaPago?: string;
  notas?: string;
}) {
  const lotes = (await motorFetch(`/terrenos/lote?limit=2000`)) as Record<string, any>[];
  const lote = lotes.find((l) => l.nombre === i.loteId);
  if (!lote) throw new Error(`Lote ${i.loteId} no encontrado en Motor`);

  const orden = await motorFetch("/ventas/orden", {
    method: "POST",
    body: JSON.stringify({
      cliente: i.clienteId,
      fecha: i.fecha,
      formaPago: "credito",
      anticipo: String(i.enganche || 0),
      partidas: [
        {
          entidad: "terrenos/lote",
          registro: lote.id,
          descripcion: `Lote ${i.loteId}`,
          cantidad: "1",
          precioUnitario: String(i.precioFinal),
        },
      ],
      notas: `frecuencia:${i.frecuenciaPago ?? "Mensual"}${i.notas ? " · " + i.notas : ""}`,
    }),
  });

  await motorFetch(`/ventas/orden/${orden.id}/confirmar`, { method: "POST" });
  return { ventaId: orden.id };
}

export async function motorCrearAbono(i: {
  ventaId: string;
  fecha: string;
  monto: number;
  metodo: string;
  nota?: string;
  comprobanteUrl?: string;
}) {
  const cuentas = (await motorFetch("/pagos/cuenta?limit=2000")) as Record<string, any>[];
  const cuenta = cuentas.find((c) => c.registro === i.ventaId || c.origen === i.ventaId || c.id === i.ventaId);
  if (!cuenta) throw new Error(`Cuenta no encontrada para la venta ${i.ventaId}`);

  await motorFetch(`/pagos/cuenta/${cuenta.id}/abonar`, {
    method: "POST",
    body: JSON.stringify({
      monto: String(i.monto),
      metodo: i.metodo.toLowerCase(),
      fecha: i.fecha,
      referencia: i.comprobanteUrl || "",
      notas: i.nota || "",
    }),
  });
  return { abonoId: cuenta.id };
}

export async function motorGuardarVentaRapida(i: {
  loteId: string;
  cliente?: string;
  telefono?: string;
  estado: Estado;
  precioFinal?: number;
  precioListaNuevo?: number;
  enganche?: number;
  cuotaPeriodo?: number;
  frecuenciaPago?: FrecuenciaPago;
  nota?: string;
  vendedorId?: string;
  comisionPctVenta?: number;
}) {
  const lotes = (await motorFetch(`/terrenos/lote?limit=2000`)) as Record<string, any>[];
  const lote = lotes.find((l) => l.nombre === i.loteId);
  if (!lote) throw new Error(`Lote ${i.loteId} no encontrado en Motor`);

  if (i.precioListaNuevo && Number(lote.precio) !== i.precioListaNuevo) {
    await motorFetch(`/terrenos/lote/${lote.id}`, {
      method: "PUT",
      body: JSON.stringify({ precio: String(i.precioListaNuevo) }),
    });
  }

  if (i.estado === "Disponible") {
    if (lote.estado !== "disponible") {
      await motorFetch(`/terrenos/lote/${lote.id}/liberar`, { method: "POST" });
    }
    return { ok: true };
  }

  if (i.estado === "Apartado") {
    if (lote.estado === "disponible") {
      await motorFetch(`/terrenos/lote/${lote.id}/apartar`, { method: "POST" });
    }
    return { ok: true };
  }

  if ((i.estado === "Vendido" || i.estado === "Liquidado") && i.cliente?.trim()) {
    const clientes = (await motorFetch("/contactos/contacto?limit=2000")) as Record<string, any>[];
    let cliente = clientes.find(
      (c) => c.nombre.trim().toLowerCase() === i.cliente!.trim().toLowerCase()
    );
    if (!cliente) {
      cliente = await motorFetch("/contactos/contacto", {
        method: "POST",
        body: JSON.stringify({ nombre: i.cliente.trim(), telefono: i.telefono ?? "" }),
      });
    }

    const ordenes = (await motorFetch("/ventas/orden?limit=2000")) as Record<string, any>[];
    let orden = ordenes.find((o) =>
      o.partidas?.some((p: any) => p.registro === lote.id || p.descripcion === `Lote ${i.loteId}`)
    );

    const precioFinal = i.precioFinal || Number(lote.precio) || 0;
    if (!orden) {
      orden = await motorFetch("/ventas/orden", {
        method: "POST",
        body: JSON.stringify({
          cliente: cliente.id,
          fecha: new Date().toISOString().slice(0, 10),
          formaPago: "credito",
          anticipo: String(i.enganche || 0),
          partidas: [
            {
              entidad: "terrenos/lote",
              registro: lote.id,
              descripcion: `Lote ${i.loteId}`,
              cantidad: "1",
              precioUnitario: String(precioFinal),
            },
          ],
          notas: `frecuencia:${i.frecuenciaPago ?? "Mensual"}${i.nota ? " · " + i.nota : ""}`,
        }),
      });
      await motorFetch(`/ventas/orden/${orden.id}/confirmar`, { method: "POST" });
    }

    if (i.estado === "Liquidado") {
      const cuentas = (await motorFetch("/pagos/cuenta?limit=2000")) as Record<string, any>[];
      const cuenta = cuentas.find((c) => c.registro === orden.id && c.estado !== "liquidada");
      if (cuenta && Number(cuenta.saldo) > 0) {
        await motorFetch(`/pagos/cuenta/${cuenta.id}/abonar`, {
          method: "POST",
          body: JSON.stringify({
            monto: String(cuenta.saldo),
            metodo: "efectivo",
            fecha: new Date().toISOString().slice(0, 10),
            notas: "Liquidación total",
          }),
        });
      }
    }
  }

  return { ok: true };
}
