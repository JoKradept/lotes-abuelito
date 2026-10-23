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

  // 1. Verificación de Lotes limpios
  assert.equal(lotes.length, 377, "Deben cargarse los 377 lotes");
  const lote1 = lotes.find((l) => l.loteId === "A-001");
  assert.ok(lote1, "Lote A-001 debe existir");
  assert.equal(lote1!.manzana, "A");
  assert.equal(lote1!.numero, 1);
  assert.equal(lote1!.estado, "Disponible");

  const todosDisponibles = lotes.every((l) => l.estado === "Disponible");
  assert.equal(todosDisponibles, true, "Todos los 377 lotes deben iniciar en Disponible");

  // 2. Base de datos limpia sin ventas ni abonos duplicados
  assert.equal(ventas.length, 0, "No debe haber ventas previas");
  assert.equal(abonos.length, 0, "No debe haber abonos previos");
  assert.equal(clientes.length, 0, "No debe haber clientes previos");
});
