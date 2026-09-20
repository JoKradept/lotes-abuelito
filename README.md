# lotes-abuelito

Sistema web para venta de lotes a plazos del fraccionamiento **Cumbres de Tiripetío**.

Astro + React (islands) + Google Sheets como base de datos. Sin auth por ahora (fase 2), sin PDFs (fase 2), sin PWA (fase 2).

## Stack

- **Astro** con `output: "server"` + adapter Node (dev/local) — cambio a Vercel para prod
- **React** solo para islands interactivas (mapa del plano, forms complejos)
- **Tailwind v4**
- **Google Sheets** via `googleapis` (Service Account)
- **Astro Actions** para mutaciones

## Estructura

```
src/
├── pages/
│   ├── index.astro          # Plano completo (grid por manzana)
│   ├── lotes/
│   │   ├── index.astro      # Tabla de lotes con filtros
│   │   └── [id].astro       # Detalle: venta, cliente, abonos, saldo
│   ├── ventas/
│   │   ├── index.astro
│   │   └── nueva.astro
│   ├── clientes/
│   │   ├── index.astro
│   │   └── nuevo.astro
│   └── abonos/
│       └── nuevo.astro
├── actions/index.ts         # crearCliente, crearVenta, crearAbono, cancelarAbono
├── lib/
│   ├── sheets.ts            # googleapis client, cache 30s
│   └── domain.ts            # tipos + loaders + saldoVenta()
├── layouts/Base.astro
└── styles/globals.css
```

## Setup local

```
bun install
cp .env.example .env         # editar SHEET_ID y GOOGLE_APPLICATION_CREDENTIALS
bun run dev                  # http://localhost:4321
```

El SA debe tener rol **Editor** en el Google Sheet (`SHEET_ID` en `.env`).

## Datos

Google Sheet `1MgWhaK2NB3fZoh60s1nVcw1VDAyNI5OkQ45jWxIi5ns` con 4 pestañas:

| Pestaña | Columnas |
|---|---|
| Lotes | numero, manzana, frente, fondo, calle, esquina, precioLista, estado, plano, notas |
| Clientes | clienteId, nombre, telefono, direccion, notas |
| Ventas | ventaId, loteId, clienteId, fecha, precioFinal, enganche, notas |
| Abonos | abonoId, ventaId, fecha, monto, metodo, nota, cancelado, registradoEn |

- 375 lotes pre-seedeados (script en repo hermano `~/Dev/Personal/sistema-lotes-abuelito/mapa/seed_sheet.py`).
- `loteId` es derivado: `${manzana}-${numero pad 3}`, ej. `A-002`.

## Notas de diseño

- **Cache 30s** en `sheets.ts`: reduce llamadas a la API. Se limpia en cada mutación.
- **IDs** se generan por row count (`V-` + `RIGHT("000" + n, 3)`). Race si dos crean simultáneo — aceptable para escala del proyecto.
- **Abonos cancelados** no se borran, solo se marcan `cancelado=TRUE`. Los cálculos de saldo los excluyen.

## Roadmap

Ver vault `~/Documents/Obsidian/Obsidian/Notas/PROYECTOS/Personal/Lotes-Abuelito/`.
