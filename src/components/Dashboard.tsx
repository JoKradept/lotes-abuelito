import { useMemo, useState } from "react";
import { actions } from "astro:actions";
import type { Abono, Cliente, Estado, Lote, Venta } from "../lib/domain";
import { DIAS_FRECUENCIA, proximoAbono } from "../lib/venta-utils";
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

const VENTANAS = { hoy: 1, semana: 7, mes: 30, todo: Infinity } as const;
type Ventana = keyof typeof VENTANAS;

export function Dashboard({ lotes, ventas, abonos: abonosProp, clientes }: Props) {
  const [abonos, setAbonos] = useState<Abono[]>(abonosProp);
  const [seleccion, setSeleccion] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URL(window.location.href).searchParams.get("lote");
  });
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<Estado | "Todos">("Todos");
  const [manzanaActiva, setManzanaActiva] = useState<string>("A");
  const [ventana, setVentana] = useState<Ventana>("mes");
  const [notifAbierto, setNotifAbierto] = useState(false);
  const [fakeHoy, setFakeHoy] = useState<string>("");
  const hoy = fakeHoy ? new Date(fakeHoy + "T12:00:00") : new Date();
  const hoyMs = hoy.getTime();

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

  const ultimoAbonoFecha = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of abonos) {
      if (a.cancelado) continue;
      const prev = m.get(a.ventaId);
      if (!prev || a.fecha > prev) m.set(a.ventaId, a.fecha);
    }
    return m;
  }, [abonos]);

  // Suma de saldos de ventas cuya próxima cuota vence dentro de N días.
  const porCobrarEn = (dias: number) => {
    if (!isFinite(dias)) return conSaldo.reduce((s, l) => s + saldoLote(l), 0);
    const limite = hoyMs + dias * 86_400_000;
    let total = 0;
    for (const l of conSaldo) {
      const v = ventaPorLote.get(l.loteId);
      if (!v) continue;
      const ref = ultimoAbonoFecha.get(v.ventaId) ?? v.fecha;
      if (!ref) continue;
      const proximo = new Date(ref).getTime() + (DIAS_FRECUENCIA[v.frecuenciaPago] ?? 30) * 86_400_000;
      if (proximo <= limite) total += saldoLote(l);
    }
    return total;
  };
  const porCobrar = porCobrarEn(VENTANAS[ventana]);
  const totales = {
    total: lotes.length,
    disponibles: lotes.filter((l) => l.estado === "Disponible").length,
    apartados: lotes.filter((l) => l.estado === "Apartado").length,
    vendidos: lotes.filter((l) => l.estado === "Vendido").length,
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
            list="sugerencias-busqueda"
            className="glass-soft h-11 min-w-[260px] rounded-2xl px-4 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
          />
          <datalist id="sugerencias-busqueda">
            {lotes.map((l) => <option key={`l-${l.loteId}`} value={l.loteId}>{l.calle || `Manzana ${l.manzana}`}</option>)}
            {clientes.map((c) => <option key={`c-${c.clienteId}`} value={c.nombre} />)}
            {[...new Set(lotes.map((l) => l.calle).filter(Boolean))].map((c) => <option key={`ca-${c}`} value={c} />)}
          </datalist>
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
        ].map((k) => (
          <div key={k.etiqueta} className="glass rounded-3xl p-5">
            <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{k.etiqueta}</p>
            <p className={`mt-2 font-mono text-3xl font-semibold tracking-tight ${k.color}`}>{k.valor}</p>
          </div>
        ))}
        <div className="glass rounded-3xl p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Por cobrar</p>
            <select
              value={ventana}
              onChange={(e) => setVentana(e.target.value as Ventana)}
              className="glass-soft h-7 rounded-lg px-2 font-mono text-[10px] uppercase outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="hoy">Hoy</option>
              <option value="semana">Semana</option>
              <option value="mes">Mes</option>
              <option value="todo">Todo</option>
            </select>
          </div>
          <p className="mt-2 font-mono text-3xl font-semibold tracking-tight text-primary">{pesos(porCobrar)}</p>
        </div>
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

      <section>
        <div className="rise" style={{ animationDelay: "140ms" }}>
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
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-8">
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

      </section>

      {lote && (
        <FichaSheet lote={lote} venta={venta ?? null} cliente={cliente ?? null} clientes={clientes} abonos={abonos} saldo={saldoLote(lote)} totalAbonado={totalAbonadoLote(lote)} hoyMs={hoyMs} onAbono={(a) => setAbonos([...abonos, a])} onClose={() => setSeleccion(null)} />
      )}

      <NotificacionesFAB
        lotes={lotes} ventas={ventas} clientes={clienteMap} abonos={abonos}
        hoyMs={hoyMs} onSeleccionar={setSeleccion}
      />
      <CalendarioFAB
        lotes={lotes} ventas={ventas} clientes={clienteMap} abonos={abonos}
        hoy={hoy} onSeleccionar={setSeleccion}
      />

      <div className="fixed bottom-6 left-6 z-30 rounded-full bg-white shadow-2xl ring-1 ring-border px-3 py-2 flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase text-muted-foreground">Fingir hoy</span>
        <input type="date" value={fakeHoy} onChange={(e) => setFakeHoy(e.target.value)}
          className="rounded-lg border border-border bg-neutral-100 px-2 py-1 text-xs" />
        {fakeHoy && (
          <button onClick={() => setFakeHoy("")} className="text-xs text-primary font-bold">✕</button>
        )}
      </div>
    </>
  );
}

