import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AREAS_VERDES_PLANO,
  LOTES_PLANO,
  MANZANAS_PLANO,
  VIEWBOX_PLANO,
  type LotePlano,
} from "../lib/plano-geo";
import type { Estado, Lote } from "../lib/domain";
import { pesos } from "../lib/format";

const COLOR: Record<Estado, string> = {
  Disponible: "var(--disponible)",
  Apartado: "var(--apartado)",
  Vendido: "var(--vendido)",
  Liquidado: "var(--liquidado)",
};

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 14;

/** Adorna un lote de la SoT con la geometría del plano por número. */
const POLIGONO_POR_NUMERO = new Map<number, LotePlano>(
  LOTES_PLANO.map((p) => [p.numero, p]),
);

type Props = {
  lotes: Lote[];
  seleccion?: string;
  manzanaActiva?: string | null;
  onSeleccionar?: (loteId: string) => void;
  onManzana?: (m: string) => void;
};

export function PlanoInteractivo({
  lotes,
  seleccion = "",
  manzanaActiva = null,
  onSeleccionar = (loteId) => { window.location.href = `/lotes/${loteId}`; },
  onManzana = (m) => { window.location.href = `/?manzana=${m}`; },
}: Props) {
  const [hover, setHover] = useState<{ lote: Lote; x: number; y: number } | null>(null);
  const [vista, setVista] = useState({ zoom: 1, x: 0, y: 0 });
  const contenedor = useRef<HTMLDivElement>(null);
  const arrastre = useRef<{ x: number; y: number; ox: number; oy: number; movido: boolean } | null>(null);

  const porNumero = useMemo(() => new Map(lotes.map((l) => [l.numero, l])), [lotes]);

  const zoomEn = useCallback((px: number, py: number, factor: number) => {
    setVista((v) => {
      const next = Math.min(Math.max(v.zoom * factor, MIN_ZOOM), MAX_ZOOM);
      const k = next / v.zoom;
      return { zoom: next, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
    });
  }, []);
  const zoomRef = useRef(zoomEn);
  zoomRef.current = zoomEn;

  useEffect(() => {
    const el = contenedor.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const caja = el.getBoundingClientRect();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      zoomRef.current(e.clientX - caja.left, e.clientY - caja.top, Math.exp(-dy * 0.0012));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const botonZoom = (factor: number) => {
    const caja = contenedor.current?.getBoundingClientRect();
    zoomEn((caja?.width ?? 0) / 2, (caja?.height ?? 0) / 2, factor);
  };
  const reiniciar = () => setVista({ zoom: 1, x: 0, y: 0 });

  return (
    <div className="glass relative overflow-hidden rounded-3xl p-3 lg:p-4">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Plano interactivo · scroll para zoom · arrastra para mover
        </p>
        <div className="flex gap-1 font-mono text-xs">
          <button onClick={() => botonZoom(1.4)} className="glass-soft h-8 rounded-lg px-3 hover:text-primary">+</button>
          <button onClick={() => botonZoom(1 / 1.4)} className="glass-soft h-8 rounded-lg px-3 hover:text-primary">−</button>
          <button onClick={reiniciar} className="glass-soft h-8 rounded-lg px-3 hover:text-primary">reset</button>
        </div>
      </div>

      <div
        ref={contenedor}
        className="relative aspect-[2075/1488] w-full cursor-grab overflow-hidden rounded-2xl bg-white/60"
        onMouseDown={(e) => {
          arrastre.current = { x: e.clientX, y: e.clientY, ox: vista.x, oy: vista.y, movido: false };
        }}
        onMouseMove={(e) => {
          const a = arrastre.current;
          if (!a) return;
          const dx = e.clientX - a.x;
          const dy = e.clientY - a.y;
          if (Math.hypot(dx, dy) > 3) a.movido = true;
          setVista((v) => ({ ...v, x: a.ox + dx, y: a.oy + dy }));
        }}
        onMouseUp={() => (arrastre.current = null)}
        onMouseLeave={() => (arrastre.current = null)}
      >
        <div
          style={{
            transform: `translate(${vista.x}px, ${vista.y}px) scale(${vista.zoom})`,
            transformOrigin: "0 0",
            width: "100%",
            height: "100%",
          }}
        >
          <svg viewBox={VIEWBOX_PLANO} className="h-full w-full">
            {/* Áreas verdes */}
            {AREAS_VERDES_PLANO.map((v) => (
              <g key={`v${v.numero}`}>
                <polygon points={v.puntos} fill="oklch(0.82 0.09 155 / 40%)" stroke="oklch(0.55 0.14 155 / 70%)" strokeWidth={1.5} />
                <text x={v.x} y={v.y} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={11} fill="oklch(0.38 0.1 155)">{v.etiqueta}</text>
              </g>
            ))}

            {/* Manzana labels (sin outline) */}
            {MANZANAS_PLANO.map((m) => (
              <text key={`m${m.manzana}`}
                x={m.x} y={m.y}
                textAnchor="middle" dominantBaseline="middle"
                fontFamily="var(--font-mono)" fontWeight={700} fontSize={38}
                fill="oklch(0.51 0.22 277 / 45%)"
                className={manzanaActiva && manzanaActiva !== m.manzana ? "opacity-30" : ""}
                onClick={() => onManzana(m.manzana)}
                style={{ cursor: "pointer" }}
              >{m.manzana}</text>
            ))}

            {/* Lotes */}
            {LOTES_PLANO.map((p) => {
              const l = porNumero.get(p.numero);
              if (!l) return null;
              const dim = manzanaActiva && manzanaActiva !== l.manzana;
              const isSel = l.loteId === seleccion;
              return (
                <g key={p.numero} className={dim ? "opacity-25" : ""}>
                  <polygon
                    points={p.puntos}
                    fill={COLOR[l.estado]}
                    fillOpacity={isSel ? 0.9 : 0.55}
                    stroke={isSel ? "oklch(0.24 0.055 277)" : "oklch(0.24 0.055 277 / 40%)"}
                    strokeWidth={isSel ? 2 : 0.6}
                    onClick={() => {
                      if (arrastre.current?.movido) return;
                      onSeleccionar(l.loteId);
                    }}
                    onMouseEnter={(e) => {
                      const rect = contenedor.current!.getBoundingClientRect();
                      setHover({ lote: l, x: e.clientX - rect.left, y: e.clientY - rect.top });
                    }}
                    onMouseMove={(e) => {
                      const rect = contenedor.current!.getBoundingClientRect();
                      setHover((h) => h && { ...h, x: e.clientX - rect.left, y: e.clientY - rect.top });
                    }}
                    onMouseLeave={() => setHover(null)}
                    style={{ cursor: "pointer" }}
                  />
                </g>
              );
            })}
          </svg>
        </div>

        {hover && (
          <div
            className="glass pointer-events-none absolute z-20 max-w-[260px] rounded-2xl p-3 text-xs shadow-xl"
            style={{ left: hover.x + 14, top: hover.y + 14 }}
          >
            <p className="font-mono text-[10px] uppercase text-muted-foreground">Lote {hover.lote.loteId}</p>
            <p className="mt-1 text-sm font-semibold">{hover.lote.frente}×{hover.lote.fondo} m — {hover.lote.calle || "sin calle"}</p>
            <p className="mt-1"><span className="font-mono text-[10px] uppercase text-muted-foreground">Estado:</span> {hover.lote.estado}</p>
            {hover.lote.precioLista > 0 && (
              <p><span className="font-mono text-[10px] uppercase text-muted-foreground">Precio lista:</span> {pesos(hover.lote.precioLista)}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
