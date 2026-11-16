// Préparation des leçons : choix niveau/matière/leçon, fiche pédagogique, liste des fiches.
import { useContext, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { call, send } from "../api";
import { Empty, Say, Steps, Wait, confirmer, useGet } from "../ui";
import { NIVEAUX, ETAPES_FICHE, dt, safe, supprimer, Pdf } from "./communs";

export function Preparation() {
  const nav = useNavigate(), say = useContext(Say), [cfg] = useGet("/parametres/");
  const [referentiel] = useGet("/referentiel-pedagogique/");
  const [niv, setNiv] = useState(), [mat, setMat] = useState(), [q, setQ] = useState(""), [nv, setNv] = useState("");
  const [lecons, reload] = useGet(niv && mat ? `/lecons/?niveau=${niv}&matiere=${encodeURIComponent(mat)}` : null);
  const propositions = (referentiel?.referentiel?.disponible_dans_pilote ? referentiel.entrees : [])
    .filter((e) => e.niveau === niv && e.matiere === mat && `${e.titre} ${e.domaine}`.toLowerCase().includes(q.toLowerCase()));
  const ouvrir = async (titre, proposition = null) => {
    const sections = proposition ? [
      { titre: "Compétence (résumé)", contenu: proposition.competence_resume || "" },
      { titre: "Objectifs repérés", contenu: proposition.objectifs_reperes.join("\n") },
      { titre: "Contenus repérés", contenu: proposition.contenu_resume || "" },
      { titre: "Durée", contenu: proposition.duree || "" },
      { titre: "Démarche", contenu: proposition.demarche || "" },
      { titre: "Évaluation", contenu: proposition.evaluation || "" },
      { titre: "Source et validation", contenu: `Pilote à vérifier pédagogiquement — ${referentiel.referentiel.nom}, référence ${referentiel.referentiel.annee_reference}, page ${proposition.source_pages_pdf.join(", ")}. Ce résumé n'est pas une transcription officielle.` }
    ] : (cfg?.canevas || []).map((t) => ({ titre: t, contenu: "" }));
    const f = await safe(say, () => send("POST", "/fiches/", { niveau: niv, matiere: mat, domaine: proposition?.domaine || "", lecon: titre, annee_scolaire: cfg?.annee_scolaire || "", sections }));
    if (f?.id) nav("/fiches/" + f.id);
  };
  const ajouter = async () => { if (!nv.trim()) return; await safe(say, () => send("POST", "/lecons/", { niveau: niv, matiere: mat, titre: nv }), "Enregistrement réussi"); setNv(""); reload(); };
  return (<>
    <div className="page-header">
      <h1>Préparer une leçon</h1>
      <p className="subtitle">Créez une fiche pédagogique en quelques étapes</p>
    </div>
    
    <Steps items={ETAPES_FICHE} current={!niv ? 1 : !mat ? 2 : 3} />
    
    <div className="step-section">
      <h2 className="step-title">Étape 1 : Choisissez le niveau</h2>
      <div className="level-grid">
        {NIVEAUX.map((n) => <button key={n} className={"level-card" + (n === niv ? " active" : "")} onClick={() => { setNiv(n); setMat(); }}>{n}</button>)}
      </div>
    </div>
    
    {niv && <div className="step-section">
      <h2 className="step-title">Étape 2 : Choisissez la matière</h2>
      <div className="subject-grid">
        {cfg?.matieres.map((m) => <button key={m} className={"subject-card" + (m === mat ? " active" : "")} onClick={() => setMat(m)}>{m}</button>)}
      </div>
    </div>}
    
    {mat && <div className="step-section">
      <h2 className="step-title">Étape 3 : Choisissez la leçon</h2>
      <input className="search-input" placeholder="Rechercher une leçon" aria-label="Rechercher une leçon" value={q} onChange={(e) => setQ(e.target.value)} />
      <p className="context-text">{niv} → {mat}</p>

      {propositions.map((e) => (
        <div className="lesson-card lesson-pilot" key={e.id}>
          <div className="lesson-info">
            <span className="pill">Pilote à vérifier</span>
            <p className="lesson-pilot-source">{e.domaine} · Guide de l’étape 1, p. {e.source_pages_pdf.join(", ")}</p>
            <span className="lesson-title">{e.titre}</span>
            <p>{e.competence_resume}</p>
            <p className="muted">{e.objectifs_reperes.join(" ")}</p>
          </div>
          <button className="btn" onClick={() => ouvrir(e.titre, e)}>Créer une fiche proposée</button>
        </div>
      ))}
      
      {(lecons || []).filter((l) => l.titre.toLowerCase().includes(q.toLowerCase())).map((l) => (
        <div className="lesson-card" key={l.id}>
          <div className="lesson-info">
            {l.domaine && <span className="lesson-domain">{l.domaine} → </span>}
            <span className="lesson-title">{l.titre}</span>
          </div>
          <button className="btn" onClick={() => ouvrir(l.titre)}>Ouvrir</button>
        </div>
      ))}
      
      {!lecons?.length && !propositions.length && <Empty>Le programme complet n'est pas encore intégré. En attendant, saisissez votre leçon ci-dessous.</Empty>}
      
      <div className="new-lesson">
        <input className="lesson-input" placeholder="Titre de la leçon" aria-label="Titre de la leçon" value={nv} onChange={(e) => setNv(e.target.value)} />
        <button className="btn sec" onClick={ajouter}>Ajouter</button>
        <button className="btn" disabled={!nv.trim()} onClick={() => ouvrir(nv)}>Créer la fiche</button>
      </div>
    </div>}
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
  if (prev) return (<>
    <Steps items={ETAPES_FICHE} current={6} />
    <div className="apercu">{sel.fiche && <><h1>{f.lecon}</h1><p className="muted">{f.niveau} – {f.matiere}{f.domaine && ` – ${f.domaine}`} – {f.annee_scolaire}</p>
      {s.map((x, i) => <div key={i}><h2>{x.titre}</h2><p style={{ whiteSpace: "pre-wrap" }}>{x.contenu}</p></div>)}</>}
      {sel.ex && ex.filter((e) => e.imprimer).map((e, i) => <div key={e.id}><h2>Exercice {i + 1} : {e.titre}</h2><p style={{ whiteSpace: "pre-wrap" }}>{e.contenu}</p></div>)}</div>
    <div className="noprint"><button className="btn sec" onClick={() => setPrev(false)}>Modifier</button></div><Pdf />
  </>);
  return (<>
    <Steps items={ETAPES_FICHE} current={4} /><h1>{f.lecon}</h1><p className="muted">{f.niveau} – {f.matiere} – {f.annee_scolaire} <span className="pill">Canevas provisoire : à valider</span></p>
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
  const dup = async (f) => { const a = prompt("Année scolaire de la copie (ex. 2026/2027) :", ""); if (a === null) return; const n = await safe(say, () => call("POST", `/fiches/${f.id}/dupliquer/`, { annee_scolaire: a }), "Fiche dupliquée"); if (n) reload(); };
  return (<>
    <div className="page-header">
      <h1>Mes fiches</h1>
      <p className="subtitle">Gérez vos fiches pédagogiques</p>
    </div>
    
    <div className="filters-section">
      <input className="search-input" placeholder="Rechercher une fiche" aria-label="Rechercher" value={q} onChange={(e) => setQ(e.target.value)} />
      <select aria-label="Niveau" value={niv} onChange={(e) => setNiv(e.target.value)}>
        <option value="">Tous les niveaux</option>
        {NIVEAUX.map((n) => <option key={n}>{n}</option>)}
      </select>
      <select aria-label="Matière" value={mat} onChange={(e) => setMat(e.target.value)}>
        <option value="">Toutes les matières</option>
        {cfg?.matieres.map((m) => <option key={m}>{m}</option>)}
      </select>
      <input placeholder="Année scolaire" aria-label="Année scolaire" value={an} onChange={(e) => setAn(e.target.value)} />
    </div>
    
    {!fs?.length ? <Empty>Aucune fiche. <Link to="/preparation">Préparer une leçon</Link></Empty> : (
      <div className="fiches-list">
        {fs.map((f) => (
          <div className="fiche-card" key={f.id}>
            <div className="fiche-header">
              <span className="fiche-level">{f.niveau}</span>
              <span className="fiche-subject">{f.matiere}</span>
              <span className="fiche-year badge">{f.annee_scolaire}</span>
            </div>
            <h3 className="fiche-title">{f.lecon}</h3>
            <div className="fiche-meta">
              <span>Créée le {dt(f.created_at)}</span>
              <span>Modifiée le {dt(f.updated_at)}</span>
            </div>
            <div className="fiche-actions">
              <Link className="btn sm" to={"/fiches/" + f.id}>Ouvrir</Link>
              <Link className="btn sec sm" to={"/fiches/" + f.id}>Modifier</Link>
              <button className="btn sec sm" onClick={() => dup(f)}>Dupliquer</button>
              <button className="btn sec sm" onClick={() => nav(`/fiches/${f.id}?apercu=1`)}>Imprimer</button>
              <button className="btn danger sm" onClick={() => confirmer() && supprimer(say, `/fiches/${f.id}/`, reload)}>Supprimer</button>
            </div>
          </div>
        ))}
      </div>
    )}
  </>);
}
