import { useEffect, useState } from "react";
import { checkSession, getSavedSession, login, onAuthChange, type UserSession } from "../lib/auth";

const CUENTAS_RAPIDAS = [
  { usuario: "donalfonso", pass: "Cumbres2026!", label: "Dueño", rol: "dueno", icon: "👑", desc: "Control total y gestión de usuarios" },
  { usuario: "mary", pass: "Admin2026!", label: "Administradora", rol: "administradora", icon: "👩‍💼", desc: "Ventas, planes, apartados y contratos" },
  { usuario: "secretaria", pass: "Secretaria2026!", label: "Secretaria", rol: "secretaria", icon: "📋", desc: "Plano, abonos y atención en ventanilla" },
  { usuario: "contadora", pass: "Contadora2026!", label: "Contadora", rol: "contadora", icon: "📊", desc: "Corte de caja y cuentas por cobrar" },
];

export function LoginWall() {
  const [session, setSession] = useState<UserSession | null>(() => getSavedSession());
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [montado, setMontado] = useState(false);

  useEffect(() => {
    setMontado(true);
    const s = getSavedSession();
    setSession(s);

    if (s?.token) {
      checkSession().then((checked) => {
        setSession(checked);
      });
    }

    const unsub = onAuthChange((newSession) => {
      setSession(newSession);
    });
    return () => unsub();
  }, []);

  const handleLogin = async (e?: React.FormEvent, u = usuario, p = password) => {
    if (e) e.preventDefault();
    if (!u.trim() || !p) return;
    setErrorMsg("");
    setCargando(true);
    try {
      const nueva = await login(u, p);
      setSession(nueva);
      setUsuario("");
      setPassword("");
    } catch (err: any) {
      setErrorMsg(err.message || "Usuario o contraseña incorrectos");
    } finally {
      setCargando(false);
    }
  };

  const seleccionarCuenta = (u: string, p: string) => {
    setUsuario(u);
    setPassword(p);
    handleLogin(undefined, u, p);
  };

  // Si no está montado en cliente o ya hay sesión activa, no mostrar el muro
  if (!montado || session) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 lg:p-8 shadow-2xl ring-1 ring-black/5 space-y-6">
        <div className="text-center space-y-1.5">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground font-mono font-extrabold text-sm shadow-lg shadow-primary/30">
            LOT
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight text-foreground">
            Acceso al Sistema
          </h2>
          <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
            Cumbres de Tiripetío · Inicia sesión para continuar
          </p>
        </div>

        {errorMsg && (
          <div className="rounded-2xl bg-red-50 border border-red-200 p-3 text-red-800 text-xs font-medium flex items-center gap-2">
            <span>⚠️</span>
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-mono font-medium uppercase tracking-wide text-muted-foreground mb-1">
              Usuario
            </label>
            <input
              type="text"
              required
              autoFocus
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              placeholder="ej. donalfonso, mary, secretaria..."
              className="w-full h-11 rounded-2xl border border-border bg-neutral-50 px-3.5 text-sm outline-none focus:ring-2 focus:ring-primary/40 focus:bg-white transition"
            />
          </div>

          <div>
            <label className="block text-xs font-mono font-medium uppercase tracking-wide text-muted-foreground mb-1">
              Contraseña
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full h-11 rounded-2xl border border-border bg-neutral-50 px-3.5 text-sm outline-none focus:ring-2 focus:ring-primary/40 focus:bg-white transition"
            />
          </div>

          <button
            type="submit"
            disabled={cargando}
            className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-bold text-sm shadow-lg shadow-primary/30 hover:opacity-95 transition disabled:opacity-50"
          >
            {cargando ? "Iniciando sesión..." : "Entrar al Sistema"}
          </button>
        </form>

        <div className="space-y-2 pt-2 border-t border-border">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground text-center font-semibold">
            Cuentas configuradas (clic para entrar)
          </p>
          <div className="grid grid-cols-2 gap-2">
            {CUENTAS_RAPIDAS.map((c) => (
              <button
                key={c.usuario}
                type="button"
                onClick={() => seleccionarCuenta(c.usuario, c.pass)}
                disabled={cargando}
                className="flex items-center gap-2 p-2.5 rounded-xl border border-border hover:border-primary hover:bg-primary/5 text-left transition group disabled:opacity-50"
              >
                <span className="text-base">{c.icon}</span>
                <div className="truncate leading-tight">
                  <span className="block text-xs font-bold text-foreground group-hover:text-primary">
                    {c.label}
                  </span>
                  <span className="block font-mono text-[10px] text-muted-foreground truncate">
                    {c.usuario}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
