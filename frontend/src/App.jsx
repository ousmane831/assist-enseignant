import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { clearCache, dropFailed, failed, flush, get, pending, retryFailed } from "./api";
import { ErrorBoundary, Say } from "./ui";
import * as P from "./pages";

const NAV = [["/", "🏠", "Tableau de bord"], ["/preparation", "📝", "Préparation"], ["/classes", "🏫", "Mes classes"],
  ["/evaluations", "📊", "Évaluations"], ["/fiches", "📚", "Mes fiches"], ["/eleves", "👨🏾‍🎓", "Mes élèves"], ["/parametres", "⚙️", "Paramètres"]];

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
          {NAV.map(([to, ic, l]) => <NavLink key={to} to={to} end={to === "/"}><span aria-hidden>{ic}</span> {l}</NavLink>)}
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
            <Route path="*" element={<Navigate to="/" />} />
          </Routes></ErrorBoundary>
        </main>
        {toast && <div className="toast" role="alert">{toast}</div>}
      </div>
    </Say.Provider>
  );
}
