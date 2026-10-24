// node --env-file-if-exists=.env --test test/auth.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

const MOTOR_URL = "http://localhost:3031/v1";

test("flujo de autenticación, roles y gestión de usuarios", async () => {
  // 1. Intento de login fallido
  const resBad = await fetch(`${MOTOR_URL}/_login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ usuario: "donalfonso", password: "PasswordIncorrecto123" }),
  });
  assert.equal(resBad.status, 401, "Credenciales incorrectas deben dar 401");

  // 2. Login exitoso como Dueño
  const resLogin = await fetch(`${MOTOR_URL}/_login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ usuario: "donalfonso", password: "Cumbres2026!" }),
  });
  assert.equal(resLogin.status, 200, "Dueño debe poder autenticarse");
  const loginData = await resLogin.json();
  assert.ok(loginData.token, "Debe retornar token de sesión");

  const duenoToken = loginData.token;

  // 3. /_me debe regresar los roles de Don Alfonso
  const resMe = await fetch(`${MOTOR_URL}/_me`, {
    headers: { Authorization: `Bearer ${duenoToken}` },
  });
  assert.equal(resMe.status, 200);
  const meData = await resMe.json();
  assert.equal(meData.name, "donalfonso");
  assert.ok(meData.roles.includes("dueno"), "Debe tener rol dueno");

  // 4. Listar usuarios como Dueño
  const resUsers = await fetch(`${MOTOR_URL}/_meta/users`, {
    headers: { Authorization: `Bearer ${duenoToken}` },
  });
  assert.equal(resUsers.status, 200, "Dueño tiene acceso a _meta/users");
  const usersList = await resUsers.json();
  assert.ok(Array.isArray(usersList), "Debe ser arreglo de usuarios");
  assert.ok(usersList.some((u: any) => u.usuario === "donalfonso"));

  // 5. Crear usuario (Secretaria de prueba)
  const tempUser = `secre_${Date.now()}`;
  const resCreate = await fetch(`${MOTOR_URL}/_meta/users`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${duenoToken}`,
    },
    body: JSON.stringify({
      usuario: tempUser,
      password: "PasswordSeguro123!",
      roles: ["secretaria"],
      activo: true,
    }),
  });
  assert.equal(resCreate.status, 200, "Debe crear el nuevo usuario");

  // 6. Login como la nueva secretaria
  const resLoginSecre = await fetch(`${MOTOR_URL}/_login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ usuario: tempUser, password: "PasswordSeguro123!" }),
  });
  assert.equal(resLoginSecre.status, 200, "Secretaria creada debe poder loguearse");
  const secreToken = (await resLoginSecre.json()).token;

  // 7. Secretaria NO puede acceder a gestión de usuarios (403)
  const resSecreForbidden = await fetch(`${MOTOR_URL}/_meta/users`, {
    headers: { Authorization: `Bearer ${secreToken}` },
  });
  assert.equal(resSecreForbidden.status, 403, "Secretaria no debe tener acceso a _meta/users");

  // 8. Desactivar a la secretaria
  const resDeactivate = await fetch(`${MOTOR_URL}/_meta/users`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${duenoToken}`,
    },
    body: JSON.stringify({
      usuario: tempUser,
      roles: ["secretaria"],
      activo: false,
    }),
  });
  assert.equal(resDeactivate.status, 200);

  // 9. Secretaria desactivada no puede iniciar sesión
  const resLoginInactive = await fetch(`${MOTOR_URL}/_login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ usuario: tempUser, password: "PasswordSeguro123!" }),
  });
  assert.equal(resLoginInactive.status, 401, "Usuario inactivo no debe poder loguearse");

  // 10. Limpieza (revocar usuario de prueba)
  const resDelete = await fetch(`${MOTOR_URL}/_meta/users/${tempUser}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${duenoToken}` },
  });
  assert.equal(resDelete.status, 200, "Debe permitir revocar usuario de prueba");
});
