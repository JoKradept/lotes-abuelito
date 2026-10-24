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
  const loteA001 = lotes.find((l) => l.loteId === "A-001");
  assert.equal(loteA001?.estado, "Liquidado", "A-001 debe estar Liquidado");
  const loteA002 = lotes.find((l) => l.loteId === "A-002");
  assert.equal(loteA002?.estado, "Vendido", "A-002 debe estar Vendido");
  const loteC106 = lotes.find((l) => l.loteId === "C-106");
  assert.equal(loteC106?.estado, "Apartado", "C-106 debe estar Apartado");

  // 2. Clientes dummy
  assert.equal(clientes.length, 4, "Deben existir 4 clientes dummy");

  // 3. Ventas y Abonos
  assert.equal(ventas.length, 3, "Deben existir 3 ventas");
  assert.equal(abonos.length, 7, "Deben existir 7 abonos registrados");
});
