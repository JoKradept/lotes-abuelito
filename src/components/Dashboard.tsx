import { useMemo, useState } from "react";
import type { Abono, Cliente, Estado, Lote, Venta } from "../lib/domain";
import { PlanoInteractivo } from "./PlanoInteractivo";
import { pesos } from "../lib/format";

const MANZANAS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
const ESTADOS: Estado[] = ["Disponible", "Apartado", "Vendido", "Liquidado"];

const ESTILO: Record<Estado, { chip: string; texto: string; punto: string }> = {
  Disponible: { chip: "bg-disponible-soft ring-disponible/25", texto: "text-disponible", punto: "bg-disponible" },
  Apartado:   { chip: "bg-apartado-soft ring-apartado/30",     texto: "text-apartado",   punto: "bg-apartado" },
  Vendido:    { chip: "bg-vendido-soft ring-vendido/25",       texto: "text-vendido",    punto: "bg-vendido" },
  Liquidado:  { chip: "bg-liquidado-soft ring-liquidado/30",   texto: "text-liquidado",  punto: "bg-liquidado" },
};

type Props = {
  lotes: Lote[];
  ventas: Venta[];
  abonos: Abono[];
  clientes: Cliente[];
};

export function Dashboard({ lotes, ventas, abonos, clientes }: Props) {
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<Estado | "Todos">("Todos");
  const [manzanaActiva, setManzanaActiva] = useState<string>("A");

  const clienteMap = useMemo(() => new Map(clientes.map((c) => [c.clienteId, c])), [clientes]);
  const ventaPorLote = useMemo(() => new Map(ventas.map((v) => [v.loteId, v])), [ventas]);

  const abonadoPorVenta = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of abonos) {
      if (a.cancelado) continue;
      m.set(a.ventaId, (m.get(a.ventaId) ?? 0) + a.monto);
    }
    return m;
  }, [abonos]);

  const saldoLote = (l: Lote): number => {
    const v = ventaPorLote.get(l.loteId);
    if (!v) return 0;
    return Math.max(v.precioFinal - v.enganche - (abonadoPorVenta.get(v.ventaId) ?? 0), 0);
  };
  const totalAbonadoLote = (l: Lote): number => {
    const v = ventaPorLote.get(l.loteId);
    if (!v) return 0;
    return v.enganche + (abonadoPorVenta.get(v.ventaId) ?? 0);
  };

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return lotes.filter((l) => {
      if (filtro !== "Todos" && l.estado !== filtro) return false;
      if (!q) return true;
      const venta = ventaPorLote.get(l.loteId);
      const cliente = venta ? clienteMap.get(venta.clienteId) : null;
      return (
        l.loteId.toLowerCase().includes(q) ||
        String(l.numero).includes(q) ||
        (cliente?.nombre ?? "").toLowerCase().includes(q) ||
        l.calle.toLowerCase().includes(q)
      );
    });
  }, [busqueda, filtro, lotes, ventaPorLote, clienteMap]);

  const hayFiltro = busqueda.trim().length > 0 || filtro !== "Todos";

  const enPlano = filtrados.filter((l) => (busqueda.trim() ? true : l.manzana === manzanaActiva));
  const porManzana = MANZANAS.map((m) => ({
    manzana: m,
    lotes: enPlano.filter((l) => l.manzana === m).sort((a, b) => a.numero - b.numero),
  })).filter((g) => g.lotes.length > 0);

  const lote = seleccion ? lotes.find((l) => l.loteId === seleccion) : null;
  const venta = lote ? ventaPorLote.get(lote.loteId) : null;
  const cliente = venta ? clienteMap.get(venta.clienteId) : null;
  const abonosLote = venta
    ? abonos.filter((a) => a.ventaId === venta.ventaId).sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
    : [];

  const conSaldo = lotes.filter((l) => l.estado === "Vendido" || l.estado === "Apartado");
  const porCobrar = conSaldo.reduce((s, l) => s + saldoLote(l), 0);
  const totales = {
    total: lotes.length,
    disponibles: lotes.filter((l) => l.estado === "Disponible").length,
    apartados: lotes.filter((l) => l.estado === "Apartado").length,
    vendidos: lotes.filter((l) => l.estado === "Vendido").length,
    porCobrar,
  };

  return (
    <>
      <section className="rise mb-6 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-accent">Vista general</p>
          <h1 className="text-4xl font-extrabold leading-[0.95] tracking-tight lg:text-5xl">Lotes por manzana</h1>
          <p className="mt-2 max-w-[52ch] text-muted-foreground">
            Los datos se leen de la hoja de Google del abuelito. Elige un lote para ver medidas, precio, cliente y saldo.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar lote, cliente o calle…"
            className="glass-soft h-11 min-w-[260px] rounded-2xl px-4 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
          />
          <select
            value={filtro}
            onChange={(e) => setFiltro(e.target.value as Estado | "Todos")}
            className="glass-soft h-11 rounded-2xl px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="Todos">Todos los estados</option>
            {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
      </section>

      <section className="rise mb-7 grid grid-cols-2 gap-4 lg:grid-cols-5" style={{ animationDelay: "80ms" }}>
        {[
          { etiqueta: "Lotes totales", valor: String(totales.total), color: "text-foreground" },
          { etiqueta: "Disponibles",   valor: String(totales.disponibles), color: "text-disponible" },
          { etiqueta: "Apartados",     valor: String(totales.apartados),   color: "text-apartado" },
          { etiqueta: "Vendidos",      valor: String(totales.vendidos),    color: "text-vendido" },
          { etiqueta: "Por cobrar",    valor: pesos(totales.porCobrar),    color: "text-primary" },
        ].map((k) => (
          <div key={k.etiqueta} className="glass rounded-3xl p-5">
            <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{k.etiqueta}</p>
            <p className={`mt-2 font-mono text-3xl font-semibold tracking-tight ${k.color}`}>{k.valor}</p>
          </div>
        ))}
      </section>

      <section className="rise mb-7" style={{ animationDelay: "110ms" }}>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Mapa interactivo del fraccionamiento</p>
          <p className="font-mono text-[11px] text-muted-foreground">Cada rectángulo es un lote, con su color de estado.</p>
        </div>
        <PlanoInteractivo
          lotes={lotes}
          seleccion={seleccion ?? ""}
          manzanaActiva={busqueda.trim() ? null : manzanaActiva}
          onSeleccionar={setSeleccion}
          onManzana={(m) => { setManzanaActiva(m); setBusqueda(""); }}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-12">
        <div className="rise lg:col-span-7" style={{ animationDelay: "140ms" }}>
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {MANZANAS.map((m) => (
              <button
                key={m}
                onClick={() => { setManzanaActiva(m); setBusqueda(""); }}
                className={`h-9 rounded-xl px-3 font-mono text-xs font-semibold transition ${
                  manzanaActiva === m && !busqueda.trim()
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                    : "glass-soft text-muted-foreground hover:text-foreground"
                }`}
              >Mz-{m}</button>
            ))}
          </div>
          <div className="glass rounded-3xl p-4 lg:p-5">
            {porManzana.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Ningún lote coincide con la búsqueda.
              </p>
            )}
            {porManzana.map((grupo) => (
              <div key={grupo.manzana} className="mb-5 last:mb-0">
                <div className="mb-2 flex items-baseline gap-2">
                  <span className="font-mono text-sm font-semibold">Manzana {grupo.manzana}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">· {grupo.lotes.length} lotes</span>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                  {grupo.lotes.map((l) => {
                    const est = ESTILO[l.estado];
                    const activo = l.loteId === seleccion;
                    return (
                      <button
                        key={l.loteId}
                        onClick={() => setSeleccion(l.loteId)}
                        className={`flex aspect-[4/3] flex-col justify-between rounded-2xl p-2.5 text-left ring-1 transition hover:-translate-y-0.5 ${est.chip} ${activo ? "ring-2 ring-primary" : ""}`}
                      >
                        <span className={`font-mono text-[11px] font-semibold ${est.texto}`}>{l.loteId}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">{l.precioLista ? pesos(l.precioLista) : "—"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rise space-y-6 lg:col-span-5" style={{ animationDelay: "200ms" }}>
          {!lote && (
            <div className="glass rounded-3xl p-10 text-center text-muted-foreground">
              Selecciona un lote para ver su ficha.
            </div>
          )}
          {lote && (
            <div className="glass overflow-hidden rounded-3xl">
              <div className="flex items-start justify-between gap-3 border-b border-border px-5 pb-4 pt-5">
                <div>
                  <p className="mb-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Ficha de lote</p>
                  <h2 className="text-3xl font-extrabold tracking-tight">Lote {lote.loteId}</h2>
                  <p className="mt-1 font-mono text-sm text-muted-foreground">
                    Manzana {lote.manzana} · {lote.calle || "sin calle"}{lote.esquina ? " · esquina" : ""}
                  </p>
                </div>
                <span className={`rounded-xl px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider ring-1 ${ESTILO[lote.estado].chip} ${ESTILO[lote.estado].texto}`}>{lote.estado}</span>
              </div>

              <div className="grid grid-cols-2 gap-px bg-border">
                <Dato etiqueta="Superficie"     valor={`${(lote.frente * lote.fondo).toFixed(2)} m²`} />
                <Dato etiqueta="Frente × fondo" valor={`${lote.frente} × ${lote.fondo}`} />
                <Dato etiqueta="Precio lista"   valor={lote.precioLista ? pesos(lote.precioLista) : "—"} />
                <Dato etiqueta="Precio final"   valor={venta?.precioFinal ? pesos(venta.precioFinal) : "—"} />
                <Dato etiqueta="Cliente"        valor={cliente?.nombre ?? "Sin asignar"} />
                <Dato etiqueta="Enganche"       valor={venta?.enganche ? pesos(venta.enganche) : "—"} />
              </div>

              {venta ? (
                <>
                  <div className="flex items-center justify-between border-t border-border px-5 py-4">
                    <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Saldo pendiente</p>
                    <p className="font-mono text-3xl font-semibold tracking-tight text-primary">{pesos(saldoLote(lote))}</p>
                  </div>
                  <div className="px-5 pb-5">
                    <div className="h-2 overflow-hidden rounded-full bg-border">
                      <div className="h-full bg-disponible" style={{ width: `${Math.min(100, (totalAbonadoLote(lote) / (venta.precioFinal || lote.precioLista || 1)) * 100).toFixed(0)}%` }} />
                    </div>
                    <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                      Abonado {pesos(totalAbonadoLote(lote))} de {pesos(venta.precioFinal || lote.precioLista)} (incluye enganche)
                    </p>
                  </div>

                  <div className="border-t border-border px-5 py-4">
                    <p className="mb-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                      Abonos ({abonosLote.length})
                    </p>
                    {abonosLote.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Sin abonos aún.</p>
                    ) : (
                      <ul className="space-y-2">
                        {abonosLote.slice(0, 6).map((a) => (
                          <li key={a.abonoId} className={`flex items-center justify-between font-mono text-xs ${a.cancelado ? "line-through opacity-50" : ""}`}>
                            <span>{a.fecha} · {a.metodo}</span>
                            <span className="font-semibold text-foreground">{pesos(a.monto)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              ) : (
                <p className="px-5 py-5 text-sm text-muted-foreground">Lote libre. No hay venta ni abonos registrados.</p>
              )}

              <div className="border-t border-border px-5 py-4">
                <a href={`/lotes/${lote.loteId}`} className="glass-soft h-11 w-full grid place-items-center rounded-2xl font-semibold transition hover:text-primary">
                  Abrir ficha completa
                </a>
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="bg-card px-5 py-4">
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{etiqueta}</p>
      <p className="mt-1 font-mono text-sm font-semibold">{valor}</p>
    </div>
  );
}
