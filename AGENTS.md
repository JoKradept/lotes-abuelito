# AGENTS.md — lotes-abuelito

Instrucciones para cualquier IA que trabaje aquí.

## Contexto rápido

Sistema web para venta de lotes a plazos del fraccionamiento **Cumbres de Tiripetío** (Michoacán, 377 lotes, 12 manzanas A–L). Es proyecto personal de jk para su abuelo (Luis Alfonso Zuastegui Arreola).

**Usuarios finales**: abuelito, tía, secretaria. Ninguno técnico. UI en español, botones grandes, cero jerga.

**Contexto profundo**: `~/Documents/Obsidian/Obsidian/Notas/PROYECTOS/Personal/Lotes-Abuelito/Contexto.md`.

## Reglas duras

1. **Todo en camelCase** — headers del Sheet, tipos TS, props.
2. **Google Sheet es la SoT** — no invertir con DB local ni caché disco.
3. **Cache 30s en `lib/sheets.ts`** — se limpia en cada mutación.
4. **`loteId` es derivado**, nunca en el Sheet: `${manzana}-${numero pad 3}`.
5. **Abonos cancelados NO se borran** — flag `cancelado=TRUE`.
6. **Sin auth por ahora** — fase 2. No introducir NextAuth/etc hoy.
7. **Sin PDFs por ahora** — fase 2. No agregar jsPDF hoy.
8. **YAGNI**: revisa `Contexto.md > Decisiones YAGNI` antes de proponer schema o features. Otras IAs (Gemini, GPT) han sugerido `plazoMeses`, `interesMoratorio`, `reciboPdf` en columna manual — descartadas con razón.

## Dev

```
bun install
bun run dev --background     # arranca dev server en background
bunx astro dev logs          # ver logs
bunx astro dev stop          # parar
```

Server en http://localhost:4321.

## Env

`.env` local (no commiteado). En Vercel se configuran vía dashboard.

- `SHEET_ID` — id del Google Sheet
- `GOOGLE_APPLICATION_CREDENTIALS` — path al JSON del Service Account

Para prod se recomienda montar el JSON completo como `GOOGLE_CREDENTIALS_JSON` env var (base64 o JSON escapado) y decodificar en `sheets.ts` (aún no implementado).

## Patrones

- **Un file por página**. No hay componente compartido para "tabla" — cada página tiene su `<table>` inline, es más legible.
- **Loaders en `lib/domain.ts`**. Nunca importar `sheets.ts` directo desde páginas.
- **Mutaciones vía Astro Actions** (`src/actions/index.ts`). Nunca escribir al Sheet desde una page.
- **PlanoInteractivo** (pendiente) — irá como React island en `src/components/PlanoInteractivo.tsx`. Fuente del SVG: `~/Dev/Personal/sistema-lotes-abuelito/mapa/mapa_interactivo.svg`.

## Ponytail mode

Este repo se construyó en ponytail full. Antes de agregar:
- ¿Una dep npm? Verifica que astro/react/tailwind no lo cubran ya.
- ¿Un componente shadcn? Solo si hay 3+ usos reales.
- ¿Una abstracción "para el futuro"? No.

## Sheet schema (referencia rápida)

- **Lotes**: `numero | manzana | frente | fondo | calle | esquina | precioLista | estado | plano | notas`
- **Clientes**: `clienteId | nombre | telefono | direccion | notas`
- **Ventas**: `ventaId | loteId | clienteId | fecha | precioFinal | enganche | notas`
- **Abonos**: `abonoId | ventaId | fecha | monto | metodo | nota | cancelado | registradoEn`

## Historia previa (importante)

Este proyecto **NO** es concept-hug (repo Lovable). El concept-hug fue evaluado y descartado como base — se prefirió empezar limpio en Astro. Ver `Contexto.md > Decisiones` para la historia completa.

También hubo intento con **AppSheet** que se archivó — la app AppSheet configurada en `juliocortez451@gmail.com` puede ignorarse o borrarse.

## Astro-específico

Full docs: https://docs.astro.build

Guías relevantes:
- [Rutas dinámicas](https://docs.astro.build/en/guides/routing/) — este proyecto usa `output: "server"`, no `getStaticPaths`.
- [Actions](https://docs.astro.build/en/guides/actions/)
- [Framework components (React islands)](https://docs.astro.build/en/guides/framework-components/)
- [Styling con Tailwind](https://docs.astro.build/en/guides/styling/)
