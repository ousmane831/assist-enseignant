// Préparation des leçons : choix niveau/matière/leçon, fiche pédagogique, liste des fiches.
import { useContext, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { call, send } from "../api";
import { Empty, Say, Steps, Wait, confirmer, useGet } from "../ui";
import { NIVEAUX, ETAPES_FICHE, dt, safe, supprimer, Pdf } from "./communs";

export function Preparation() {
  const nav = useNavigate(), say = useContext(Say), [cfg] = useGet("/parametres/");
  const [niv, setNiv] = useState(), [mat, setMat] = useState(), [q, setQ] = useState(""), [nv, setNv] = useState(""), [enCours, setEnCours] = useState(null);
  const [ref] = useGet(niv ? `/referentiel-pedagogique/?niveau=${niv}` : null); // guides transcrits, pour ce niveau
  const [lecons, reload] = useGet(niv && mat ? `/lecons/?niveau=${niv}&matiere=${encodeURIComponent(mat)}` : null);
  const activites = ref?.activites || [];
  const matieresGuide = new Set(activites.map((a) => a.matiere));
  const matieres = [...new Set([...(cfg?.matieres || []), ...matieresGuide])];
  const cherche = q.trim().toLowerCase(), correspond = (...t) => !cherche || t.join(" ").toLowerCase().includes(cherche);
  // Séances du guide pour la matière choisie, filtrées par la recherche (OS, contenus, OA, activité).
  const guide = activites.filter((a) => a.matiere === mat).map((a) => ({ ...a, paliers: a.paliers.map((p) => ({ ...p,
    oa: p.oa.map((oa) => ({ ...oa, seances: oa.seances.filter((s) => correspond(s.os, s.contenus, oa.intitule || "", a.activite)) })).filter((oa) => oa.seances.length) }))
    .filter((p) => p.oa.length) })).filter((a) => a.paliers.length);
  const nbSeances = guide.reduce((n, a) => n + a.paliers.reduce((m, p) => m + p.oa.reduce((k, oa) => k + oa.seances.length, 0), 0), 0);
  const generer = async (s) => { // la fiche est construite par le serveur à partir du guide, puis appartient à l'enseignant
    setEnCours(s.id);
    try { const f = await safe(say, () => call("POST", "/fiches/generer/", { seance: s.id }), "✅ Fiche générée à partir du guide : vous pouvez la modifier librement"); if (f?.id) nav("/fiches/" + f.id); }
    finally { setEnCours(null); }
  };
  const ouvrir = async (titre) => {
    const sections = (cfg?.canevas || []).map((t) => ({ titre: t, contenu: "" }));
    const f = await safe(say, () => send("POST", "/fiches/", { niveau: niv, matiere: mat, domaine: "", lecon: titre, annee_scolaire: cfg?.annee_scolaire || "", sections }));
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
        {matieres.map((m) => <button key={m} className={"subject-card" + (m === mat ? " active" : "")} onClick={() => setMat(m)}>
          {m}{matieresGuide.has(m) && <span className="badge-guide">Guide</span>}</button>)}
      </div>
    </div>}

    {mat && <div className="step-section">
      <h2 className="step-title">Étape 3 : Choisissez la séance</h2>
      <input className="search-input" placeholder="Rechercher (objectif, contenu…)" aria-label="Rechercher une séance ou une leçon" value={q} onChange={(e) => setQ(e.target.value)} />
      <p className="context-text">{niv} → {mat}</p>

      {guide.length > 0 && <p className="param-aide">Une fiche par objectif spécifique (OS). Compétence, objectifs, contenus, critères et situation d'intégration sont repris du guide officiel ; le déroulement est un canevas à adapter. <strong>La fiche générée vous appartient : modifiez-la librement.</strong></p>}
      {guide.map((a) => (<section className="guide-activite" key={a.id}>
        <h3>{a.activite} <span className="muted">· {a.domaine} — {a.guide.nom}</span></h3>
        {a.paliers.map((p) => (<details className="palier" key={p.numero} open={!!cherche || a.paliers.length === 1}>
          <summary><strong>Palier {p.numero}</strong> <span className="muted">· {p.duree} · p. {p.pages[0]}{p.pages[1] !== p.pages[0] ? `-${p.pages[1]}` : ""}</span>
            <span className="palier-intitule">{p.intitule}</span></summary>
          {p.oa.map((oa, i) => (<div className="oa" key={i}>
            <h4>{[oa.numero && `OA ${oa.numero}`, oa.intitule].filter(Boolean).join(" · ")}{oa.duree && <span className="muted"> · {oa.duree}</span>}</h4>
            {oa.seances.map((s) => (<div className="lesson-card seance" key={s.id}>
              <div className="lesson-info">
                <span className="lesson-title">{s.os}</span>
                {s.contenus && <p className="seance-contenus">{s.contenus}</p>}
              </div>
              <button className="btn" disabled={enCours !== null} onClick={() => generer(s)}>{enCours === s.id ? "Génération…" : "Générer la fiche"}</button>
            </div>))}
          </div>))}
        </details>))}
      </section>))}
      {cherche && matieresGuide.has(mat) && !nbSeances && <Empty>Aucune séance du guide ne correspond à « {q} ».</Empty>}

      {(lecons || []).length > 0 && <h3>Mes leçons</h3>}
      {(lecons || []).filter((l) => correspond(l.titre)).map((l) => (
        <div className="lesson-card" key={l.id}>
          <div className="lesson-info">
            {l.domaine && <span className="lesson-domain">{l.domaine} → </span>}
            <span className="lesson-title">{l.titre}</span>
          </div>
          <button className="btn" onClick={() => ouvrir(l.titre)}>Ouvrir</button>
        </div>
      ))}
      
      {!lecons?.length && !matieresGuide.has(mat) && <Empty>Le guide de ce niveau n'est pas encore intégré pour cette matière. En attendant, saisissez votre leçon ci-dessous.</Empty>}
      
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
    <Steps items={ETAPES_FICHE} current={4} /><h1>{f.lecon}</h1><p className="muted">{f.niveau} – {f.matiere} – {f.annee_scolaire} {f.origine ? <span className="pill">📘 Générée depuis le guide (p. {f.origine.pages.join("-")}) · modifiable librement</span> : <span className="pill">Canevas provisoire : à valider</span>}</p>
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
