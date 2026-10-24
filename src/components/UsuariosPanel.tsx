import { useEffect, useState } from "react";
import { getSavedSession, getToken, onAuthChange, login as authLogin, type UserSession } from "../lib/auth";

export type UserItem = {
  usuario: string;
  roles: string[];
  activo: boolean;
  tienePassword: boolean;
};

const ROLES_INFO: Record<string, { label: string; chip: string; desc: string }> = {
  dueno: {
    label: "Dueño",
    chip: "bg-amber-100 text-amber-800 ring-amber-600/20",
    desc: "Control total, tableros ejecutivos y administración de accesos.",
  },
  administradora: {
    label: "Administradora",
    chip: "bg-purple-100 text-purple-800 ring-purple-600/20",
    desc: "Ventas de lotes, planes de pago, apartados y finiquitos legales.",
  },
  secretaria: {
    label: "Secretaria",
    chip: "bg-blue-100 text-blue-800 ring-blue-600/20",
    desc: "Consulta de plano, atención en ventanilla, registro de abonos y recibos.",
  },
  contadora: {
    label: "Contadora",
    chip: "bg-emerald-100 text-emerald-800 ring-emerald-600/20",
    desc: "Corte de caja, cuentas por cobrar, cobranza vencida y reportes.",
  },
};

const MOTOR_URL = "http://localhost:3031/v1";

type Props = {
  usuariosIniciales?: UserItem[];
};

