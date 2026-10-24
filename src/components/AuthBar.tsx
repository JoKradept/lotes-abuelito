import { useEffect, useState } from "react";
import { checkSession, clearSession, getSavedSession, login, onAuthChange, type UserSession } from "../lib/auth";

const ROL_BADGES: Record<string, { label: string; bg: string; text: string }> = {
  dueno: { label: "Dueño", bg: "bg-amber-100 ring-amber-600/30", text: "text-amber-800" },
  administradora: { label: "Administradora", bg: "bg-purple-100 ring-purple-600/30", text: "text-purple-800" },
  secretaria: { label: "Secretaria", bg: "bg-blue-100 ring-blue-600/30", text: "text-blue-800" },
  contadora: { label: "Contadora", bg: "bg-emerald-100 ring-emerald-600/30", text: "text-emerald-800" },
  admin: { label: "Admin", bg: "bg-slate-100 ring-slate-600/30", text: "text-slate-800" },
};

export function AuthBar() {
  const [session, setSession] = useState<UserSession | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    // Cargar sesión guardada inicialmente
    setSession(getSavedSession());
    // Verificar validez contra el servidor
    checkSession().then((s) => setSession(s));

    // Suscribirse a cambios
    const unsubscribe = onAuthChange((s) => setSession(s));
    return () => unsubscribe();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setCargando(true);
    try {
      const s = await login(usuario, password);
      setSession(s);
      setModalAbierto(false);
      setUsuario("");
      setPassword("");
    } catch (err: any) {
      setErrorMsg(err.message || "Error al iniciar sesión");
    } finally {
      setCargando(false);
    }
  };

  const handleLogout = () => {
    clearSession();
    setSession(null);
  };

  const esDuenoOAdmin = session?.roles?.some((r) => ["dueno", "admin", "*"].includes(r));
  const rolPrincipal = session?.roles?.find((r) => ROL_BADGES[r]) || session?.roles?.[0] || "usuario";
  const badgeInfo = ROL_BADGES[rolPrincipal] || {
    label: rolPrincipal,
    bg: "bg-neutral-100 ring-neutral-300",
    text: "text-neutral-700",
  };

  return (
    <div className="flex items-center gap-2">
      {session ? (
        <div className="flex items-center gap-2.5">
          {esDuenoOAdmin && (
            <a
              href="/usuarios"
              className="hidden sm:inline-flex items-center gap-1.5 h-9 rounded-xl px-3 font-mono text-xs font-semibold bg-amber-500/10 text-amber-900 border border-amber-300/60 hover:bg-amber-500/20 transition"
              title="Panel de Gestión de Usuarios y Permisos"
            >
              <span className="size-2 rounded-full bg-amber-500 animate-pulse"></span>
              Usuarios
            </a>
          )}

          <div className="flex items-center gap-2 glass-soft px-3 py-1.5 rounded-2xl border border-border/80">
            <div className="size-6 rounded-full bg-primary/20 text-primary font-mono font-bold text-xs grid place-items-center uppercase">
              {session.usuario.charAt(0)}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold">{session.usuario}</span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full font-mono text-[10px] font-semibold ring-1 ring-inset ${badgeInfo.bg} ${badgeInfo.text}`}
              >
                {badgeInfo.label}
              </span>
            </div>
          </div>

          <button
            onClick={handleLogout}
            title="Cerrar sesión"
            className="h-9 px-2.5 text-xs font-mono text-muted-foreground hover:text-foreground rounded-xl glass-soft transition"
          >
            Salir
          </button>
        </div>
      ) : (
        <>
          <button
            onClick={() => setModalAbierto(true)}
            className="inline-flex items-center gap-1.5 h-9 rounded-xl px-3.5 font-mono text-xs font-semibold bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:opacity-90 transition"
          >
            <span>🔐</span> Iniciar sesión
          </button>

          {modalAbierto && (
            <div
              className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4"
              onClick={(e) => {
                if (e.target === e.currentTarget) setModalAbierto(false);
              }}
            >
              <div className="glass rounded-3xl p-6 max-w-sm w-full border border-border/80 shadow-2xl relative space-y-4">
                <button
                  type="button"
                  onClick={() => setModalAbierto(false)}
                  className="absolute right-4 top-4 grid size-8 place-items-center rounded-full hover:bg-neutral-200/50 text-muted-foreground transition"
                >
                  ✕
                </button>

                <div>
                  <h3 className="text-xl font-extrabold tracking-tight">Acceso al Sistema</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Cumbres de Tiripetío · Control de Usuarios
                  </p>
                </div>

                {errorMsg && (
                  <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-red-800 text-xs font-medium">
                    ⚠️ {errorMsg}
                  </div>
                )}

                <form onSubmit={handleLogin} className="space-y-3">
                  <div>
                    <label className="block text-xs font-mono font-medium text-muted-foreground mb-1">
                      Usuario
                    </label>
                    <input
                      type="text"
                      required
                      autoFocus
                      value={usuario}
                      onChange={(e) => setUsuario(e.target.value)}
                      placeholder="ej. donalfonso, mary, secre..."
                      className="w-full h-10 rounded-xl border border-border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono font-medium text-muted-foreground mb-1">
                      Contraseña
                    </label>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full h-10 rounded-xl border border-border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={cargando}
                    className="w-full h-10 rounded-xl bg-primary text-primary-foreground font-semibold text-sm shadow-md shadow-primary/30 hover:opacity-90 transition disabled:opacity-50 mt-2"
                  >
                    {cargando ? "Entrando..." : "Entrar"}
                  </button>
                </form>

                <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-2.5 text-[11px] text-muted-foreground space-y-1">
                  <p>
                    <span className="font-semibold text-foreground">Cuenta de Dueño:</span> Creada por terminal o Studio para Don Alfonso.
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">Otras cuentas:</span> Administradas por el Dueño desde el panel de usuarios.
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
