import { defineAction } from "astro:actions";
import { z } from "astro:schema";
import { agregarFila, leerRango, escribirRango, filaPorId } from "../lib/sheets";

const uid = (pref: string, prev: number) =>
  `${pref}-${String(prev + 1).padStart(3, "0")}`;

export const server = {
  crearCliente: defineAction({
    accept: "form",
    input: z.object({
      nombre: z.string().min(1),
      telefono: z.string().nullish().transform((v) => v ?? ""),
      direccion: z.string().nullish().transform((v) => v ?? ""),
      notas: z.string().nullish().transform((v) => v ?? ""),
    }),
    handler: async (i) => {
      const rows = await leerRango("Clientes!A1:E");
      const id = uid("C", rows.length - 1);
      await agregarFila("Clientes", [id, i.nombre, i.telefono, i.direccion, i.notas]);
      return { clienteId: id };
    },
  }),

  crearVenta: defineAction({
    accept: "form",
    input: z.object({
      loteId: z.string(),
      clienteId: z.string(),
      fecha: z.string(),
      precioFinal: z.coerce.number().positive(),
      enganche: z.coerce.number().nonnegative().default(0),
      frecuenciaPago: z.enum(["Semanal", "Quincenal", "Mensual", "Otro"]).default("Mensual"),
      notas: z.string().optional().default(""),
    }),
    handler: async (i) => {
      const rows = await leerRango("Ventas!A1:H");
      const id = uid("V", rows.length - 1);
      await agregarFila("Ventas", [id, i.loteId, i.clienteId, i.fecha,
        i.precioFinal, i.enganche, i.frecuenciaPago, i.notas]);
      // marcar lote como Vendido
      const lotes = await leerRango("Lotes!A1:K");
      const header = lotes[0];
      const numeroCol = header.indexOf("numero");
      const manzanaCol = header.indexOf("manzana");
      const estadoCol = header.indexOf("estado");
      const [manzana, numStr] = i.loteId.split("-");
      const rowIdx = lotes.findIndex((r, idx) =>
        idx > 0 && r[manzanaCol] === manzana && Number(r[numeroCol]) === Number(numStr)
      );
      if (rowIdx > 0) {
        const colLetter = String.fromCharCode(65 + estadoCol);
        await escribirRango(`Lotes!${colLetter}${rowIdx + 1}`, [["Vendido"]]);
      }
      return { ventaId: id };
    },
  }),

  crearAbono: defineAction({
    accept: "form",
    input: z.object({
      ventaId: z.string(),
      fecha: z.string(),
      monto: z.coerce.number().positive(),
      metodo: z.enum(["Efectivo", "Transferencia", "Cheque", "Otro"]),
      nota: z.string().nullish().transform((v) => v ?? ""),
      avanzaFecha: z.coerce.boolean().default(false),
    }),
    handler: async (i) => {
      const rows = await leerRango("Abonos!A1:I");
      const id = uid("A", rows.length - 1);
      await agregarFila("Abonos", [id, i.ventaId, i.fecha, i.monto, i.metodo,
        i.nota, "FALSE", new Date().toISOString(), i.avanzaFecha ? "TRUE" : "FALSE"]);
      return { abonoId: id };
    },
  }),

  guardarVentaRapida: defineAction({
    input: z.object({
      loteId: z.string(),
      cliente: z.string().optional().default(""),
      telefono: z.string().optional().default(""),
      estado: z.enum(["Disponible", "Apartado", "Vendido", "Liquidado"]),
      precioFinal: z.coerce.number().optional().default(0),
      precioListaNuevo: z.coerce.number().optional().default(0),
      enganche: z.coerce.number().optional().default(0),
      cuotaPeriodo: z.coerce.number().optional().default(0),
      frecuenciaPago: z.enum(["Semanal", "Quincenal", "Mensual", "Otro"]).default("Mensual"),
      nota: z.string().nullish().transform((v) => v ?? ""),
    }),
    handler: async (i) => {
      // 1. Update lote.estado (y precioLista si el usuario lo editó)
      const lotes = await leerRango("Lotes!A1:K");
      const head = lotes[0];
      const nCol = head.indexOf("numero");
      const mCol = head.indexOf("manzana");
      const eCol = head.indexOf("estado");
      const plCol = head.indexOf("precioLista");
      const [manzana, numStr] = i.loteId.split("-");
      const loteRow = lotes.findIndex((r, idx) =>
        idx > 0 && r[mCol] === manzana && Number(r[nCol]) === Number(numStr));
      let precioListaActual = 0;
      if (loteRow > 0) {
        precioListaActual = Number(lotes[loteRow][plCol]) || 0;
        await escribirRango(`Lotes!${String.fromCharCode(65 + eCol)}${loteRow + 1}`, [[i.estado]]);
        if (i.precioListaNuevo && i.precioListaNuevo !== precioListaActual) {
          await escribirRango(`Lotes!${String.fromCharCode(65 + plCol)}${loteRow + 1}`, [[i.precioListaNuevo]]);
          precioListaActual = i.precioListaNuevo;
        }
      }

      // Disponible → no toca venta.
      if (i.estado === "Disponible") return { ok: true };

      // Sin cliente para Apartado/Vendido/Liquidado no hay nada que registrar.
      if (!i.cliente.trim()) return { ok: true };

      // 2. Find or create cliente.
      const clientes = await leerRango("Clientes!A1:E");
      const nombreCol = clientes[0].indexOf("nombre");
      const idCol = clientes[0].indexOf("clienteId");
      const found = clientes.slice(1).find((r) => (r[nombreCol] ?? "").trim() === i.cliente.trim());
      let clienteId = found?.[idCol] ?? "";
      if (!clienteId) {
        clienteId = uid("C", clientes.length - 1);
        await agregarFila("Clientes", [clienteId, i.cliente.trim(), i.telefono, "", ""]);
      }

      // 3. Update or create venta.
      const ventas = await leerRango("Ventas!A1:I");
      const vHead = ventas[0];
      const vLoteCol = vHead.indexOf("loteId");
      const ventaRow = ventas.findIndex((r, idx) => idx > 0 && r[vLoteCol] === i.loteId);
      const precio = i.precioFinal || precioListaActual;
      if (ventaRow > 0) {
        const set = async (colName: string, valor: any) => {
          const col = String.fromCharCode(65 + vHead.indexOf(colName));
          await escribirRango(`Ventas!${col}${ventaRow + 1}`, [[valor]]);
        };
        await set("clienteId", clienteId);
        if (precio) await set("precioFinal", precio);
        await set("enganche", i.enganche);
        await set("frecuenciaPago", i.frecuenciaPago);
        await set("cuotaPeriodo", i.cuotaPeriodo);
        if (i.nota) await set("notas", i.nota);
      } else {
        const ventaId = uid("V", ventas.length - 1);
        const fecha = new Date().toISOString().slice(0, 10);
        await agregarFila("Ventas", [ventaId, i.loteId, clienteId, fecha,
          precio, i.enganche, i.frecuenciaPago, i.cuotaPeriodo, i.nota]);
      }
      return { ok: true };
    },
  }),

  cancelarAbono: defineAction({
    accept: "form",
    input: z.object({ abonoId: z.string() }),
    handler: async (i) => {
      const rows = await leerRango("Abonos!A1:H");
      const canceladoCol = rows[0].indexOf("cancelado");
      const row = filaPorId(rows, i.abonoId);
      if (!row) throw new Error(`abono ${i.abonoId} no encontrado`);
      const col = String.fromCharCode(65 + canceladoCol);
      await escribirRango(`Abonos!${col}${row}`, [["TRUE"]]);
      return { ok: true };
    },
  }),
};

// ponytail: UNIQUEID via row count; race si dos crean simultáneo. Upgrade a
// UUID cuando haya concurrencia real.