function NotificacionesFAB({ lotes, ventas, clientes, abonos, hoyMs, onSeleccionar }: {
  lotes: Lote[]; ventas: Venta[]; clientes: Map<string, Cliente>; abonos: Abono[];
  hoyMs: number; onSeleccionar: (id: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const ventasVendidas = useMemo(() => {
    const loteEstado = new Map(lotes.map((l) => [l.loteId, l.estado]));
    return ventas.filter((v) => loteEstado.get(v.loteId) === "Vendido");
  }, [lotes, ventas]);

  const abonadoPorVenta = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of abonos) { if (!a.cancelado) m.set(a.ventaId, (m.get(a.ventaId) ?? 0) + a.monto); }
    return m;
  }, [abonos]);
  const saldoDe = (v: Venta) => Math.max(v.precioFinal - v.enganche - (abonadoPorVenta.get(v.ventaId) ?? 0), 0);

  const liquidables = useMemo(
    () => ventasVendidas.filter((v) => saldoDe(v) <= 0),
    [ventasVendidas, abonadoPorVenta],
  );

  const alertas = useMemo(() => {
    const now = hoyMs;
    return ventasVendidas.filter((v) => saldoDe(v) > 0).map((v) => {
      const p = proximoAbono(v, abonos);
      const dias = Math.floor((now - p.getTime()) / 86_400_000);
      return { venta: v, proximo: p, dias };
    }).filter((a) => a.dias >= -7).sort((a, b) => b.dias - a.dias);
  }, [ventasVendidas, abonos, hoyMs, abonadoPorVenta]);

  const atrasados = alertas.filter((a) => a.dias > 0);
  const proximos = alertas.filter((a) => a.dias <= 0);
  const total = alertas.length + liquidables.length;

  return (
    <>
      <button onClick={() => setAbierto(true)}
        className="fixed bottom-6 right-6 z-30 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-2xl shadow-primary/40 hover:scale-105 transition"
        title="Notificaciones de pago">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
        </svg>
        {total > 0 && (
          <span className={`absolute -top-1 -right-1 min-w-6 h-6 grid place-items-center rounded-full px-1.5 text-xs font-bold ${atrasados.length > 0 ? "bg-apartado" : "bg-accent"} text-white shadow`}>
            {total}
          </span>
        )}
      </button>

      {abierto && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 backdrop-blur-sm" onClick={() => setAbierto(false)}>
          <div className="relative bg-white w-full max-w-lg min-h-[75vh] max-h-[95vh] overflow-y-auto rounded-t-3xl shadow-2xl animate-[slideUp_0.25s_cubic-bezier(0.32,0.72,0,1)]" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-center pt-2 pb-1 bg-white">
              <div className="h-1.5 w-12 rounded-full bg-muted-foreground/30"></div>
              <button onClick={() => setAbierto(false)} className="absolute right-3 top-2 grid size-9 place-items-center rounded-full bg-white shadow ring-1 ring-border hover:bg-primary hover:text-primary-foreground transition">✕</button>
            </div>
            <div className="p-5">
              <h3 className="text-2xl font-extrabold tracking-tight">Notificaciones de pago</h3>
              <p className="mt-1 font-mono text-xs text-muted-foreground">Solo lotes vendidos con cuota próxima o atrasada.</p>

              {total === 0 ? (
                <p className="mt-6 text-center text-sm text-muted-foreground">Todo al día 🎉</p>
              ) : (
                <>
                  {atrasados.length > 0 && (
                    <div className="mt-5">
                      <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-apartado font-semibold">⚠ Atrasados ({atrasados.length})</p>
                      <ul className="space-y-2">
                        {atrasados.map(({ venta, dias }) => {
                          const c = clientes.get(venta.clienteId);
                          return (
                            <li key={venta.ventaId}>
                              <button onClick={() => { setAbierto(false); onSeleccionar(venta.loteId); }}
                                className="w-full text-left rounded-2xl border border-apartado/30 bg-apartado-soft p-3 hover:bg-apartado hover:text-white transition">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="font-semibold">{c?.nombre ?? venta.clienteId}</p>
                                    <p className="font-mono text-xs opacity-75">Lote {venta.loteId} · {c?.telefono || "sin tel"}</p>
                                  </div>
                                  <span className="font-mono text-sm font-bold">{dias}d</span>
                                </div>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {liquidables.length > 0 && (
                    <div className="mt-5">
                      <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-disponible font-semibold">
                        ✓ Pagados completos — listos para liquidar ({liquidables.length})
                      </p>
                      <ul className="space-y-2">
                        {liquidables.map((venta) => {
                          const c = clientes.get(venta.clienteId);
                          return (
                            <li key={venta.ventaId}>
                              <button onClick={() => { setAbierto(false); onSeleccionar(venta.loteId); }}
                                className="w-full text-left rounded-2xl border border-disponible/40 bg-disponible-soft p-3 hover:bg-disponible hover:text-white transition">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="font-semibold">{c?.nombre ?? venta.clienteId}</p>
                                    <p className="font-mono text-xs opacity-75">Lote {venta.loteId} · {c?.telefono || "sin tel"}</p>
                                  </div>
                                  <span className="font-mono text-xs font-bold">{pesos(venta.precioFinal)}</span>
                                </div>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {proximos.length > 0 && (
                    <div className="mt-5">
                      <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-accent font-semibold">Próximos ({proximos.length})</p>
                      <ul className="space-y-2">
                        {proximos.map(({ venta, dias }) => {
                          const c = clientes.get(venta.clienteId);
                          return (
                            <li key={venta.ventaId}>
                              <button onClick={() => { setAbierto(false); onSeleccionar(venta.loteId); }}
                                className="w-full text-left rounded-2xl border border-border bg-neutral-100 p-3 hover:border-primary transition">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="font-semibold">{c?.nombre ?? venta.clienteId}</p>
                                    <p className="font-mono text-xs text-muted-foreground">Lote {venta.loteId} · {c?.telefono || "sin tel"}</p>
                                  </div>
                                  <span className="font-mono text-sm font-bold text-accent">
                                    {dias === 0 ? "hoy" : `en ${-dias}d`}
                                  </span>
                                </div>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="px-5 py-4" style={{ background: "#ffffff" }}>
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{etiqueta}</p>
      <p className="mt-1 font-mono text-sm font-semibold">{valor}</p>
    </div>
  );
}

const ESTILO_FICHA: Record<Estado, { chip: string; texto: string }> = {
  Disponible: { chip: "bg-disponible-soft ring-disponible/25", texto: "text-disponible" },
  Apartado:   { chip: "bg-apartado-soft ring-apartado/30",     texto: "text-apartado" },
  Vendido:    { chip: "bg-vendido-soft ring-vendido/25",       texto: "text-vendido" },
  Liquidado:  { chip: "bg-liquidado-soft ring-liquidado/30",   texto: "text-liquidado" },
};

function FichaSheet({ lote, venta, cliente, clientes, abonos, saldo, totalAbonado, hoyMs, onAbono, onClose }: {
  lote: Lote; venta: Venta | null; cliente: Cliente | null;
  clientes: Cliente[]; abonos: Abono[]; saldo: number; totalAbonado: number;
  hoyMs: number; onAbono: (a: Abono) => void; onClose: () => void;
}) {
  const abonosReales = venta
    ? abonos.filter((a) => a.ventaId === venta.ventaId).sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
    : [];
  // Sintetizar el enganche como una fila más (más antigua) para verlo en la lista + recibo
  const engancheRow: Abono | null = venta && venta.enganche > 0 ? {
    abonoId: `${venta.ventaId}-ENG`, ventaId: venta.ventaId, fecha: venta.fecha,
    monto: venta.enganche, metodo: "Enganche", nota: "Enganche inicial",
    cancelado: false, registradoEn: venta.fecha, avanzaFecha: false,
  } : null;
  const abonosLote = engancheRow ? [...abonosReales, engancheRow] : abonosReales;
  const proximo = venta && (lote.estado === "Vendido" || lote.estado === "Apartado") && saldo > 0 ? proximoAbono(venta, abonos) : null;
  const diasAtraso = proximo ? Math.floor((hoyMs - proximo.getTime()) / 86_400_000) : 0;

  const filas: [string, string][] = [
    ["Superficie", `${(lote.frente * lote.fondo).toFixed(2)} m²`],
    ["Frente × fondo", `${lote.frente} × ${lote.fondo}`],
    ["Precio lista", lote.precioLista ? pesos(lote.precioLista) : "—"],
    ["Esquina", lote.esquina ? "Sí" : "No"],
  ];
  if (lote.estado === "Apartado" || lote.estado === "Vendido" || lote.estado === "Liquidado") {
    filas.push(
      ["Cliente", cliente?.nombre ?? "Sin asignar"],
      ["Teléfono", cliente?.telefono || "—"],
    );
  }
  if (lote.estado === "Apartado") {
    filas.push(["Monto de apartado", venta?.enganche ? pesos(venta.enganche) : "—"]);
  }
  if (lote.estado === "Vendido" || lote.estado === "Liquidado") {
    filas.push(
      ["Precio final", venta?.precioFinal ? pesos(venta.precioFinal) : "—"],
      ["Enganche", venta?.enganche ? pesos(venta.enganche) : "—"],
      ["Frecuencia", venta?.frecuenciaPago || "—"],
      ["Cuota por período", venta?.cuotaPeriodo ? pesos(venta.cuotaPeriodo) : "—"],
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="relative bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-3xl shadow-2xl animate-[slideUp_0.25s_cubic-bezier(0.32,0.72,0,1)]" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-20 flex items-center justify-center pt-2 pb-1 bg-white">
          <div className="h-1.5 w-12 rounded-full bg-muted-foreground/30"></div>
          <button onClick={onClose} className="absolute right-3 top-2 grid size-9 place-items-center rounded-full bg-white shadow ring-1 ring-border hover:bg-primary hover:text-primary-foreground transition" aria-label="Cerrar">✕</button>
        </div>

        <div className="flex items-start justify-between gap-3 border-b border-border px-5 pb-4 pt-3">
          <div>
            <p className="mb-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Ficha de lote</p>
            <h2 className="text-3xl font-extrabold tracking-tight">Lote {lote.loteId}</h2>
            <p className="mt-1 font-mono text-sm text-muted-foreground">
              Manzana {lote.manzana} · {lote.calle || "sin calle"}{lote.esquina ? " · esquina" : ""}
            </p>
          </div>
          <span className={`rounded-xl px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider ring-1 ${ESTILO_FICHA[lote.estado].chip} ${ESTILO_FICHA[lote.estado].texto}`}>{lote.estado}</span>
        </div>

        <div className="grid grid-cols-2 gap-px bg-border border-y border-border">
          {filas.map(([k, v]) => <Dato key={k} etiqueta={k} valor={v} />)}
        </div>

        {lote.notas && (
          <div className="border-b border-border px-5 py-4">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Notas</p>
            <p className="mt-1 text-sm">{lote.notas}</p>
          </div>
        )}

        {lote.estado === "Vendido" && venta && saldo <= 0 && (
          <div className="border-b border-border px-5 py-4 bg-disponible-soft">
            <p className="font-mono text-[11px] uppercase tracking-wider text-disponible font-bold">✓ Pagado completamente</p>
            <p className="mt-1 text-sm">Este lote ya no tiene saldo pendiente. Cámbialo a <strong>Liquidado</strong> para cerrar la venta.</p>
            <MarcarLiquidado loteId={lote.loteId} />
          </div>
        )}

        {lote.estado === "Vendido" && venta && (
          <>
            <div className="border-b border-border px-5 py-4">
              <div className="flex items-center justify-between">
                <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Saldo pendiente</p>
                <p className="font-mono text-2xl font-bold text-primary">{pesos(saldo)}</p>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-200">
                <div className="h-full bg-disponible" style={{ width: `${Math.min(100, (totalAbonado / (venta.precioFinal || lote.precioLista || 1)) * 100).toFixed(0)}%` }} />
              </div>
              <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                Abonado {pesos(totalAbonado)} de {pesos(venta.precioFinal || lote.precioLista)}
              </p>
              {proximo && (
                <div className={`mt-3 rounded-xl px-3 py-2 font-mono text-xs ${diasAtraso > 0 ? "bg-apartado text-white" : diasAtraso >= -7 ? "bg-apartado-soft text-apartado" : "bg-neutral-100 text-muted-foreground"}`}>
                  {diasAtraso > 0 ? `⚠ Atrasado ${diasAtraso} día${diasAtraso === 1 ? "" : "s"}` :
                    diasAtraso === 0 ? "Próximo pago: hoy" :
                    `Próximo pago: ${proximo.toISOString().slice(0, 10)} (en ${-diasAtraso} día${-diasAtraso === 1 ? "" : "s"})`}
                </div>
              )}
            </div>

            <div className="border-b border-border px-5 py-4">
              <p className="mb-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Abonos ({abonosLote.length})</p>
              {abonosLote.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin abonos aún.</p>
              ) : (
                <ul className="space-y-2">
                  {abonosLote.slice(0, 8).map((a, idx) => {
                    // Lista ordenada desc (nuevo→viejo). Saldo AL MOMENTO de este abono =
                    // saldo actual + suma de abonos MÁS NUEVOS (idx menor) — para "rebobinar" al pasado.
                    const masNuevos = abonosLote.slice(0, idx).filter((x) => !x.cancelado);
                    const saldoTrasEste = saldo + masNuevos.reduce((s, x) => s + x.monto, 0);
                    return (
                      <li key={a.abonoId} className={`flex items-center justify-between gap-2 font-mono text-xs ${a.cancelado ? "line-through opacity-50" : ""}`}>
                        <span className="flex-1 truncate">{a.fecha} · {a.metodo}</span>
                        <span className="font-semibold text-foreground">{pesos(a.monto)}</span>
                        <ReciboBoton lote={lote} venta={venta!} cliente={cliente} abono={a} saldoDespues={saldoTrasEste} />
                      </li>
                    );
                  })}
                </ul>
              )}
              {venta && <RegistrarAbono venta={venta} saldo={saldo} hoyMs={hoyMs} abonos={abonos} onAbono={onAbono} />}
            </div>
          </>
        )}

        {lote.estado === "Liquidado" && venta && (
          <div className="border-b border-border px-5 py-4 text-center">
            <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Total pagado</p>
            <p className="mt-1 font-mono text-2xl font-bold text-liquidado">{pesos(totalAbonado)}</p>
            <p className="mt-2 font-mono text-[11px] text-muted-foreground">Lote liquidado — sin saldo pendiente</p>
          </div>
        )}

        <div className="px-5 py-4 space-y-2">
          <EditarLote lote={lote} venta={venta} cliente={cliente} clientes={clientes} />
          <a href={`/lotes/${lote.loteId}`} className="h-11 w-full grid place-items-center rounded-2xl border border-border text-sm text-muted-foreground transition hover:border-primary hover:text-primary">
            Abrir ficha completa ↗
          </a>
        </div>
      </div>
    </div>
  );
}

function EditarLote({ lote, venta, cliente, clientes }: { lote: Lote; venta?: Venta | null; cliente?: Cliente | null; clientes: Cliente[] }) {
  const opciones = ["Disponible","Apartado","Vendido","Liquidado"] as Estado[];
  const [abierto, setAbierto] = useState(false);
  const [nuevoEstado, setNuevoEstado] = useState<Estado>(lote.estado);
  const [nombre, setNombre] = useState(cliente?.nombre ?? "");
  const [nota, setNota] = useState(venta?.notas ?? "");
  const [enganche, setEnganche] = useState(String(venta?.enganche ?? ""));
  const [cuotaPeriodo, setCuotaPeriodo] = useState(String(venta?.cuotaPeriodo ?? ""));
  const [editarPrecio, setEditarPrecio] = useState(false);
  const [precioLista, setPrecioLista] = useState(String(lote.precioLista ?? ""));
  const [frecuencia, setFrecuencia] = useState(venta?.frecuenciaPago || "Mensual");
  const [guardando, setGuardando] = useState(false);
  const [confirmDisp, setConfirmDisp] = useState(false);
  const [listaClientes, setListaClientes] = useState(clientes);
  const [dialogAbierto, setDialogAbierto] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoTelDialog, setNuevoTelDialog] = useState("");
  const [nuevaDireccion, setNuevaDireccion] = useState("");
  const [nuevasNotas, setNuevasNotas] = useState("");
  const [creando, setCreando] = useState(false);

  const clienteMatch = listaClientes.find((c) => c.nombre.trim() === nombre.trim());
  const telefonoMostrado = clienteMatch?.telefono ?? "";
  const requiereCliente = nuevoEstado === "Apartado" || nuevoEstado === "Vendido" || nuevoEstado === "Liquidado";
  const bloqueado = requiereCliente && !!nombre.trim() && !clienteMatch;

  const ejecutarGuardado = async () => {
    setGuardando(true);
    const { error } = await actions.guardarVentaRapida({
      loteId: lote.loteId,
      cliente: nombre,
      telefono: telefonoMostrado,
      estado: nuevoEstado,
      precioFinal: Number(precioLista) || 0,
      precioListaNuevo: editarPrecio ? (Number(precioLista) || 0) : 0,
      enganche: Math.min(Number(enganche) || 0, Number(precioLista) || 0),
      cuotaPeriodo: Math.min(Number(cuotaPeriodo) || 0, Math.max((Number(precioLista) || 0) - (Number(enganche) || 0), 0)),
      frecuenciaPago: frecuencia as any,
      nota,
    });
    setGuardando(false);
    if (error) { alert(error.message); return; }
    window.location.reload();
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nuevoEstado === "Disponible") { setConfirmDisp(true); return; }
    await ejecutarGuardado();
  };

  const crearNuevoCliente = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoNombre.trim()) return;
    setCreando(true);
    const fd = new FormData();
    fd.set("nombre", nuevoNombre.trim());
    fd.set("telefono", nuevoTelDialog);
    fd.set("direccion", nuevaDireccion);
    fd.set("notas", nuevasNotas);
    const { data, error } = await actions.crearCliente(fd);
    setCreando(false);
    if (error) { alert(error.message); return; }
    const nuevo: Cliente = { clienteId: data!.clienteId, nombre: nuevoNombre.trim(), telefono: nuevoTelDialog, direccion: nuevaDireccion, notas: nuevasNotas };
    setListaClientes([...listaClientes, nuevo]);
    setNombre(nuevo.nombre);
    setNuevoNombre(""); setNuevoTelDialog(""); setNuevaDireccion(""); setNuevasNotas("");
    setDialogAbierto(false);
  };

  return (
    <>
      <button onClick={() => setAbierto(true)}
        className="h-11 w-full rounded-2xl bg-primary text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition hover:opacity-90">
        Editar venta, cliente y estado
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm" onClick={() => setAbierto(false)}>
          <div className="relative bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl shadow-2xl animate-[slideUp_0.25s_cubic-bezier(0.32,0.72,0,1)]" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-center pt-2 pb-1 bg-white">
              <div className="h-1.5 w-12 rounded-full bg-muted-foreground/30"></div>
              <button onClick={() => setAbierto(false)} className="absolute right-3 top-2 grid size-9 place-items-center rounded-full bg-white shadow ring-1 ring-border hover:bg-primary hover:text-primary-foreground transition" aria-label="Cerrar">✕</button>
            </div>
            <div className="p-5">
              <p className="mb-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Editar lote</p>
              <h3 className="mb-1 text-2xl font-extrabold tracking-tight">Lote {lote.loteId}</h3>
              <p className="mb-3 font-mono text-xs text-muted-foreground">Estado actual: <span className="font-semibold text-foreground">{lote.estado}</span></p>

              <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-border bg-neutral-100 p-3 font-mono text-[11px]">
                <div><span className="text-muted-foreground uppercase tracking-wider">Superficie</span><br /><span className="text-sm font-semibold text-foreground">{(lote.frente * lote.fondo).toFixed(2)} m²</span></div>
                <div><span className="text-muted-foreground uppercase tracking-wider">Frente × fondo</span><br /><span className="text-sm font-semibold text-foreground">{lote.frente} × {lote.fondo}</span></div>
                <div><span className="text-muted-foreground uppercase tracking-wider">Manzana</span><br /><span className="text-sm font-semibold text-foreground">{lote.manzana}{lote.esquina ? " · esquina" : ""}</span></div>
                <div><span className="text-muted-foreground uppercase tracking-wider">Calle</span><br /><span className="text-sm font-semibold text-foreground">{lote.calle || "—"}</span></div>
                <div><span className="text-muted-foreground uppercase tracking-wider">Precio lista</span><br /><span className="text-sm font-semibold text-foreground">{lote.precioLista ? pesos(lote.precioLista) : "—"}</span></div>
                <div><span className="text-muted-foreground uppercase tracking-wider">Cliente actual</span><br /><span className="text-sm font-semibold text-foreground truncate block">{cliente?.nombre ?? "Sin asignar"}</span></div>
              </div>

              <form onSubmit={guardar} className="space-y-4">
                <div>
                  <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Estado</p>
                  <div className="grid grid-cols-4 gap-1 rounded-2xl bg-neutral-200 p-1">
                    {opciones.map((e) => (
                      <button key={e} type="button" onClick={() => setNuevoEstado(e)}
                        className={`h-10 rounded-xl font-semibold text-sm transition ${nuevoEstado === e ? "bg-white shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                        {e}{e === lote.estado && " •"}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                    {nuevoEstado === lote.estado ? "Actualizando datos (mismo estado)" : `Cambiando de ${lote.estado} → ${nuevoEstado}`}
                  </p>
                </div>

                {nuevoEstado === "Disponible" && (
                  <div className="rounded-2xl border border-border bg-neutral-100 p-4 text-sm text-muted-foreground">
                    Al guardar, el lote quedará libre. La información de cliente y venta permanecerá en el historial.
                  </div>
                )}

                {nuevoEstado === "Liquidado" && (
                  <div className="rounded-2xl border border-liquidado/40 bg-liquidado-soft p-4 space-y-2">
                    <p className="font-mono text-[11px] uppercase tracking-wider text-liquidado font-semibold">✓ Marcar como Liquidado</p>
                    <p className="text-sm">Se preserva toda la información previa (cliente, precio, enganche, abonos). El lote pasa a estado <strong className="text-liquidado">Liquidado</strong> y ya no se calculan próximos pagos.</p>
                    <p className="font-mono text-[11px] text-muted-foreground">No necesitas llenar más campos. Solo click en <strong>Guardar</strong>.</p>
                  </div>
                )}

                {(nuevoEstado === "Apartado" || nuevoEstado === "Vendido") && (
                  <>
                    <div className="flex gap-2">
                      <input value={nombre} onChange={(e) => setNombre(e.target.value)}
                        placeholder="Nombre del cliente" list="clientes-existentes"
                        className="h-11 flex-1 rounded-2xl border border-border bg-neutral-200 px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
                      <button type="button" onClick={() => setDialogAbierto(true)} title="Agregar nuevo cliente"
                        className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition hover:scale-105">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                          <circle cx="9" cy="7" r="4"/>
                          <line x1="19" y1="8" x2="19" y2="14"/>
                          <line x1="22" y1="11" x2="16" y2="11"/>
                        </svg>
                      </button>
                    </div>
                    <datalist id="clientes-existentes">
                      {listaClientes.map((c) => <option key={c.clienteId} value={c.nombre}>{c.telefono}</option>)}
                    </datalist>

                    <input value={telefonoMostrado} readOnly placeholder="Teléfono (viene del cliente)"
                      className="h-11 w-full rounded-2xl border border-border bg-neutral-100 px-3 text-sm outline-none opacity-70 cursor-not-allowed" />

                    {bloqueado && (
                      <div className="flex items-start gap-2 rounded-2xl bg-apartado-soft ring-1 ring-apartado/40 px-3 py-2.5">
                        <span className="text-apartado font-bold">⚠</span>
                        <p className="font-mono text-[11px] leading-relaxed text-apartado">
                          Este cliente aún no existe. <strong>No se creará automáticamente.</strong> Usa el botón <strong>+</strong> a la derecha para agregarlo primero.
                        </p>
                      </div>
                    )}
                  </>
                )}

                {nuevoEstado === "Apartado" && (
                  <textarea value={nota} onChange={(e) => setNota(e.target.value)}
                    placeholder="Nota sobre el apartado (opcional)" rows={3}
                    className="w-full rounded-2xl border border-border bg-neutral-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
                )}

                {nuevoEstado === "Vendido" && (
                  <>
                    <div className="rounded-2xl border border-border bg-neutral-100 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <label className="font-mono text-xs text-muted-foreground">Costo del lote</label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={editarPrecio} onChange={(e) => setEditarPrecio(e.target.checked)}
                            className="size-5 rounded-full appearance-none border-2 border-border checked:bg-primary checked:border-primary cursor-pointer transition" />
                          <span className="font-mono text-[11px] text-muted-foreground">Editar precio</span>
                        </label>
                      </div>
                      <input inputMode="numeric" value={precioLista} readOnly={!editarPrecio}
                        onChange={(e) => setPrecioLista(e.target.value.replace(/[^\d]/g, ""))}
                        className={`mt-2 h-11 w-full rounded-xl border border-border px-3 font-mono text-lg font-bold outline-none focus:ring-2 focus:ring-ring ${editarPrecio ? "bg-white" : "bg-neutral-200 opacity-70"}`} />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        {(() => {
                          const maxEng = Number(precioLista) || 0;
                          const val = Number(enganche) || 0;
                          const exc = maxEng > 0 && val > maxEng;
                          return (
                            <>
                              <label className="font-mono text-[11px] uppercase text-muted-foreground">
                                Enganche{maxEng > 0 && <span className="opacity-70"> · máx {pesos(maxEng)}</span>}
                              </label>
                              <input inputMode="numeric" value={enganche} onChange={(e) => setEnganche(e.target.value.replace(/[^\d]/g, ""))}
                                placeholder="0" className={`mt-1 h-11 w-full rounded-2xl border ${exc ? "border-apartado" : "border-border"} bg-neutral-200 px-3 font-mono text-sm outline-none focus:ring-2 focus:ring-ring`} />
                              {exc && <p className="mt-1 font-mono text-[11px] text-apartado">⚠ Excede el costo. Se guardará capado.</p>}
                            </>
                          );
                        })()}
                      </div>
                      <div>
                        <label className="font-mono text-[11px] uppercase text-muted-foreground">Frecuencia de pago</label>
                        <select value={frecuencia} onChange={(e) => setFrecuencia(e.target.value)}
                          className="mt-1 h-11 w-full rounded-2xl border border-border bg-neutral-200 px-3 text-sm outline-none focus:ring-2 focus:ring-ring">
                          <option>Semanal</option><option>Quincenal</option><option>Mensual</option><option>Otro</option>
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="font-mono text-[11px] uppercase text-muted-foreground">
                          Monto por período (cuota)
                          {(() => {
                            const max = (Number(precioLista) || 0) - (Number(enganche) || 0);
                            return max > 0 ? <span className="opacity-70"> · máx {pesos(max)}</span> : null;
                          })()}
                        </label>
                        {(() => {
                          const max = (Number(precioLista) || 0) - (Number(enganche) || 0);
                          const val = Number(cuotaPeriodo) || 0;
                          const excede = max > 0 && val > max;
                          return (
                            <>
                              <input inputMode="numeric" value={cuotaPeriodo} onChange={(e) => setCuotaPeriodo(e.target.value.replace(/[^\d]/g, ""))}
                                placeholder="0" className={`mt-1 h-11 w-full rounded-2xl border ${excede ? "border-apartado" : "border-border"} bg-neutral-200 px-3 font-mono text-sm outline-none focus:ring-2 focus:ring-ring`} />
                              {excede && <p className="mt-1 font-mono text-[11px] text-apartado">⚠ Excede el saldo por financiar ({pesos(max)}). Se guardará capado.</p>}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </>
                )}

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button type="button" onClick={() => setAbierto(false)} className="h-11 rounded-2xl border border-border text-sm">Cancelar</button>
                  <button type="submit" disabled={guardando || bloqueado} className="h-11 rounded-2xl bg-primary text-sm font-bold text-primary-foreground shadow-lg shadow-primary/30 disabled:opacity-40">
                    {guardando ? "Guardando…" : "Guardar"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {confirmDisp && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4" onClick={() => setConfirmDisp(false)}>
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-lg font-extrabold tracking-tight">¿Liberar el lote {lote.loteId}?</h4>
            <p className="text-sm text-muted-foreground">
              Quedará como <strong className="text-disponible">Disponible</strong>. La información previa (cliente, precio, abonos) permanecerá en el historial.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setConfirmDisp(false)} className="h-11 rounded-2xl border border-border text-sm">Cancelar</button>
              <button type="button" onClick={async () => { setConfirmDisp(false); await ejecutarGuardado(); }}
                disabled={guardando}
                className="h-11 rounded-2xl bg-destructive text-sm font-bold text-white shadow-lg shadow-destructive/30 disabled:opacity-40">
                {guardando ? "Guardando…" : "Sí, liberar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {dialogAbierto && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 backdrop-blur-sm" onClick={() => setDialogAbierto(false)}>
          <div className="bg-white w-full max-w-lg rounded-t-3xl p-6 pb-8 space-y-4 shadow-2xl animate-[slideUp_0.25s_cubic-bezier(0.32,0.72,0,1)]" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto -mt-2 mb-2 h-1.5 w-12 rounded-full bg-muted-foreground/30"></div>
            <h3 className="text-xl font-extrabold tracking-tight">Nuevo cliente</h3>
            <input value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} placeholder="Nombre completo" autoFocus
              className="h-11 w-full rounded-2xl border border-border bg-neutral-200 px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
            <input value={nuevoTelDialog} onChange={(e) => setNuevoTelDialog(e.target.value)} placeholder="Teléfono" type="tel"
              className="h-11 w-full rounded-2xl border border-border bg-neutral-200 px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
            <input value={nuevaDireccion} onChange={(e) => setNuevaDireccion(e.target.value)} placeholder="Dirección"
              className="h-11 w-full rounded-2xl border border-border bg-neutral-200 px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
            <textarea value={nuevasNotas} onChange={(e) => setNuevasNotas(e.target.value)} placeholder="Notas" rows={2}
              className="w-full rounded-2xl border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setDialogAbierto(false)} className="h-11 rounded-2xl border border-border text-sm">Cancelar</button>
              <button type="button" onClick={crearNuevoCliente} disabled={creando || !nuevoNombre.trim()}
                className="h-11 rounded-2xl bg-primary text-sm font-bold text-primary-foreground shadow-lg shadow-primary/30 disabled:opacity-40">
                {creando ? "Guardando…" : "Crear"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function RegistrarAbono({ venta, saldo, hoyMs, abonos, onAbono }: { venta: Venta; saldo: number; hoyMs: number; abonos: Abono[]; onAbono: (a: Abono) => void }) {
  const proximo = proximoAbono(venta, abonos);
  const atrasado = proximo.getTime() < hoyMs;
  const [modo, setModo] = useState<"abono" | "adelantar" | null>(null);
  const abierto = modo !== null;
  const cuota = venta.cuotaPeriodo || 0;
  const [monto, setMonto] = useState(String(cuota || ""));
  const [metodo, setMetodo] = useState<"Efectivo"|"Transferencia"|"Cheque"|"Otro">("Efectivo");
  const [fecha, setFecha] = useState(new Date(hoyMs).toISOString().slice(0, 10));
  const [nota, setNota] = useState("");
  const [personalizado, setPersonalizado] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const abrir = (m: "abono" | "adelantar") => {
    setModo(m);
    setPersonalizado(false);
    setFecha(new Date(hoyMs).toISOString().slice(0, 10));
    if (m === "adelantar") {
      setMonto(String(Math.min(cuota, saldo)));
      setNota("Adelanto");
    } else {
      setMonto(String(cuota || ""));
      setNota("");
    }
  };
  const cerrar = () => setModo(null);

  const montoNum = Math.min(Number(monto) || 0, saldo);
  const excede = (Number(monto) || 0) > saldo;
  const saldoDespues = Math.max(saldo - montoNum, 0);
  const plazosRest = cuota > 0 ? Math.ceil(saldoDespues / cuota) : 0;

  const registrar = async (fechaVal: string, monto: number, metodoVal: string, notaVal: string, avanza: boolean) => {
    if (monto <= 0) return null;
    setGuardando(true);
    const fd = new FormData();
    fd.set("ventaId", venta.ventaId);
    fd.set("fecha", fechaVal);
    fd.set("monto", String(monto));
    fd.set("metodo", metodoVal);
    fd.set("nota", notaVal);
    fd.set("avanzaFecha", avanza ? "true" : "false");
    const { data, error } = await actions.crearAbono(fd);
    setGuardando(false);
    if (error) { alert(error.message); return null; }
    const nuevo: Abono = {
      abonoId: data!.abonoId, ventaId: venta.ventaId, fecha: fechaVal,
      monto, metodo: metodoVal, nota: notaVal, cancelado: false,
      registradoEn: new Date(hoyMs).toISOString(), avanzaFecha: avanza,
    };
    onAbono(nuevo);
    return nuevo;
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    // modo adelantar → siempre avanza. modo abono → solo avanza si atrasado.
    const avanza = modo === "adelantar" || atrasado;
    const ok = await registrar(fecha, montoNum, metodo, nota, avanza);
    if (ok) cerrar();
  };

  return (
    <>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => abrir("abono")}
          className="h-11 rounded-2xl bg-primary text-sm font-bold text-primary-foreground shadow-lg shadow-primary/30">
          + Registrar abono
        </button>
        <button type="button" onClick={() => abrir("adelantar")} disabled={guardando || cuota <= 0 || saldo <= 0 || atrasado}
          title={atrasado ? "El pago está atrasado — usa Registrar abono" : cuota > 0 ? `Adelanta ${pesos(Math.min(cuota, saldo))}, mueve próximo pago` : "Configura la cuota primero"}
          className="h-11 rounded-2xl border-2 border-primary text-sm font-bold text-primary hover:bg-primary hover:text-primary-foreground transition disabled:opacity-40 disabled:cursor-not-allowed">
          ⏩ Adelantar
        </button>
      </div>

      {abierto && (
        <div className="fixed inset-0 z-[55] flex items-end justify-center bg-black/40 backdrop-blur-sm" onClick={cerrar}>
          <div className="relative bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl shadow-2xl animate-[slideUp_0.25s_cubic-bezier(0.32,0.72,0,1)]" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-center pt-2 pb-1 bg-white">
              <div className="h-1.5 w-12 rounded-full bg-muted-foreground/30"></div>
              <button onClick={cerrar} className="absolute right-3 top-2 grid size-9 place-items-center rounded-full bg-white shadow ring-1 ring-border hover:bg-primary hover:text-primary-foreground transition">✕</button>
            </div>
            <form onSubmit={guardar} className="p-5 space-y-4">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{modo === "adelantar" ? "Adelantar pago" : "Registrar abono"}</p>
                <h3 className="text-2xl font-extrabold tracking-tight">Venta {venta.ventaId}</h3>
              {modo === "adelantar" && (
                <div className="mt-2 rounded-2xl bg-accent/15 border border-accent/30 px-3 py-2 text-sm">
                  ⏩ Este pago <strong>moverá</strong> el próximo pago según la frecuencia ({venta.frecuenciaPago || "Mensual"}).
                </div>
              )}
              {atrasado && (
                <div className="rounded-2xl bg-apartado px-3 py-2.5 text-white shadow-lg shadow-apartado/30 text-sm">
                  ⚠ Pago atrasado. Este abono <strong>moverá</strong> la fecha del próximo pago según la frecuencia.
                </div>
              )}
              </div>

              <div className="rounded-2xl bg-neutral-100 border border-border p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Saldo actual</span><span className="font-semibold">{pesos(saldo)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Cuota configurada</span><span className="font-semibold">{cuota ? pesos(cuota) : "—"}</span></div>
                <div className="flex justify-between border-t border-border pt-1 mt-1"><span className="text-muted-foreground">Saldo después</span><span className="font-bold text-primary">{pesos(saldoDespues)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Plazos restantes</span><span className="font-bold">{cuota > 0 ? plazosRest : "—"}</span></div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={personalizado} onChange={(e) => setPersonalizado(e.target.checked)}
                  className="size-5 rounded-full appearance-none border-2 border-border checked:bg-primary checked:border-primary cursor-pointer" />
                <span className="font-mono text-xs text-muted-foreground">Monto personalizado</span>
              </label>

              <div>
                <label className="font-mono text-[11px] uppercase text-muted-foreground">Monto</label>
                <input inputMode="numeric" value={monto} onChange={(e) => setMonto(e.target.value.replace(/[^\d]/g, ""))}
                  readOnly={!personalizado}
                  className={`mt-1 h-11 w-full rounded-2xl border ${excede ? "border-apartado" : "border-border"} px-3 font-mono text-lg font-bold outline-none focus:ring-2 focus:ring-ring ${personalizado ? "bg-white" : "bg-neutral-200 opacity-70"}`} />
                {excede && (
                  <p className="mt-1 font-mono text-[11px] text-apartado">
                    ⚠ Excede el saldo. Se cobrará máximo {pesos(saldo)}.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-mono text-[11px] uppercase text-muted-foreground">Fecha</label>
                  <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required
                    className="mt-1 h-11 w-full rounded-2xl border border-border bg-neutral-200 px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div>
                  <label className="font-mono text-[11px] uppercase text-muted-foreground">Método</label>
                  <select value={metodo} onChange={(e) => setMetodo(e.target.value as any)}
                    className="mt-1 h-11 w-full rounded-2xl border border-border bg-neutral-200 px-3 text-sm outline-none focus:ring-2 focus:ring-ring">
                    <option>Efectivo</option><option>Transferencia</option><option>Cheque</option><option>Otro</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-mono text-[11px] uppercase text-muted-foreground">Nota (opcional)</label>
                <input value={nota} onChange={(e) => setNota(e.target.value)}
                  className="mt-1 h-11 w-full rounded-2xl border border-border bg-neutral-200 px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={cerrar} className="h-11 rounded-2xl border border-border text-sm">Cancelar</button>
                <button type="submit" disabled={guardando || montoNum <= 0}
                  className="h-11 rounded-2xl bg-primary text-sm font-bold text-primary-foreground shadow-lg shadow-primary/30 disabled:opacity-40">
                  {guardando ? "Guardando…" : modo === "adelantar" ? "Adelantar" : "Registrar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function CalendarioFAB({ lotes, ventas, clientes, abonos, hoy, onSeleccionar }: {
  lotes: Lote[]; ventas: Venta[]; clientes: Map<string, Cliente>; abonos: Abono[];
  hoy: Date; onSeleccionar: (id: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [offset, setOffset] = useState(0);  // meses desde hoy

  const loteEstado = useMemo(() => new Map(lotes.map((l) => [l.loteId, l.estado])), [lotes]);

  const eventosPorDia = useMemo(() => {
    const map = new Map<string, { venta: Venta; cliente?: Cliente }[]>();
    for (const v of ventas) {
      if (loteEstado.get(v.loteId) !== "Vendido") continue;
      const key = proximoAbono(v, abonos).toISOString().slice(0, 10);
      const arr = map.get(key) ?? [];
      arr.push({ venta: v, cliente: clientes.get(v.clienteId) });
      map.set(key, arr);
    }
    return map;
  }, [ventas, abonos, loteEstado, clientes]);

  const mes = new Date(hoy.getFullYear(), hoy.getMonth() + offset, 1);
  const primerDia = mes.getDay();  // 0=domingo
  const dias = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  const nombreMes = mes.toLocaleDateString("es-MX", { month: "long", year: "numeric" });
  const hoyStr = hoy.toISOString().slice(0, 10);

  const celdas: (number | null)[] = [
    ...Array(primerDia).fill(null),
    ...Array.from({ length: dias }, (_, i) => i + 1),
  ];
  // rellenar hasta 42 (6 semanas) para altura estable
  while (celdas.length < 42) celdas.push(null);

  return (
    <>
      <button onClick={() => setAbierto(true)}
        className="fixed bottom-24 right-6 z-30 grid size-14 place-items-center rounded-full bg-accent text-accent-foreground shadow-2xl shadow-accent/40 hover:scale-105 transition"
        title="Calendario de pagos">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </button>

      {abierto && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 backdrop-blur-sm" onClick={() => setAbierto(false)}>
          <div className="relative bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-3xl shadow-2xl animate-[slideUp_0.25s_cubic-bezier(0.32,0.72,0,1)]" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-center pt-2 pb-1 bg-white">
              <div className="h-1.5 w-12 rounded-full bg-muted-foreground/30"></div>
              <button onClick={() => setAbierto(false)} className="absolute right-3 top-2 grid size-9 place-items-center rounded-full bg-white shadow ring-1 ring-border hover:bg-primary hover:text-primary-foreground transition">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <button onClick={() => setOffset(offset - 1)} className="grid size-9 place-items-center rounded-full border border-border hover:bg-primary hover:text-primary-foreground">‹</button>
                <div className="flex items-center gap-2 flex-1 justify-center">
                  <select
                    value={mes.getMonth()}
                    onChange={(e) => setOffset((Number(e.target.value) - hoy.getMonth()) + (mes.getFullYear() - hoy.getFullYear()) * 12)}
                    className="h-9 rounded-xl border border-border bg-neutral-100 px-2 text-sm outline-none focus:ring-2 focus:ring-ring capitalize"
                  >
                    {["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"].map((n, i) => (
                      <option key={n} value={i}>{n}</option>
                    ))}
                  </select>
                  <select
                    value={mes.getFullYear()}
                    onChange={(e) => setOffset((mes.getMonth() - hoy.getMonth()) + (Number(e.target.value) - hoy.getFullYear()) * 12)}
                    className="h-9 rounded-xl border border-border bg-neutral-100 px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  >
                    {Array.from({ length: 11 }, (_, i) => hoy.getFullYear() - 5 + i).map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                  {offset !== 0 && (
                    <button onClick={() => setOffset(0)}
                      className="h-9 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground shadow-lg shadow-primary/30">
                      Hoy
                    </button>
                  )}
                </div>
                <button onClick={() => setOffset(offset + 1)} className="grid size-9 place-items-center rounded-full border border-border hover:bg-primary hover:text-primary-foreground">›</button>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center font-mono text-[10px] uppercase text-muted-foreground">
                {["D","L","M","X","J","V","S"].map((d) => <div key={d} className="py-1">{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {celdas.map((d, i) => {
                  if (d === null) return <div key={`e-${i}`} />;
                  const fecha = `${mes.getFullYear()}-${String(mes.getMonth()+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
                  const evs = eventosPorDia.get(fecha) ?? [];
                  const esHoy = fecha === hoyStr;
                  const atrasado = fecha < hoyStr && evs.length > 0;
                  return (
                    <div key={fecha} className={`min-h-[70px] rounded-xl border p-1 text-left ${esHoy ? "border-primary ring-2 ring-primary/30" : "border-border"} ${atrasado ? "bg-apartado-soft" : "bg-white"}`}>
                      <div className={`font-mono text-[10px] font-bold ${esHoy ? "text-primary" : atrasado ? "text-apartado" : "text-muted-foreground"}`}>{d}</div>
                      <div className="mt-0.5 space-y-0.5">
                        {evs.slice(0, 3).map(({ venta, cliente }) => (
                          <button key={venta.ventaId} onClick={() => { setAbierto(false); onSeleccionar(venta.loteId); }}
                            className="w-full truncate rounded bg-primary/10 hover:bg-primary hover:text-primary-foreground px-1 py-0.5 text-[9px] font-mono text-left">
                            {cliente?.nombre?.split(" ")[0] ?? "?"} · {venta.loteId}
                          </button>
                        ))}
                        {evs.length > 3 && <div className="text-[9px] text-muted-foreground">+{evs.length - 3}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MarcarLiquidado({ loteId }: { loteId: string }) {
  const [pregunta, setPregunta] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const confirmar = async () => {
    setGuardando(true);
    const { error } = await actions.guardarVentaRapida({ loteId, estado: "Liquidado" } as any);
    setGuardando(false);
    if (error) { alert(error.message); return; }
    window.location.reload();
  };
  return (
    <>
      <button onClick={() => setPregunta(true)}
        className="mt-3 h-11 w-full rounded-2xl bg-disponible text-white font-bold text-sm shadow-lg shadow-disponible/30">
        Marcar como Liquidado
      </button>
      {pregunta && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4" onClick={() => setPregunta(false)}>
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-lg font-extrabold tracking-tight">Marcar {loteId} como Liquidado</h4>
            <p className="text-sm text-muted-foreground">
              El lote pasará a estado <strong className="text-liquidado">Liquidado</strong>. Se conserva todo el historial de venta y abonos.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setPregunta(false)} className="h-11 rounded-2xl border border-border text-sm">Cancelar</button>
              <button onClick={confirmar} disabled={guardando}
                className="h-11 rounded-2xl bg-disponible text-white text-sm font-bold shadow-lg shadow-disponible/30 disabled:opacity-40">
                {guardando ? "Guardando…" : "Sí, liquidar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ReciboBoton({ lote, venta, cliente, abono, saldoDespues }: {
  lote: Lote; venta: Venta; cliente: Cliente | null; abono: Abono; saldoDespues: number;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)}
        title="Ver / imprimir recibo"
        className="grid size-7 place-items-center rounded-lg bg-accent text-white shadow-sm hover:scale-110 transition">
        🧾
      </button>
      {abierto && (
        <ReciboSheet lote={lote} venta={venta} cliente={cliente} abono={abono} saldoDespues={saldoDespues} onClose={() => setAbierto(false)} />
      )}
    </>
  );
}

function ReciboSheet({ lote, venta, cliente, abono, saldoDespues, onClose }: {
  lote: Lote; venta: Venta; cliente: Cliente | null; abono: Abono; saldoDespues: number; onClose: () => void;
}) {
  const imprimir = () => {
    const w = window.open("", "_blank", "width=800,height=1000");
    if (!w) return;
    const nota = abono.nota ? `<tr><td class="k">Nota</td><td class="v">${abono.nota}</td></tr>` : "";
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Recibo ${abono.abonoId}</title>
      <style>
        body { font-family: system-ui, sans-serif; padding: 20mm; margin: 0; color: #111; }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 6px 0; vertical-align: top; }
        .k { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #666; }
        .v { text-align: right; font-weight: 600; }
        h2 { font-size: 24px; margin: 0; letter-spacing: -.02em; }
        .header { border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 16px; }
        .brand { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: #666; }
        .folio { font-family: monospace; font-size: 12px; color: #666; margin-top: 4px; }
        .monto-box { border: 2px solid #000; border-radius: 12px; padding: 12px; margin: 16px 0; display: flex; justify-content: space-between; align-items: center; }
        .monto-box .lbl { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
        .monto-box .val { font-size: 30px; font-weight: 800; font-family: monospace; }
        .resumen { background: #f5f5f5; border-radius: 12px; padding: 12px; font-size: 13px; }
        .resumen div { display: flex; justify-content: space-between; padding: 2px 0; }
        .firmas { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 40px; }
        .firma { border-top: 1px solid #000; padding-top: 6px; text-align: center; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; }
        .foot { margin-top: 24px; font-size: 9px; color: #666; text-align: center; font-family: monospace; }
      </style></head><body>
      <div class="header">
        <p class="brand">Cumbres de Tiripetío</p>
        <h2>RECIBO DE PAGO</h2>
        <p class="folio">Folio: ${abono.abonoId}</p>
      </div>
      <table>
        <tr><td class="k">Fecha del pago</td><td class="v">${abono.fecha}</td></tr>
        <tr><td class="k">Cliente</td><td class="v">${cliente?.nombre ?? "—"}</td></tr>
        <tr><td class="k">Teléfono</td><td class="v">${cliente?.telefono ?? "—"}</td></tr>
        <tr><td class="k">Lote</td><td class="v">${lote.loteId} · Manzana ${lote.manzana}</td></tr>
        <tr><td class="k">Medidas</td><td class="v">${lote.frente} × ${lote.fondo} m (${(lote.frente * lote.fondo).toFixed(2)} m²)</td></tr>
        <tr><td class="k">Precio total</td><td class="v">${pesos(venta.precioFinal || lote.precioLista)}</td></tr>
        <tr><td class="k">Enganche</td><td class="v">${pesos(venta.enganche)}</td></tr>
        <tr><td class="k">Método</td><td class="v">${abono.metodo}</td></tr>
        ${nota}
      </table>
      <div class="monto-box"><span class="lbl">Monto recibido</span><span class="val">${pesos(abono.monto)}</span></div>
      <div class="resumen">
        <div><span>Saldo pendiente al cierre</span><strong>${pesos(saldoDespues)}</strong></div>
        <div><span>Cuota configurada</span><span>${venta.cuotaPeriodo ? pesos(venta.cuotaPeriodo) : "—"}</span></div>
        <div><span>Frecuencia</span><span>${venta.frecuenciaPago || "—"}</span></div>
      </div>
      <div class="firmas">
        <div class="firma">Firma del cliente</div>
        <div class="firma">Firma del vendedor</div>
      </div>
      <p class="foot">Emitido el ${abono.registradoEn?.slice(0, 10) || "—"} · Comprobante interno de control, no reemplaza documentos oficiales.</p>
    </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 200);
  };
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 backdrop-blur-sm no-print" onClick={onClose}>
      <div className="relative bg-white w-full max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl shadow-2xl animate-[slideUp_0.25s_cubic-bezier(0.32,0.72,0,1)]" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-center pt-2 pb-1 bg-white no-print">
          <div className="h-1.5 w-12 rounded-full bg-muted-foreground/30"></div>
          <button onClick={onClose} className="absolute right-3 top-2 grid size-9 place-items-center rounded-full bg-white shadow ring-1 ring-border hover:bg-primary hover:text-primary-foreground transition">✕</button>
        </div>

        <div className="p-6 recibo-print">
          <div className="mb-4 border-b-2 border-black pb-3">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Cumbres de Tiripetío</p>
            <h2 className="text-2xl font-extrabold tracking-tight">RECIBO DE PAGO</h2>
            <p className="mt-1 font-mono text-xs text-muted-foreground">Folio: {abono.abonoId}</p>
          </div>

          <table className="w-full text-sm">
            <tbody>
              <Fila k="Fecha del pago" v={abono.fecha} />
              <Fila k="Cliente" v={cliente?.nombre ?? "—"} />
              <Fila k="Teléfono" v={cliente?.telefono ?? "—"} />
              <Fila k="Lote" v={`${lote.loteId} · Manzana ${lote.manzana}`} />
              <Fila k="Medidas" v={`${lote.frente} × ${lote.fondo} m (${(lote.frente * lote.fondo).toFixed(2)} m²)`} />
              <Fila k="Precio total" v={pesos(venta.precioFinal || lote.precioLista)} />
              <Fila k="Enganche" v={pesos(venta.enganche)} />
              <Fila k="Método" v={abono.metodo} />
              {abono.nota && <Fila k="Nota" v={abono.nota} />}
            </tbody>
          </table>

          <div className="my-4 rounded-xl border-2 border-black p-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-wider">Monto recibido</span>
              <span className="font-mono text-3xl font-extrabold">{pesos(abono.monto)}</span>
            </div>
          </div>

          <div className="rounded-xl bg-neutral-100 p-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Saldo pendiente al cierre</span><span className="font-bold">{pesos(saldoDespues)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Cuota configurada</span><span>{venta.cuotaPeriodo ? pesos(venta.cuotaPeriodo) : "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Frecuencia</span><span>{venta.frecuenciaPago || "—"}</span></div>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-6">
            <div className="border-t border-black pt-2 text-center font-mono text-[10px] uppercase tracking-wider">Firma del cliente</div>
            <div className="border-t border-black pt-2 text-center font-mono text-[10px] uppercase tracking-wider">Firma del vendedor</div>
          </div>

          <p className="mt-6 font-mono text-[9px] text-muted-foreground text-center">
            Emitido el {abono.registradoEn?.slice(0, 10) || "—"} · Este recibo es un comprobante interno de control, no reemplaza documentos oficiales.
          </p>
        </div>

        <div className="p-4 border-t border-border grid grid-cols-2 gap-3 no-print">
          <button type="button" onClick={onClose} className="h-11 rounded-2xl border border-border text-sm">Cerrar</button>
          <button type="button" onClick={imprimir}
            className="h-11 rounded-2xl bg-primary text-sm font-bold text-primary-foreground shadow-lg shadow-primary/30">
            🖨️ Imprimir / Guardar PDF
          </button>
        </div>
      </div>
    </div>
  );
}

function Fila({ k, v }: { k: string; v: string }) {
  return (
    <tr className="border-b border-border">
      <td className="py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground align-top">{k}</td>
      <td className="py-1.5 text-right font-semibold">{v}</td>
    </tr>
  );
}
