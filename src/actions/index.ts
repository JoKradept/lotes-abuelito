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
      telefono: z.string().optional().default(""),
      direccion: z.string().optional().default(""),
      notas: z.string().optional().default(""),
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
      notas: z.string().optional().default(""),
    }),
    handler: async (i) => {
      const rows = await leerRango("Ventas!A1:G");
      const id = uid("V", rows.length - 1);
      await agregarFila("Ventas", [id, i.loteId, i.clienteId, i.fecha,
        i.precioFinal, i.enganche, i.notas]);
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
      nota: z.string().optional().default(""),
    }),
    handler: async (i) => {
      const rows = await leerRango("Abonos!A1:H");
      const id = uid("A", rows.length - 1);
      await agregarFila("Abonos", [id, i.ventaId, i.fecha, i.monto, i.metodo,
        i.nota, "FALSE", new Date().toISOString()]);
      return { abonoId: id };
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