export function UsuariosPanel({ usuariosIniciales = [] }: Props) {
  const [usuarios, setUsuarios] = useState<UserItem[]>(usuariosIniciales);
  const [cargando, setCargando] = useState(false);
  const [session, setSession] = useState<UserSession | null>(getSavedSession());
  const [token, setToken] = useState<string>(getToken());
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [exitoMsg, setExitoMsg] = useState<string>("");

  // Formulario login Dueño
  const [loginUser, setLoginUser] = useState("donalfonso");
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginCargando, setLoginCargando] = useState(false);

  // Formulario nuevo usuario
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoPassword, setNuevoPassword] = useState("");
  const [nuevosRoles, setNuevosRoles] = useState<string[]>(["administradora"]);
  const [guardando, setGuardando] = useState(false);

  // Modal editar roles / password
  const [editandoUser, setEditandoUser] = useState<UserItem | null>(null);
  const [editRoles, setEditRoles] = useState<string[]>([]);
  const [cambiarPassword, setCambiarPassword] = useState("");

  const esDueno = Boolean(
    session?.roles?.some((r) => ["dueno", "admin", "*"].includes(r))
  );

  const cargar = async (authToken?: string) => {
    const t = authToken !== undefined ? authToken : getToken();
    setToken(t);
    if (!t) return;
    setCargando(true);
    setErrorMsg("");
    try {
      const res = await fetch(`${MOTOR_URL}/_meta/users`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setErrorMsg("Sesión expirada o permisos insuficientes.");
        }
        return;
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setUsuarios(data);
      }
    } catch {
      setErrorMsg("No se pudo conectar con el Motor (puerto 3031).");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    const s = getSavedSession();
    setSession(s);
    if (s?.token) {
      setToken(s.token);
      cargar(s.token);
    }
    const unsub = onAuthChange((newSession) => {
      setSession(newSession);
      setToken(newSession?.token || "");
      if (newSession?.token) cargar(newSession.token);
    });
    return () => unsub();
  }, []);

  const handleInlineLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginCargando(true);
    setLoginError("");
    try {
      const nuevaSession = await authLogin(loginUser, loginPass);
      setSession(nuevaSession);
      setToken(nuevaSession.token);
      setLoginPass("");
      cargar(nuevaSession.token);
    } catch (err: any) {
      setLoginError(err.message || "Credenciales incorrectas");
    } finally {
      setLoginCargando(false);
    }
  };

  const toggleRol = (rol: string, actual: string[], setActual: (r: string[]) => void) => {
    if (actual.includes(rol)) {
      setActual(actual.filter((r) => r !== rol));
    } else {
      setActual([...actual, rol]);
    }
  };

  const handleCrear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!esDueno) {
      alert("Inicia sesión como Dueño para registrar nuevos usuarios.");
      return;
    }
    if (!nuevoNombre.trim() || nuevoPassword.length < 8) {
      alert("El nombre es requerido y la contraseña debe tener al menos 8 caracteres.");
      return;
    }
    setGuardando(true);
    setErrorMsg("");
    setExitoMsg("");
    try {
      const res = await fetch(`${MOTOR_URL}/_meta/users`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          usuario: nuevoNombre.trim().toLowerCase(),
          password: nuevoPassword,
          roles: nuevosRoles,
          activo: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al crear usuario");
      setExitoMsg(`Usuario "${nuevoNombre}" creado exitosamente.`);
      setNuevoNombre("");
      setNuevoPassword("");
      setNuevosRoles(["administradora"]);
      cargar(token);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const handleToggleActivo = async (u: UserItem) => {
    if (!esDueno) {
      alert("Inicia sesión como Dueño para cambiar el estado de los usuarios.");
      return;
    }
    if (u.usuario === "donalfonso") {
      alert("No se puede desactivar la cuenta principal del Dueño.");
      return;
    }
    const nuevoEstado = !u.activo;
    try {
      const res = await fetch(`${MOTOR_URL}/_meta/users`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          usuario: u.usuario,
          roles: u.roles,
          activo: nuevoEstado,
        }),
      });
      if (!res.ok) throw new Error("Error al actualizar estado");
      cargar(token);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleGuardarEdicion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editandoUser || !esDueno) return;
    setGuardando(true);
    try {
      const body: any = {
        usuario: editandoUser.usuario,
        roles: editRoles,
        activo: editandoUser.activo,
      };
      if (cambiarPassword.trim().length >= 8) {
        body.password = cambiarPassword.trim();
      }
      const res = await fetch(`${MOTOR_URL}/_meta/users`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Error al actualizar usuario");
      setExitoMsg(`Usuario "${editandoUser.usuario}" actualizado.`);
      setEditandoUser(null);
      setCambiarPassword("");
      cargar(token);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminar = async (usuario: string) => {
    if (!esDueno) {
      alert("Inicia sesión como Dueño para revocar usuarios.");
      return;
    }
    if (usuario === "donalfonso") {
      alert("No puedes eliminar al Dueño.");
      return;
    }
    if (!confirm(`¿Estás seguro de revocar y eliminar al usuario "${usuario}"?`)) return;
    try {
      const res = await fetch(`${MOTOR_URL}/_meta/users/${encodeURIComponent(usuario)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Error al eliminar");
      cargar(token);
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-8">
      {/* Guía de Roles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.entries(ROLES_INFO).map(([key, info]) => (
          <div key={key} className="glass rounded-2xl p-4 border border-border/70 space-y-2">
            <div className="flex items-center justify-between">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ring-1 ring-inset ${info.chip}`}>
                {info.label}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground uppercase">{key}</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{info.desc}</p>
          </div>
        ))}
      </div>

      {/* Banner de Estado de Autenticación */}
      {!esDueno ? (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-amber-900 text-sm flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">👑</span>
            <span>
              <strong>Modo consulta:</strong> Para activar/desactivar accesos, crear usuarios o cambiar contraseñas, identifícate como Dueño.
            </span>
          </div>
          <span className="font-mono text-xs text-amber-700 bg-amber-100 px-2.5 py-1 rounded-xl">
            Acceso: donalfonso / Cumbres2026!
          </span>
        </div>
      ) : (
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-3.5 text-emerald-900 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>✓</span>
            <span>
              Sesión activa como <strong>{session?.usuario}</strong> (Control total de usuarios).
            </span>
          </div>
          <span className="font-mono text-xs bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full font-semibold">
            Modo administrador habilitado
          </span>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-2xl bg-red-50 border border-red-200 p-4 text-red-800 text-sm flex items-center justify-between">
          <span>⚠️ {errorMsg}</span>
          <button onClick={() => setErrorMsg("")} className="font-bold text-xs opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {exitoMsg && (
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-emerald-800 text-sm flex items-center justify-between">
          <span>✓ {exitoMsg}</span>
          <button onClick={() => setExitoMsg("")} className="font-bold text-xs opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Tabla de Usuarios */}
        <div className="lg:col-span-8 glass rounded-3xl overflow-hidden border border-border">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-white/40">
            <div>
              <h2 className="text-lg font-extrabold tracking-tight">Usuarios y Accesos ({usuarios.length})</h2>
              <p className="font-mono text-xs text-muted-foreground">Personal autorizado en Cumbres de Tiripetío</p>
            </div>
            {esDueno && (
              <button
                onClick={() => cargar()}
                disabled={cargando}
                className="text-xs font-mono px-3 py-1.5 rounded-xl border border-border hover:bg-neutral-100 transition"
              >
                {cargando ? "↻..." : "↻ Refrescar"}
              </button>
            )}
          </div>

          <div className="divide-y divide-border/60">
            {usuarios.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Sin usuarios registrados.</div>
            ) : (
              usuarios.map((u) => (
                <div key={u.usuario} className="p-5 flex flex-wrap items-center justify-between gap-4 hover:bg-white/30 transition">
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-2xl bg-primary/10 text-primary font-bold grid place-items-center uppercase font-mono">
                      {u.usuario.slice(0, 2)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-base">{u.usuario}</span>
                        {u.usuario === "donalfonso" && (
                          <span className="font-mono text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold">
                            Dueño
                          </span>
                        )}
                        {!u.activo && (
                          <span className="font-mono text-[10px] bg-neutral-200 text-neutral-600 px-2 py-0.5 rounded-full">
                            Inactivo
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {u.roles.length === 0 ? (
                          <span className="font-mono text-xs text-muted-foreground">Sin rol asignado</span>
                        ) : (
                          u.roles.map((r) => (
                            <span
                              key={r}
                              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold ring-1 ring-inset ${
                                ROLES_INFO[r]?.chip || "bg-neutral-100 text-neutral-700 ring-neutral-400/20"
                              }`}
                            >
                              {ROLES_INFO[r]?.label || r}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Switch Activo/Inactivo */}
                    <button
                      onClick={() => handleToggleActivo(u)}
                      disabled={u.usuario === "donalfonso" || !esDueno}
                      className={`h-9 px-3 rounded-xl font-mono text-xs font-semibold transition inline-flex items-center gap-1.5 border ${
                        u.activo
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                          : "bg-neutral-100 text-neutral-500 border-neutral-300 hover:bg-neutral-200"
                      } ${u.usuario === "donalfonso" || !esDueno ? "opacity-75 cursor-not-allowed" : ""}`}
                      title={!esDueno ? "Inicia sesión como Dueño para cambiar estado" : u.activo ? "Desactivar acceso" : "Activar acceso"}
                    >
                      <span className={`size-2 rounded-full ${u.activo ? "bg-emerald-500" : "bg-neutral-400"}`}></span>
                      {u.activo ? "Activo" : "Inactivo"}
                    </button>

                    {/* Editar */}
                    <button
                      onClick={() => {
                        if (!esDueno) {
                          alert("Inicia sesión como Dueño para modificar usuarios.");
                          return;
                        }
                        setEditandoUser(u);
                        setEditRoles([...u.roles]);
                        setCambiarPassword("");
                      }}
                      className="h-9 px-3 rounded-xl border border-border text-xs font-semibold hover:border-primary hover:text-primary transition"
                    >
                      Editar
                    </button>

                    {/* Eliminar */}
                    {u.usuario !== "donalfonso" && (
                      <button
                        onClick={() => handleEliminar(u.usuario)}
                        disabled={!esDueno}
                        className={`h-9 px-2.5 rounded-xl border border-border text-xs font-semibold text-red-600 hover:bg-red-50 hover:border-red-300 transition ${
                          !esDueno ? "opacity-50 cursor-not-allowed" : ""
                        }`}
                        title="Eliminar usuario"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Panel lateral: Login Dueño O Formulario Crear Usuario */}
        <div className="lg:col-span-4 space-y-4">
          {!esDueno ? (
            <div className="glass rounded-3xl p-6 border border-border space-y-4">
              <div className="flex items-center gap-2">
                <div className="size-8 rounded-xl bg-amber-100 text-amber-800 grid place-items-center font-bold text-sm">
                  👑
                </div>
                <div>
                  <h3 className="text-base font-extrabold tracking-tight">Acceso de Dueño</h3>
                  <p className="font-mono text-xs text-muted-foreground">Inicia sesión para gestionar cuentas</p>
                </div>
              </div>

              {loginError && (
                <div className="rounded-xl bg-red-50 border border-red-200 p-2.5 text-red-800 text-xs font-medium">
                  ⚠️ {loginError}
                </div>
              )}

              <form onSubmit={handleInlineLogin} className="space-y-3">
                <div>
                  <label className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground block mb-1">
                    Usuario
                  </label>
                  <input
                    type="text"
                    required
                    value={loginUser}
                    onChange={(e) => setLoginUser(e.target.value)}
                    placeholder="donalfonso"
                    className="w-full h-10 rounded-xl border border-border bg-white px-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>

                <div>
                  <label className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground block mb-1">
                    Contraseña
                  </label>
                  <input
                    type="password"
                    required
                    value={loginPass}
                    onChange={(e) => setLoginPass(e.target.value)}
                    placeholder="••••••••"
                    className="w-full h-10 rounded-xl border border-border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loginCargando}
                  className="w-full h-10 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-md hover:opacity-90 transition disabled:opacity-50"
                >
                  {loginCargando ? "Accediendo..." : "Entrar como Dueño"}
                </button>
              </form>

              <p className="text-[11px] text-muted-foreground font-mono text-center">
                Clave inicial configurada: <code>Cumbres2026!</code>
              </p>
            </div>
          ) : (
            <div className="glass rounded-3xl p-6 border border-border space-y-5">
              <div>
                <h3 className="text-base font-extrabold tracking-tight">Crear Nuevo Usuario</h3>
                <p className="font-mono text-xs text-muted-foreground mt-0.5">Asigna rol y contraseña de acceso</p>
              </div>

              <form onSubmit={handleCrear} className="space-y-4">
                <div>
                  <label className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                    Nombre de usuario
                  </label>
                  <input
                    type="text"
                    value={nuevoNombre}
                    onChange={(e) => setNuevoNombre(e.target.value)}
                    placeholder="ej. recepcion, ventas2"
                    required
                    className="mt-1 h-11 w-full rounded-2xl border border-border bg-white px-3 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                <div>
                  <label className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                    Contraseña (mínimo 8 caracteres)
                  </label>
                  <input
                    type="password"
                    value={nuevoPassword}
                    onChange={(e) => setNuevoPassword(e.target.value)}
                    placeholder="••••••••"
                    minLength={8}
                    required
                    className="mt-1 h-11 w-full rounded-2xl border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                <div>
                  <label className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground mb-2 block">
                    Roles que tendrá
                  </label>
                  <div className="space-y-2">
                    {Object.entries(ROLES_INFO).map(([key, info]) => (
                      <label
                        key={key}
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                          nuevosRoles.includes(key)
                            ? "bg-primary/5 border-primary/40 font-semibold"
                            : "border-border hover:bg-white/40"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={nuevosRoles.includes(key)}
                          onChange={() => toggleRol(key, nuevosRoles, setNuevosRoles)}
                          className="mt-0.5"
                        />
                        <div>
                          <span className="block font-bold">{info.label}</span>
                          <span className="text-[11px] text-muted-foreground font-normal">{info.desc}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={guardando}
                  className="h-11 w-full rounded-2xl bg-primary text-primary-foreground font-bold text-sm shadow-lg shadow-primary/30 hover:opacity-95 transition disabled:opacity-50"
                >
                  {guardando ? "Guardando..." : "Guardar Usuario"}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Modal Editar Roles / Password */}
      {editandoUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="glass max-w-md w-full rounded-3xl p-6 border border-border shadow-2xl space-y-5 bg-white">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <p className="font-mono text-xs text-muted-foreground uppercase">Modificar usuario</p>
                <h3 className="text-xl font-extrabold">{editandoUser.usuario}</h3>
              </div>
              <button
                onClick={() => setEditandoUser(null)}
                className="size-8 rounded-full border border-border grid place-items-center text-xs hover:bg-neutral-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGuardarEdicion} className="space-y-4">
              <div>
                <label className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground mb-2 block">
                  Roles asignados
                </label>
                <div className="space-y-2">
                  {Object.entries(ROLES_INFO).map(([key, info]) => (
                    <label
                      key={key}
                      className={`flex items-start gap-2.5 p-2 rounded-xl border text-xs cursor-pointer ${
                        editRoles.includes(key) ? "bg-primary/5 border-primary/40 font-semibold" : "border-border"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={editRoles.includes(key)}
                        onChange={() => toggleRol(key, editRoles, setEditRoles)}
                        className="mt-0.5"
                      />
                      <span>{info.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                  Cambiar contraseña (opcional)
                </label>
                <input
                  type="password"
                  value={cambiarPassword}
                  onChange={(e) => setCambiarPassword(e.target.value)}
                  placeholder="Dejar vacío para mantener la actual"
                  minLength={8}
                  className="mt-1 h-11 w-full rounded-2xl border border-border bg-neutral-100 px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditandoUser(null)}
                  className="h-11 rounded-2xl border border-border text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="h-11 rounded-2xl bg-primary text-primary-foreground font-bold text-sm shadow-md"
                >
                  {guardando ? "Guardando..." : "Guardar cambios"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
