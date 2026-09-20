import { useContext, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { call, draftSet, drafts, get, pending, send } from "./api";
import BulletinDocument, { exporterPdf } from "./BulletinDocument";
import { Empty, Say, Steps, Wait, confirmer, useGet } from "./ui";

const NIVEAUX = ["CI", "CP", "CE1", "CE2", "CM1", "CM2"];
const dt = (d) => new Date(d).toLocaleDateString("fr-FR");
const msg = (e) => e?.status === 0 ? "🟠 Cette action nécessite une connexion Internet." : e?.status === 404 ? "❌ Cette page n'existe plus ou n'est plus accessible." : e?.status === 400 || e?.status === 409 ? "⚠️ " + (e.detail || "Vérifiez les informations saisies.") : e?.status === 401 ? "Votre session a expiré." : "❌ Impossible d'enregistrer. Vos données locales sont conservées.";
const safe = async (say, fn, ok) => { try { const r = await fn(); if (r?.queued) say("🟠 Enregistré sur cet appareil : sera synchronisé dès que la connexion sera disponible."); else if (ok) say(ok); return r; } catch (e) { say(msg(e)); } };
const supprimer = async (say, path, reload) => { const r = await safe(say, () => send("DELETE", path)); if (r !== undefined && !r?.queued) reload(); }; // recharge seulement si le serveur a confirmé
const Pdf = () => (<span className="noprint"><button className="btn sec" onClick={exporterPdf}>Télécharger PDF</button><button className="btn sec" onClick={exporterPdf}>Imprimer</button></span>);

export function Login({ onDone, message }) {
  const [u, setU] = useState(""), [p, setP] = useState(""), [e, setE] = useState("");
  const go = async (ev) => { ev.preventDefault(); try { const r = await call("POST", "/login/", { username: u, password: p }); localStorage.setItem("token", r.token); localStorage.setItem("user", u); onDone(); } catch { setE("❌ Identifiant ou mot de passe incorrect."); } };
  return (<form onSubmit={go} className="card" style={{ maxWidth: 420, margin: "10vh auto" }}>
    <h1>Assistant Enseignant</h1>{message && <p className="warn" role="alert">{message}</p>}<p className="muted">Connectez-vous pour retrouver vos classes et vos fiches.</p>
    <label htmlFor="u">Identifiant</label><input id="u" value={u} onChange={(e) => setU(e.target.value)} autoComplete="username" />
    <label htmlFor="p">Mot de passe</label><input id="p" type="password" value={p} onChange={(e) => setP(e.target.value)} autoComplete="current-password" />
    {e && <p className="err">{e}</p>}<button className="btn" style={{ marginTop: 16, width: "100%" }}>Se connecter</button></form>);
}

export function Dashboard() {
  const [me] = useGet("/me/"), [cl] = useGet("/classes/"), [el] = useGet("/eleves/"), [fi] = useGet("/fiches/"), [ev] = useGet("/evaluations/");
  const niv = Object.fromEntries((cl || []).map((c) => [c.id, c.niveau]));
  const act = [...(fi || []).map((f) => ({ t: f.updated_at, l: `Fiche ${f.niveau} – ${f.matiere} – ${f.lecon}` })),
    ...(ev || []).map((e) => ({ t: e.created_at, l: `Évaluation ${niv[e.classe] || ""} – ${e.matiere}` }))].sort((a, b) => b.t.localeCompare(a.t)).slice(0, 5);
  return (<>
    <h1>Bonjour, M. / Mme {me?.nom} 👋🏾</h1><p>Que souhaitez-vous faire aujourd'hui ?</p>
    <div className="big">
      <div className="card"><h2>📝 Préparer une leçon</h2><p>Créez ou retrouvez rapidement une fiche pédagogique et les exercices associés.</p><Link className="btn" to="/preparation">Préparer une leçon</Link></div>
      <div className="card"><h2>📊 Gérer une évaluation</h2><p>Saisissez les notes, calculez les résultats et préparez vos bulletins.</p><Link className="btn" to="/evaluations">Nouvelle évaluation</Link></div>
    </div>
    <div className="grid" style={{ marginTop: 24 }}>
      {[["Classes", cl?.length], ["Élèves", el?.length], ["Fiches récentes", Math.min(fi?.length || 0, 5)], ["Évaluations récentes", Math.min(ev?.length || 0, 5)]].map(([l, n]) =>
        <div className="card" key={l}><strong style={{ fontSize: "1.8rem" }}>{n ?? "–"}</strong><div className="muted">{l}</div></div>)}
    </div>
    <h2>Activité récente</h2>{act.length ? <ul>{act.map((a, i) => <li key={i}>{a.l}</li>)}</ul> : <Empty>Rien pour le moment. Commencez par préparer une leçon.</Empty>}
  </>);
}

export function Preparation() {
  const nav = useNavigate(), say = useContext(Say), [cfg] = useGet("/parametres/");
  const [niv, setNiv] = useState(), [mat, setMat] = useState(), [q, setQ] = useState(""), [nv, setNv] = useState("");
  const [lecons, reload] = useGet(niv && mat ? `/lecons/?niveau=${niv}&matiere=${encodeURIComponent(mat)}` : null);
  const ouvrir = async (titre) => {
    const f = await safe(say, () => send("POST", "/fiches/", { niveau: niv, matiere: mat, lecon: titre, annee_scolaire: cfg.annee_scolaire || "", sections: cfg.canevas.map((t) => ({ titre: t, contenu: "" })) }));
    if (f?.id) nav("/fiches/" + f.id);
  };
  const ajouter = async () => { if (!nv.trim()) return; await safe(say, () => send("POST", "/lecons/", { niveau: niv, matiere: mat, titre: nv }), "✅ Enregistrement réussi"); setNv(""); reload(); };
  return (<>
    <h1>Préparer une leçon</h1><Steps items={["Niveau", "Matière", "Leçon", "Fiche", "Exercices", "Aperçu"]} current={!niv ? 0 : !mat ? 1 : 2} />
    <h2>Étape 1 : Choisissez le niveau</h2><div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(110px,1fr))" }}>
      {NIVEAUX.map((n) => <button key={n} className={"choice" + (n === niv ? " on" : "")} onClick={() => { setNiv(n); setMat(); }}>{n}</button>)}</div>
    {niv && <><h2>Étape 2 : Choisissez la matière</h2><div className="grid">{cfg?.matieres.map((m) => <button key={m} className={"choice" + (m === mat ? " on" : "")} onClick={() => setMat(m)}>{m}</button>)}</div></>}
    {mat && <><h2>Étape 3 : Choisissez la leçon</h2>
      <input placeholder="Rechercher une leçon" aria-label="Rechercher une leçon" value={q} onChange={(e) => setQ(e.target.value)} />
      <p className="muted">{niv} → {mat}</p>
      {(lecons || []).filter((l) => l.titre.toLowerCase().includes(q.toLowerCase())).map((l) => (
        <div className="card row" key={l.id} style={{ marginBottom: 8 }}><span>{l.domaine && l.domaine + " → "}{l.titre}</span><button className="btn" onClick={() => ouvrir(l.titre)}>Générer / Ouvrir la fiche</button></div>))}
      {!lecons?.length && <Empty>Le programme officiel n'est pas préchargé : il sera ajouté après validation. En attendant, saisissez votre leçon ci-dessous.</Empty>}
      <div className="row" style={{ marginTop: 12 }}><input placeholder="Titre de la leçon" aria-label="Titre de la leçon" value={nv} onChange={(e) => setNv(e.target.value)} /><button className="btn sec" onClick={ajouter}>Ajouter cette leçon</button>
        <button className="btn" disabled={!nv.trim()} onClick={() => ouvrir(nv)}>Générer / Ouvrir la fiche</button></div></>}
  </>);
}

export function Fiche() {
  const { id } = useParams(), say = useContext(Say), [sp] = useSearchParams();
  const [f, reload] = useGet(`/fiches/${id}/`), [s, setS] = useState(null), [prev, setPrev] = useState(sp.get("apercu") === "1"), [sel, setSel] = useState({ fiche: true, ex: true });
  useEffect(() => { if (f) setS(f.sections); }, [f]);
  if (!f || !s) return <Wait />;
  const upd = (i, k, v) => setS(s.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const mv = (i, d) => { const a = [...s], j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setS(a); };
  const save = async () => { const r = await safe(say, () => send("PATCH", `/fiches/${id}/`, { sections: s }), "✅ Enregistrement réussi"); if (r && !r.queued) reload(); };
  const restore = async () => { await safe(say, () => call("POST", `/fiches/${id}/restaurer/`), "✅ Version précédente restaurée"); reload(); };
  const ex = f.exercices, patchEx = async (e, p) => { const r = await safe(say, () => send("PATCH", `/exercices/${e.id}/`, p)); if (r && !r.queued) reload(); };
  const moveEx = async (i, d) => { const a = ex[i], b = ex[i + d]; if (!b) return; const r = await safe(say, () => Promise.all([send("PATCH", `/exercices/${a.id}/`, { ordre: i + d }), send("PATCH", `/exercices/${b.id}/`, { ordre: i })])); if (r && !r.some((x) => x?.queued)) reload(); };
  const steps = ["Préparation", "Niveau", "Matière", "Leçon", "Fiche", "Exercices", "Aperçu"];
  if (prev) return (<>
    <Steps items={steps} current={6} />
    <div className="apercu">{sel.fiche && <><h1>{f.lecon}</h1><p className="muted">{f.niveau} – {f.matiere}{f.domaine && ` – ${f.domaine}`} – {f.annee_scolaire}</p>
      {s.map((x, i) => <div key={i}><h2>{x.titre}</h2><p style={{ whiteSpace: "pre-wrap" }}>{x.contenu}</p></div>)}</>}
      {sel.ex && ex.filter((e) => e.imprimer).map((e, i) => <div key={e.id}><h2>Exercice {i + 1} : {e.titre}</h2><p style={{ whiteSpace: "pre-wrap" }}>{e.contenu}</p></div>)}</div>
    <div className="noprint"><button className="btn sec" onClick={() => setPrev(false)}>Modifier</button></div><Pdf />
  </>);
  return (<>
    <Steps items={steps} current={4} /><h1>{f.lecon}</h1><p className="muted">{f.niveau} – {f.matiere} – {f.annee_scolaire} <span className="pill">Canevas provisoire : à valider</span></p>
    {s.map((x, i) => (<div className="card" key={i} style={{ marginBottom: 12 }}>
      <input aria-label="Titre de la rubrique" value={x.titre} onChange={(e) => upd(i, "titre", e.target.value)} style={{ fontWeight: 700 }} />
      <textarea aria-label={x.titre} value={x.contenu} onChange={(e) => upd(i, "contenu", e.target.value)} style={{ marginTop: 8 }} />
      <button className="btn sec sm" onClick={() => mv(i, -1)}>↕️ Monter</button><button className="btn sec sm" onClick={() => mv(i, 1)}>↕️ Descendre</button>
      <button className="btn danger sm" onClick={() => confirmer() && setS(s.filter((_, j) => j !== i))}>🗑️ Supprimer</button></div>))}
    <button className="btn sec" onClick={() => setS([...s, { titre: "Nouvelle rubrique", contenu: "" }])}>➕ Ajouter une rubrique</button>
    <button className="btn" onClick={save}>💾 Enregistrer</button>
    <button className="btn sec" disabled={!f.version_precedente} onClick={restore}>Restaurer la version précédente</button>
    <h2>Exercices associés</h2>
    {!ex.length && <Empty>Aucun exercice pour le moment.</Empty>}
    {ex.map((e, i) => (<div className="card" key={e.id} style={{ marginBottom: 8 }}><strong>Exercice {i + 1}</strong>
      <input aria-label="Titre de l'exercice" defaultValue={e.titre} onBlur={(v) => v.target.value !== e.titre && patchEx(e, { titre: v.target.value })} />
      <textarea aria-label="Consigne" defaultValue={e.contenu} onBlur={(v) => v.target.value !== e.contenu && patchEx(e, { contenu: v.target.value })} />
      <label><input type="checkbox" style={{ width: "auto" }} checked={e.imprimer} onChange={(v) => patchEx(e, { imprimer: v.target.checked })} /> Imprimer cet exercice</label>
      <button className="btn sec sm" onClick={() => moveEx(i, -1)}>↕️ Monter</button><button className="btn sec sm" onClick={() => moveEx(i, 1)}>↕️ Descendre</button>
      <button className="btn danger sm" onClick={() => confirmer() && supprimer(say, `/exercices/${e.id}/`, reload)}>Supprimer</button></div>))}
    <button className="btn sec" onClick={async () => { await safe(say, () => send("POST", "/exercices/", { fiche: f.id, titre: "Nouvel exercice", ordre: ex.length })); reload(); }}>➕ Ajouter un exercice</button>
    <div style={{ margin: "16px 0" }}><label><input type="checkbox" style={{ width: "auto" }} checked={sel.fiche} onChange={(e) => setSel({ ...sel, fiche: e.target.checked })} /> Fiche pédagogique</label>
      <label><input type="checkbox" style={{ width: "auto" }} checked={sel.ex} onChange={(e) => setSel({ ...sel, ex: e.target.checked })} /> Exercices</label></div>
    <button className="btn" onClick={async () => { await save(); setPrev(true); }}>Générer le document</button>
  </>);
}

export function Fiches() {
  const say = useContext(Say), nav = useNavigate(), [niv, setNiv] = useState(""), [mat, setMat] = useState(""), [an, setAn] = useState(""), [q, setQ] = useState("");
  const qs = new URLSearchParams(Object.entries({ niveau: niv, matiere: mat, annee_scolaire: an, lecon__icontains: q }).filter(([, v]) => v)).toString();
  const [cfg] = useGet("/parametres/"), [fs, reload] = useGet("/fiches/" + (qs ? "?" + qs : ""));
  const dup = async (f) => { const a = prompt("Année scolaire de la copie (ex. 2026/2027) :", ""); if (a === null) return; const n = await safe(say, () => call("POST", `/fiches/${f.id}/dupliquer/`, { annee_scolaire: a }), "✅ Fiche dupliquée"); if (n) reload(); };
  return (<><h1>Mes fiches</h1>
    <div className="row"><input placeholder="Rechercher une fiche" aria-label="Rechercher" value={q} onChange={(e) => setQ(e.target.value)} />
      <select aria-label="Niveau" value={niv} onChange={(e) => setNiv(e.target.value)}><option value="">Tous les niveaux</option>{NIVEAUX.map((n) => <option key={n}>{n}</option>)}</select>
      <select aria-label="Matière" value={mat} onChange={(e) => setMat(e.target.value)}><option value="">Toutes les matières</option>{cfg?.matieres.map((m) => <option key={m}>{m}</option>)}</select>
      <input placeholder="Année scolaire" aria-label="Année scolaire" value={an} onChange={(e) => setAn(e.target.value)} /></div>
    {!fs?.length ? <Empty>Aucune fiche. <Link to="/preparation">Préparer une leçon</Link></Empty> :
      <table><thead><tr><th>Niveau</th><th>Matière</th><th>Leçon</th><th>Date</th><th>Dernière modification</th><th>Actions</th></tr></thead><tbody>
        {fs.map((f) => <tr key={f.id}><td>{f.niveau}</td><td>{f.matiere}</td><td>{f.lecon} <span className="badge">{f.annee_scolaire}</span></td><td>{dt(f.created_at)}</td><td>{dt(f.updated_at)}</td>
          <td><Link className="btn sm" to={"/fiches/" + f.id}>Ouvrir</Link><Link className="btn sec sm" to={"/fiches/" + f.id}>Modifier</Link>
            <button className="btn sec sm" onClick={() => dup(f)}>Dupliquer</button><button className="btn sec sm" onClick={() => nav(`/fiches/${f.id}?apercu=1`)}>Imprimer</button>
            <button className="btn danger sm" onClick={() => confirmer() && supprimer(say, `/fiches/${f.id}/`, reload)}>Supprimer</button></td></tr>)}</tbody></table>}</>);
}

export function Classes() {
  const say = useContext(Say), [cl, reload] = useGet("/classes/"), [el] = useGet("/eleves/"), [cfg] = useGet("/parametres/"), [n, setN] = useState({ niveau: "CE2", nom: "" });
  const add = async () => { if (!n.nom.trim()) return; await safe(say, () => send("POST", "/classes/", { ...n, annee_scolaire: cfg?.annee_scolaire || "" }), "✅ Enregistrement réussi"); setN({ ...n, nom: "" }); reload(); };
  return (<><h1>Mes classes</h1>
    {!cl?.length ? <Empty>Aucune classe. Ajoutez votre première classe ci-dessous.</Empty> : <div className="grid">{cl.map((c) => (
      <div className="card" key={c.id}><h2 style={{ margin: 0 }}>{c.niveau} {c.nom}</h2><p>{(el || []).filter((e) => e.classe === c.id).length} élèves</p><p className="muted">Dernière activité : {dt(c.updated_at)}</p>
        <Link className="btn" to={"/classes/" + c.id}>Ouvrir la classe</Link></div>))}</div>}
    <h2>Ajouter une classe</h2><div className="row"><select aria-label="Niveau" value={n.niveau} onChange={(e) => setN({ ...n, niveau: e.target.value })}>{NIVEAUX.map((x) => <option key={x}>{x}</option>)}</select>
      <input placeholder="Nom (ex. A)" aria-label="Nom de la classe" value={n.nom} onChange={(e) => setN({ ...n, nom: e.target.value })} /><button className="btn" onClick={add}>Ajouter la classe</button></div></>);
}

export function Classe() {
  const { id } = useParams(), say = useContext(Say), [tab, setTab] = useState("Élèves"), [per, setPer] = useState(""), [nv, setNv] = useState({ prenom: "", nom: "" });
  const [c] = useGet(`/classes/${id}/`), [els, reload] = useGet(`/eleves/?classe=${id}`), [evs] = useGet(`/evaluations/?classe=${id}`), [cfg] = useGet("/parametres/");
  const periode = per || cfg?.periodes[0] || "", [res] = useGet(tab === "Résultats" ? `/classes/${id}/resultats/?periode=${encodeURIComponent(periode)}` : null);
  const add = async () => { if (!nv.nom.trim()) return; await safe(say, () => send("POST", "/eleves/", { ...nv, classe: +id }), "✅ Enregistrement réussi"); setNv({ prenom: "", nom: "" }); reload(); };
  const q = `?periode=${encodeURIComponent(periode)}`;
  if (!c) return <Wait />;
  return (<><h1>{c.niveau} {c.nom}</h1><p>{els?.length || 0} élèves</p>
    <Link className="btn" to={`/classes/${id}/evaluations/nouvelle`}>Ajouter une évaluation</Link><button className="btn sec" onClick={() => setTab("Élèves")}>Ajouter un élève</button>
    <div className="tabs" role="tablist">{["Élèves", "Évaluations", "Résultats", "Documents"].map((t) => <button key={t} role="tab" className={t === tab ? "on" : ""} onClick={() => setTab(t)}>{t}</button>)}</div>
    {tab === "Élèves" && <>{!els?.length && <Empty>Aucun élève dans cette classe.</Empty>}<ul>{els?.map((e) => <li key={e.id}><Link to={"/eleves/" + e.id}>{e.prenom} {e.nom}</Link></li>)}</ul>
      <div className="row"><input placeholder="Prénom" aria-label="Prénom" value={nv.prenom} onChange={(e) => setNv({ ...nv, prenom: e.target.value })} /><input placeholder="Nom" aria-label="Nom" value={nv.nom} onChange={(e) => setNv({ ...nv, nom: e.target.value })} /><button className="btn" onClick={add}>Ajouter l'élève</button></div></>}
    {tab === "Évaluations" && (!evs?.length ? <Empty>Aucune évaluation. Cliquez sur « Ajouter une évaluation ».</Empty> :
      <table><thead><tr><th>Titre</th><th>Matière</th><th>Type</th><th>Période</th><th /></tr></thead><tbody>{evs.map((e) => <tr key={e.id}><td>{e.titre}</td><td>{e.matiere}</td><td>{e.type}</td><td>{e.periode}</td>
        <td><Link className="btn sm" to={`/evaluations/${e.id}/notes`}>Saisir les notes</Link><Link className="btn sec sm" to={`/evaluations/${e.id}/resultats`}>Résultats</Link></td></tr>)}</tbody></table>)}
    {tab !== "Élèves" && tab !== "Évaluations" && <select aria-label="Période" value={periode} onChange={(e) => setPer(e.target.value)} style={{ maxWidth: 260, marginBottom: 12 }}>{cfg?.periodes.map((p) => <option key={p}>{p}</option>)}</select>}
    {tab === "Résultats" && <><table><thead><tr><th>Élève</th><th>Moyenne</th>{cfg?.classement && <th>Rang</th>}</tr></thead><tbody>{res?.map((r) => <tr key={r.eleve}><td>{r.nom}</td><td>{r.moyenne ?? "—"}</td>{cfg?.classement && <td>{r.rang ?? "—"}</td>}</tr>)}</tbody></table>
      <p><Link className="btn" to={`/classes/${id}/appreciations${q}`}>Appréciations</Link></p></>}
    {tab === "Documents" && <Link className="btn" to={`/classes/${id}/verification${q}`}>Vérifier puis générer les documents</Link>}</>);
}

export function NouvelleEval() {
  const { id } = useParams(), nav = useNavigate(), say = useContext(Say), [cfg] = useGet("/parametres/"), [c] = useGet(`/classes/${id}/`), [f, setF] = useState({ titre: "", date: "", note_max: 20, coefficient: 1 });
  if (!cfg || !c) return <Wait />;
  const v = { matiere: cfg.matieres[0], type: cfg.types[0], periode: cfg.periodes[0], ...f }, set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const go = async (e) => { e.preventDefault(); const r = await safe(say, () => send("POST", "/evaluations/", { ...v, date: v.date || null, classe: +id }), "✅ Évaluation enregistrée"); if (r?.id) nav(`/evaluations/${r.id}/notes`); };
  const Sel = ({ k, l, o }) => <><label>{l}</label><select value={v[k]} onChange={set(k)}>{o.map((x) => <option key={x}>{x}</option>)}</select></>;
  return (<form onSubmit={go} style={{ maxWidth: 560 }}><h1>Nouvelle évaluation</h1><p>Classe : <strong>{c.niveau} {c.nom}</strong></p>
    <Sel k="matiere" l="Matière" o={cfg.matieres} /><Sel k="type" l="Type" o={cfg.types} /><Sel k="periode" l="Période" o={cfg.periodes} />
    <label>Date</label><input type="date" value={v.date} onChange={set("date")} /><label>Titre</label><input required placeholder="Évaluation de grammaire" value={v.titre} onChange={set("titre")} />
    <label>Note maximale</label><input type="number" min="1" value={v.note_max} onChange={set("note_max")} /><label>Coefficient</label><input type="number" min="0" step="0.5" value={v.coefficient} onChange={set("coefficient")} />
    <p><button className="btn" style={{ marginTop: 16 }}>Enregistrer et saisir les notes</button></p></form>);
}

export function Evaluations() {
  const [cl] = useGet("/classes/");
  return (<><h1>Évaluations</h1><Steps items={["Évaluation", "Classe", "Notes", "Résultats", "Appréciations", "Vérification", "Bulletin"]} current={1} /><h2>Choisissez une classe</h2>
    {!cl?.length ? <Empty>Créez d'abord une classe dans <Link to="/classes">Mes classes</Link>.</Empty> : <div className="grid">{cl.map((c) => (
      <div className="card" key={c.id}><h2 style={{ margin: 0 }}>{c.niveau} {c.nom}</h2><Link className="btn" to={`/classes/${c.id}/evaluations/nouvelle`}>Nouvelle évaluation</Link><Link className="btn sec" to={"/classes/" + c.id}>Ouvrir la classe</Link></div>))}</div>}</>);
}

