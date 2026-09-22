import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { clearCache, dropFailed, failed, flush, get, pending, retryFailed } from "./api";
import { ErrorBoundary, Say, Wait, useGet } from "./ui";
import * as P from "./pages";

const ICONS = {
  home: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  edit: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  users: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  "bar-chart": <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  file: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
  user: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  settings: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  requests: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
};

const NAV = [["/", "Tableau de bord", "home"], ["/preparation", "Préparation", "edit"], ["/classes", "Mes classes", "users"],
  ["/evaluations", "Évaluations", "bar-chart"], ["/fiches", "Mes fiches", "file"], ["/eleves", "Mes élèves", "user"], ["/parametres", "Paramètres", "settings"]];

async function prefetch() { // précharge de quoi travailler hors connexion (chemins identiques à ceux des écrans)
  try {
    const [cl, ev, fi] = await Promise.all([get("/classes/"), get("/evaluations/"), get("/fiches/")]);
    await Promise.all([get("/eleves/"), get("/parametres/"), get("/me/"),
      ...cl.flatMap((c) => [get(`/classes/${c.id}/`), get(`/eleves/?classe=${c.id}`), get(`/evaluations/?classe=${c.id}`)]),
      ...ev.flatMap((e) => [get(`/evaluations/${e.id}/`), get(`/evaluations/${e.id}/notes/`)]), ...fi.map((f) => get(`/fiches/${f.id}/`))]);
  } catch { /* hors connexion : on garde le cache existant */ }
}

export default function App() {
  const [auth, setAuth] = useState(!!localStorage.getItem("token")), [expired, setExpired] = useState(false);
  const [me] = useGet(auth ? "/me/" : null), estAdmin = !!me?.est_admin; // menu « Demandes » réservé aux administrateurs
  const [online, setOnline] = useState(navigator.onLine), [sync, setSync] = useState(false), [done, setDone] = useState(false), [toast, setToast] = useState(null);
  const [q, setQ] = useState({ p: pending(), f: failed().length });
  const say = (m) => { setToast(m); setTimeout(() => setToast(null), 3500); };
  const run = async () => {
    if (!navigator.onLine || !pending()) return;
    setSync(true); const r = await flush(); setSync(false);
    if (r.failed) say("⚠️ Synchronisation impossible pour certaines modifications");
    else if (r.done && !r.remaining) { setDone(true); say("🟢 Synchronisation terminée"); setTimeout(() => setDone(false), 5000); }
  };
  useEffect(() => {
    const upd = () => setQ({ p: pending(), f: failed().length });
    const on = () => { setOnline(true); run(); }, off = () => { setOnline(false); say("⚠️ Connexion interrompue. Vous pouvez continuer hors connexion."); };
    const exp = () => { setAuth(false); setExpired(true); };
    addEventListener("online", on); addEventListener("offline", off); addEventListener("queue-changed", upd); addEventListener("session-expired", exp);
    if (auth) { run(); prefetch(); }
    const t = setInterval(run, 30000);
    return () => { removeEventListener("online", on); removeEventListener("offline", off); removeEventListener("queue-changed", upd); removeEventListener("session-expired", exp); clearInterval(t); };
  }, [auth]);
  const logout = () => {
    if (pending() && !window.confirm("Des modifications ne sont pas encore synchronisées. Elles seront conservées sur cet appareil et envoyées à votre prochaine connexion. Se déconnecter ?")) return;
    clearCache(); localStorage.removeItem("token"); setAuth(false);
  };
  if (!auth) return <P.Login onDone={() => { setExpired(false); setAuth(true); }} message={expired ? "Votre session a expiré. Reconnectez-vous : vos données locales sont conservées." : ""} />;
  return (
    <Say.Provider value={say}>
      <div className="shell">
        <nav className="side" aria-label="Navigation principale">
          <div className="brand">Assistant Enseignant</div>
          {NAV.map(([to, label, icon]) => <NavLink key={to} to={to} end={to === "/"}>{ICONS[icon]} <span>{label}</span></NavLink>)}
          {estAdmin && <NavLink to="/demandes">{ICONS.requests} <span>Demandes</span></NavLink>}
        </nav>
        <main>
          <div className={"conn " + (online ? "ok" : "off")} role="status">
            {sync ? "🔄 Synchronisation en cours"
              : !online ? `🟠 Hors connexion${q.p ? ` — ${q.p} modification(s) enregistrée(s) sur cet appareil, en attente de synchronisation.` : " — vous pouvez continuer ; les données seront synchronisées au retour de la connexion."}`
              : q.p ? `🔄 En attente de synchronisation (${q.p})` : done ? "🟢 Synchronisation terminée" : "🟢 En ligne"}
          </div>
          {q.f > 0 && <div className="conn off" role="alert">⚠️ Synchronisation impossible ({q.f} modification(s) refusée(s) par le serveur, conservées sur cet appareil).{" "}
            <button className="btn sec sm" onClick={async () => { await retryFailed(); }}>Réessayer</button>
            <button className="btn danger sm" onClick={() => window.confirm("Abandonner ces modifications locales ? Cette action est définitive.") && dropFailed()}>Abandonner</button></div>}
          <ErrorBoundary><Routes>
            <Route path="/" element={<P.Dashboard />} />
            <Route path="/preparation" element={<P.Preparation />} />
            <Route path="/fiches" element={<P.Fiches />} />
            <Route path="/fiches/:id" element={<P.Fiche />} />
            <Route path="/classes" element={<P.Classes />} />
            <Route path="/classes/:id" element={<P.Classe />} />
            <Route path="/classes/:id/evaluations/nouvelle" element={<P.NouvelleEval />} />
            <Route path="/classes/:id/appreciations" element={<P.Appreciations />} />
            <Route path="/classes/:id/verification" element={<P.Verification />} />
            <Route path="/classes/:id/bulletin" element={<P.Bulletin />} />
            <Route path="/evaluations" element={<P.Evaluations />} />
            <Route path="/evaluations/:id/notes" element={<P.Notes />} />
            <Route path="/evaluations/:id/resultats" element={<P.Resultats />} />
            <Route path="/eleves" element={<P.Eleves />} />
            <Route path="/eleves/:id" element={<P.Eleve />} />
            <Route path="/parametres" element={<P.Parametres onLogout={logout} />} />
            <Route path="/demandes" element={me === null ? <Wait /> : estAdmin ? <P.GestionDemandes /> : <P.AccesReserve />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes></ErrorBoundary>
        </main>
        {toast && <div className="toast" role="alert">{toast}</div>}
      </div>
    </Say.Provider>
  );
}
