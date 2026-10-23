// node --test test/motor.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isMotorAvailable,
  loadLotesFromMotor,
  loadClientesFromMotor,
  loadVentasFromMotor,
  loadAbonosFromMotor,
} from "../src/lib/motor.ts";

test("integración lotes-abuelito ⇄ Motor API", async () => {
  const available = await isMotorAvailable();
  assert.equal(available, true, "Motor debe estar corriendo en http://localhost:3031/v1");

  const [lotes, clientes, ventas, abonos] = await Promise.all([
    loadLotesFromMotor(),
    loadClientesFromMotor(),
    loadVentasFromMotor(),
    loadAbonosFromMotor(),
  ]);

  // 1. Verificación de Lotes
  assert.equal(lotes.length, 377, "Deben cargarse los 377 lotes");
  const lote1 = lotes.find((l) => l.loteId === "A-001");
  assert.ok(lote1, "Lote A-001 debe existir");
  assert.equal(lote1!.manzana, "A");
  assert.equal(lote1!.numero, 1);
  assert.equal(lote1!.estado, "Disponible");

  // 2. Verificación de Clientes
  assert.ok(clientes.length >= 4, "Deben existir al menos los 4 clientes importados");
  const ana = clientes.find((c) => c.nombre.toLowerCase().includes("ejemplo") || c.nombre.toLowerCase().includes("don"));
  assert.ok(ana, "Debe existir al menos un cliente de prueba");

  // 3. Verificación de Ventas
  assert.ok(ventas.length >= 8, "Deben existir las órdenes de venta de lotes");
  const vF207 = ventas.find((v) => v.loteId === "F-207");
  assert.ok(vF207, "La venta del lote F-207 debe existir");

  // 4. Verificación de Abonos
  assert.ok(abonos.length >= 15, "Deben existir los abonos registrados");
  const abonosF207 = abonos.filter((a) => a.ventaId === vF207!.ventaId);
  assert.ok(abonosF207.length > 0, "F-207 debe tener abonos asociados");
});