export function Notes() {
  const { id } = useParams(), say = useContext(Say), key = "notes:" + id, [ev, reloadEv] = useGet(`/evaluations/${id}/`), [rows, setRows] = useState(null), [etat, setEtat] = useState("ok");
  const ETAT = { ok: "✅ Toutes les notes sont enregistrées", saving: "💾 Enregistrement…", dirty: "✏️ Modification en cours (sauvegardée sur cet appareil)", local: "🟠 Notes sauvegardées sur cet appareil : synchronisation dès que la connexion sera rétablie", erreur: "❌ Impossible d'enregistrer les notes. Vos données locales sont conservées." };
  const envoyer = async (list) => { // une requête par élève : chaque brouillon local n'est effacé qu'après confirmation du serveur
    setEtat("saving"); let queued = false;
    for (const row of list) {
      try { const r = await send("PUT", `/evaluations/${id}/notes/`, [row], { draft: { key, id: row.eleve } }); if (r?.queued) queued = true; }
      catch (e) { setEtat("erreur"); say(e.status === 409 || e.status === 400 ? "⚠️ " + e.detail : "❌ Impossible d'enregistrer les notes. Vos données locales sont conservées."); if (e.status === 409) reloadEv(); return; }
    }
    setEtat(queued ? "local" : "ok");
  };
  useEffect(() => {
    get(`/evaluations/${id}/notes/`).then((srv) => {
      const d = drafts(key); setRows(srv.map((r) => (d[r.eleve] ? { ...r, ...d[r.eleve] } : r)));
      const reste = Object.entries(d); // reprise automatique des saisies restées locales (coupure, fermeture de l'onglet…)
      if (reste.length) { setEtat("local"); envoyer(reste.map(([eleve, v]) => ({ eleve: +eleve, valeur: v.valeur ?? "", observation: v.observation ?? "" }))); }
    }).catch((e) => dispatchEvent(new CustomEvent("apierr", { detail: e.status })));
  }, [id]);
  useEffect(() => { const h = () => { if (!pending()) setEtat((e) => (e === "local" ? "ok" : e)); }; addEventListener("queue-changed", h); return () => removeEventListener("queue-changed", h); }, []);
  if (!ev || !rows) return <Wait />;
  const num = (v) => +String(v).replace(",", "."), empty = (v) => v === "" || v == null, lock = ev.statut === "valide";
  const bad = (v) => !empty(v) && (isNaN(num(v)) || num(v) < 0 || num(v) > +ev.note_max);
  const set = (i, k, v) => { const r = { ...rows[i], [k]: v }; setRows(rows.map((x, j) => (j === i ? r : x))); draftSet(key, r.eleve, { valeur: r.valeur, observation: r.observation }); setEtat("dirty"); };
  const save = (r) => { if (!lock && !bad(r.valeur)) envoyer([{ eleve: r.eleve, valeur: r.valeur ?? "", observation: r.observation }]); };
  const missing = rows.filter((r) => empty(r.valeur)).length, invalid = rows.filter((r) => bad(r.valeur)).length;
  return (<><Steps items={["Évaluation", "Classe", "Notes", "Résultats", "Appréciations", "Vérification", "Bulletin"]} current={2} />
    <h1>{ev.titre}</h1><p className="muted">{ev.matiere} – {ev.type} – {ev.periode} – sur {+ev.note_max}</p>
    <p role="status" className={etat === "erreur" ? "err" : etat === "ok" ? "okc" : "warn"}>{ETAT[etat]}</p>
    {lock && <p className="warn">🔒 Ces résultats sont validés : ils ne peuvent plus être modifiés. <Link to={`/classes/${ev.classe}/verification?periode=${encodeURIComponent(ev.periode)}`}>Rouvrir pour modifier</Link></p>}
    {missing > 0 && <p className="warn">⚠️ Certaines notes sont manquantes ({missing})</p>}{invalid > 0 && <p className="err">❌ {invalid} valeur(s) invalide(s) : la note doit être comprise entre 0 et {+ev.note_max}.</p>}
    <div style={{ overflowX: "auto" }}><table><thead><tr><th>Élève</th><th>Note</th><th>Observation éventuelle</th></tr></thead><tbody>{rows.map((r, i) => (<tr key={r.eleve}><td>{r.nom}</td>
      <td style={{ width: 150 }}><input inputMode="decimal" disabled={lock} aria-label={"Note de " + r.nom} className={bad(r.valeur) ? "bad" : ""} value={r.valeur ?? ""} onChange={(e) => set(i, "valeur", e.target.value)} onBlur={() => save(r)}
        onKeyDown={(e) => e.key === "Enter" && e.target.closest("tr").nextSibling?.querySelector("input")?.focus()} /></td>
      <td><input disabled={lock} aria-label={"Observation pour " + r.nom} value={r.observation ?? ""} onChange={(e) => set(i, "observation", e.target.value)} onBlur={() => save(r)} /></td></tr>))}</tbody></table></div>
    <p className="muted">Chaque saisie est sauvegardée sur cet appareil immédiatement, puis envoyée au serveur. Entrée passe à l'élève suivant.</p><Link className="btn" to={`/evaluations/${id}/resultats`}>Voir les résultats</Link></>);
}

export function Resultats() {
  const { id } = useParams(), [ev] = useGet(`/evaluations/${id}/`), [r] = useGet(`/evaluations/${id}/resultats/`);
  if (!ev || !r) return <Wait />;
  const max = Math.max(1, ...r.distribution), lab = ["0–25 %", "25–50 %", "50–75 %", "75–100 %"];
  return (<><Steps items={["Évaluation", "Classe", "Notes", "Résultats", "Appréciations", "Vérification", "Bulletin"]} current={3} /><h1>Résultats : {ev.titre}</h1>
    <div className="grid">{[["Moyenne", r.moyenne], ["Meilleure note", r.meilleure], ["Note minimale", r.minimale], ["Élèves", `${r.saisies}/${r.effectif}`]].map(([l, v]) => <div className="card" key={l}><strong style={{ fontSize: "1.6rem" }}>{v ?? "—"}</strong><div className="muted">{l}</div></div>)}</div>
    <h2>Distribution des résultats</h2>{r.distribution.map((n, i) => <div className="row" key={i} style={{ flexWrap: "nowrap" }}><span style={{ flex: "0 0 90px" }}>{lab[i]}</span><div className="bar" style={{ flex: "0 0 " + (n / max) * 60 + "%" }} /><span style={{ flex: "0 0 40px" }}>{n}</span></div>)}
    <h2>Moyennes</h2><table><thead><tr>{r.classement && <th>Rang</th>}<th>Nom</th><th>Note</th></tr></thead><tbody>{r.eleves.map((e) => <tr key={e.eleve}>{r.classement && <td>{e.rang} —</td>}<td>{e.nom}</td><td>{e.note}/{r.note_max}</td></tr>)}</tbody></table>
    <p style={{ marginTop: 16 }}><Link className="btn sec" to={`/evaluations/${id}/notes`}>Modifier les notes</Link><Link className="btn" to={`/classes/${ev.classe}/appreciations?periode=${encodeURIComponent(ev.periode)}`}>Passer aux appréciations</Link></p></>);
}

export function Appreciations() {
  const { id } = useParams(), [sp] = useSearchParams(), say = useContext(Say), per = sp.get("periode") || "", q = `?periode=${encodeURIComponent(per)}`;
  const [res] = useGet(`/classes/${id}/resultats/${q}`), [saved] = useGet(`/classes/${id}/appreciations/${q}`), [ver] = useGet(`/classes/${id}/verification/${q}`), [a, setA] = useState({}), [edit, setEdit] = useState({});
  useEffect(() => { if (saved) setA(saved); }, [saved]);
  if (!res || !ver) return <Wait />;
  const lock = ver.statut === "valide";
  const put = (eid, p) => { const n = { texte: "", validee: false, ...(a[eid] || {}), ...p }; setA((x) => ({ ...x, [eid]: n })); return n; };
  const save = (eid, n, ok) => safe(say, () => send("PUT", `/classes/${id}/appreciations/${q}`, [{ eleve: eid, texte: n.texte, validee: n.validee }]), ok);
  const proposer = async () => { const p = await safe(say, () => call("GET", `/classes/${id}/proposer/${q}`)); if (p) setA((x) => { const m = { ...x }; Object.entries(p).forEach(([k, v]) => { if (!m[k]?.validee) m[k] = v; }); return m; }); };
  return (<><Steps items={["Évaluation", "Classe", "Notes", "Résultats", "Appréciations", "Vérification", "Bulletin"]} current={4} /><h1>Appréciations : {per}</h1>
    <p className="muted">Les propositions sont des suggestions : vous restez maître de chaque appréciation, qui n'est définitive qu'une fois validée.</p>
    {lock && <p className="warn">🔒 Résultats validés : <Link to={`/classes/${id}/verification${q}`}>rouvrir pour modifier</Link></p>}
    <button className="btn sec" disabled={lock} onClick={proposer}>Proposer des appréciations</button>
    {res.map((r) => { const x = a[r.eleve] || { texte: "", validee: false }, ed = !lock && (edit[r.eleve] || !x.texte);
      return (<div className="card" key={r.eleve} style={{ marginBottom: 10 }}><strong>{r.nom}</strong> <span className="muted">Moyenne : {r.moyenne ?? "—"}</span> {x.validee && <span className="badge">✅ Validée</span>}
        {x.texte && !x.validee && <div className="muted">Proposition non validée</div>}
        <textarea aria-label={"Appréciation de " + r.nom} disabled={!ed} value={x.texte} placeholder="Écrire une appréciation" onChange={(e) => put(r.eleve, { texte: e.target.value, validee: false })} onBlur={() => ed && x.texte !== (saved?.[r.eleve]?.texte ?? "") && save(r.eleve, x)} />
        <button className="btn sec sm" disabled={lock} onClick={() => { setEdit({ ...edit, [r.eleve]: true }); save(r.eleve, put(r.eleve, { validee: false })); }}>Modifier</button>
        <button className="btn sm" disabled={lock || !x.texte.trim()} onClick={() => { setEdit({ ...edit, [r.eleve]: false }); save(r.eleve, put(r.eleve, { validee: true }), "✅ Appréciation validée"); }}>Valider</button>
        <button className="btn danger sm" disabled={lock || !x.texte} onClick={() => { if (confirmer("Supprimer cette appréciation ?")) { setEdit({ ...edit, [r.eleve]: true }); save(r.eleve, put(r.eleve, { texte: "", validee: false })); } }}>Supprimer</button></div>); })}
    <Link className="btn" to={`/classes/${id}/verification${q}`}>Passer à la vérification</Link></>);
}

export function Verification() {
  const { id } = useParams(), [sp] = useSearchParams(), say = useContext(Say), per = sp.get("periode") || "", q = `?periode=${encodeURIComponent(per)}`, [v, reload] = useGet(`/classes/${id}/verification/${q}`);
  if (!v) return <Wait />;
  const act = async (nom, body, ok) => { const r = await safe(say, () => call("POST", `/classes/${id}/${nom}/${q}`, body), ok); if (r) reload(); };
  const valider = () => {
    if (v.problemes.length && !confirmer("Des points restent à vérifier :\n- " + v.problemes.join("\n- ") + "\n\nValider quand même ?")) return;
    act("valider", { confirmer: v.problemes.length > 0 }, "✅ Résultats validés");
  };
  const S = { brouillon: "📝 Brouillon", verifie: "🔎 Vérifiés", valide: "✅ Validés" }[v.statut];
  return (<><Steps items={["Évaluation", "Classe", "Notes", "Résultats", "Appréciations", "Vérification", "Bulletin"]} current={5} /><h1>Vérification des résultats — {per}</h1>
    <p><span className="badge">{S}</span></p>
    <div className="card"><p>{v.eleves} élèves</p><p>{v.notes_saisies} notes saisies (sur {v.notes_attendues})</p><p>Moyenne générale : {v.moyenne_generale ?? "—"}</p><p>Appréciations validées : {v.appreciations}/{v.eleves}</p><p>Erreurs : {v.erreurs}</p></div>
    {v.problemes.map((p) => <p key={p} className="warn">⚠️ {p}</p>)}
    <p style={{ marginTop: 16 }}>
      {v.statut !== "valide" && <Link className="btn sec" to={`/classes/${id}/appreciations${q}`}>Modifier</Link>}
      {v.statut === "brouillon" && <button className="btn" disabled={!v.nb_evaluations} onClick={() => act("verifier", undefined, "🔎 Résultats marqués comme vérifiés")}>Marquer comme vérifiés</button>}
      {v.statut === "verifie" && <button className="btn" onClick={valider}>Valider les résultats</button>}
      {v.statut === "valide" && <><Link className="btn" to={`/classes/${id}/bulletin${q}`}>Générer le bulletin / livret</Link>
        <button className="btn sec" onClick={() => confirmer("Rouvrir les résultats ? Ils redeviendront modifiables et devront être vérifiés puis validés à nouveau.") && act("rouvrir", undefined, "Résultats rouverts : modifications possibles")}>Rouvrir pour modifier</button></>}</p></>);
}

export function Bulletin() {
  const { id } = useParams(), [sp] = useSearchParams(), per = sp.get("periode") || "", q = `?periode=${encodeURIComponent(per)}`, [type, setType] = useState(null), [gen, setGen] = useState(false);
  const [b, setB] = useState(null), [err, setErr] = useState("");
  useEffect(() => { get(`/classes/${id}/bulletins/${q}`).then(setB).catch((e) => setErr(e.status === 409 ? "Les résultats de cette période ne sont pas encore validés." : e.status === 0 ? "Connexion interrompue : les documents ne sont pas encore disponibles hors connexion." : "Impossible de charger les données du document.")); }, [id, per]);
  if (err) return <><Steps items={["Évaluation", "Classe", "Notes", "Résultats", "Appréciations", "Vérification", "Bulletin"]} current={6} /><Empty>{err}<p><Link className="btn" to={`/classes/${id}/verification${q}`}>Aller à la vérification</Link></p></Empty></>;
  if (!b) return <Wait />;
  if (!gen) return (<><Steps items={["Évaluation", "Classe", "Notes", "Résultats", "Appréciations", "Vérification", "Bulletin"]} current={6} /><h1>Générer les documents</h1>
    <div className="grid">{[["📄", "Bulletin"], ["📘", "Livret"]].map(([i, t]) => <button key={t} className={"choice" + (type === t ? " on" : "")} onClick={() => setType(t)}>{i} {t}</button>)}</div>
    <p className="muted">Modèle provisoire configurable : aucun modèle officiel n'est imposé ni revendiqué par l'application.</p><button className="btn" disabled={!type} onClick={() => setGen(true)}>Générer les documents</button></>);
  return (<><h1 className="noprint">Aperçu du {type.toLowerCase()}</h1><p className="noprint"><button className="btn sec" onClick={() => setGen(false)}>Modifier</button><Pdf /></p><BulletinDocument data={b} type={type} /></>);
}

export function Eleves() {
  const [q, setQ] = useState(""), [el] = useGet("/eleves/"), [cl] = useGet("/classes/"), nom = Object.fromEntries((cl || []).map((c) => [c.id, `${c.niveau} ${c.nom}`]));
  const l = (el || []).filter((e) => `${e.prenom} ${e.nom}`.toLowerCase().includes(q.toLowerCase()));
  return (<><h1>Mes élèves</h1><input placeholder="Rechercher un élève" aria-label="Rechercher un élève" value={q} onChange={(e) => setQ(e.target.value)} />
    {!l.length ? <Empty>Aucun élève. Ajoutez-les depuis une classe.</Empty> : <table><tbody>{l.map((e) => <tr key={e.id}><td><Link to={"/eleves/" + e.id}>{e.prenom} {e.nom}</Link></td><td>{nom[e.classe]}</td></tr>)}</tbody></table>}</>);
}

export function Eleve() {
  const { id } = useParams(), [e] = useGet(`/eleves/${id}/`), [c] = useGet(e ? `/classes/${e.classe}/` : null), [cfg] = useGet("/parametres/"), [h, setH] = useState([]);
  useEffect(() => { if (e && cfg) Promise.all(cfg.periodes.map(async (p) => { const q = `?periode=${encodeURIComponent(p)}`, [r, a] = await Promise.all([get(`/classes/${e.classe}/resultats/${q}`), get(`/classes/${e.classe}/appreciations/${q}`)]);
    return { p, m: r.find((x) => x.eleve === e.id)?.moyenne, a: a[e.id]?.validee ? a[e.id].texte : "" }; })).then(setH).catch(() => {}); }, [e, cfg]);
  if (!e) return <Wait />;
  return (<><h1>{e.prenom} {e.nom}</h1><p>Classe : {c && `${c.niveau} ${c.nom}`}</p><h2>Historique</h2>
    <table><thead><tr><th>Période</th><th>Moyenne</th><th>Appréciation validée</th></tr></thead><tbody>{h.map((x) => <tr key={x.p}><td>{x.p}</td><td>{x.m ?? "—"}</td><td>{x.a || "—"}</td></tr>)}</tbody></table></>);
}

export function Parametres({ onLogout }) {
  const say = useContext(Say), [cfg] = useGet("/parametres/"), [c, setC] = useState(null);
  useEffect(() => { if (cfg) setC(cfg); }, [cfg]);
  if (!c) return <Wait />;
  const lines = (k, l) => <><label>{l} (une par ligne)</label><textarea value={c[k].join("\n")} onChange={(e) => setC({ ...c, [k]: e.target.value.split("\n") })} /></>;
  const seuils = c.appreciations.map((a) => `${a.min}|${a.texte}`).join("\n");
  return (<><h1>Paramètres</h1><p className="pill">Valeurs provisoires : à valider avec les documents pédagogiques et administratifs de référence.</p>
    {lines("matieres", "Matières")}{lines("types", "Types d'évaluation")}{lines("periodes", "Périodes")}{lines("canevas", "Rubriques de la fiche pédagogique")}
    <label>Année scolaire</label><input placeholder="2025/2026" value={c.annee_scolaire || ""} onChange={(e) => setC({ ...c, annee_scolaire: e.target.value })} />
    <label>Base de la moyenne</label><input type="number" value={c.base_moyenne} onChange={(e) => setC({ ...c, base_moyenne: +e.target.value })} />
    <label><input type="checkbox" style={{ width: "auto" }} checked={c.classement} onChange={(e) => setC({ ...c, classement: e.target.checked })} /> Afficher le classement</label>
    <label>Modèle de bulletin / livret (mention affichée)</label><input value={c.modele_bulletin} onChange={(e) => setC({ ...c, modele_bulletin: e.target.value })} />
    <label>Suggestions d'appréciation : seuil (fraction de la base) | texte</label><textarea value={seuils} onChange={(e) => setC({ ...c, appreciations: e.target.value.split("\n").filter(Boolean).map((l) => { const [m, ...t] = l.split("|"); return { min: parseFloat(m) || 0, texte: t.join("|") }; }) })} />
    <p style={{ marginTop: 16 }}><button className="btn" onClick={() => safe(say, () => send("PUT", "/parametres/", { ...c, matieres: c.matieres.filter(Boolean), types: c.types.filter(Boolean), periodes: c.periodes.filter(Boolean), canevas: c.canevas.filter(Boolean) }), "✅ Enregistrement réussi")}>Enregistrer les paramètres</button>
      <button className="btn danger" onClick={() => { localStorage.clear(); onLogout(); }}>Se déconnecter</button></p></>);
}
