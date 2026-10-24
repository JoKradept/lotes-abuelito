import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularCotizacion, DEFAULT_CONFIG, loadConfiguracion } from "../src/lib/config.ts";

test("configuración general y cálculo de cotizaciones", async () => {
  // 1. Carga de configuración desde Motor
  const config = await loadConfiguracion();
  assert.equal(config.comisionPctDefault, 20, "Comisión debe ser 20% por defecto");
  assert.equal(config.engancheDefault, 5000, "Enganche debe ser $5,000 por defecto");
  assert.equal(config.mesesGraciaContado, 3, "Hasta 3 meses es de contado sin interés");
  assert.equal(config.tasaInteresMensual, 1.5, "Tasa de interés de 1.5% mensual a partir del mes 3");

  const PRECIO = 216000;
  const ENGANCHE = 5000;

  // 2. Venta a 1 mes (Contado, sin interés)
  const c1 = calcularCotizacion(PRECIO, ENGANCHE, 1, config);
  assert.equal(c1.esCredito, false);
  assert.equal(c1.modalidad, "Contado");
  assert.equal(c1.interesMonto, 0);
  assert.equal(c1.precioTotal, PRECIO);
  assert.equal(c1.saldoFinanciar, 211000);
  assert.equal(c1.cuotaMensual, 211000);
  assert.equal(c1.comisionMonto, PRECIO * 0.2);

  // 3. Venta a 3 meses (Contado, sin interés)
  const c3 = calcularCotizacion(PRECIO, ENGANCHE, 3, config);
  assert.equal(c3.esCredito, false);
  assert.equal(c3.modalidad, "Contado");
  assert.equal(c3.interesMonto, 0);
  assert.equal(c3.precioTotal, PRECIO);
  assert.equal(c3.saldoFinanciar, 211000);
  assert.equal(c3.cuotaMensual, Math.round(211000 / 3));

  // 4. Venta a 12 meses (Crédito, 9 meses con interés al 1.5% mensual = 13.5%)
  const c12 = calcularCotizacion(PRECIO, ENGANCHE, 12, config);
  assert.equal(c12.esCredito, true);
  assert.equal(c12.modalidad, "Crédito");
  assert.equal(c12.interesPct, 13.5);
  // Saldo base = 211000 * 13.5% = 28485
  assert.equal(c12.interesMonto, Math.round(211000 * 0.135));
  assert.equal(c12.precioTotal, PRECIO + c12.interesMonto);
  assert.equal(c12.saldoFinanciar, 211000 + c12.interesMonto);
  assert.equal(c12.cuotaMensual, Math.round(c12.saldoFinanciar / 12));
  assert.equal(c12.comisionMonto, Math.round(c12.precioTotal * 0.2));
});
