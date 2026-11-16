// Parcours d'évaluation : création, notes, résultats, appréciations, vérification, bulletin.
import { useContext, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { call, draftSet, drafts, get, pending, send } from "../api";
import BulletinDocument from "../BulletinDocument";
import { Empty, Say, Steps, Wait, confirmer, useGet } from "../ui";
import { ETAPES_EVALUATION, safe, Pdf } from "./communs";

export function NouvelleEval() {
  const { id } = useParams(), nav = useNavigate(), say = useContext(Say), [cfg] = useGet("/parametres/"), [c] = useGet(`/classes/${id}/`), [f, setF] = useState({ titre: "", date: "", note_max: 20, coefficient: 1 });
  if (!cfg || !c) return <Wait />;
  const v = { matiere: cfg.matieres[0], type: cfg.types[0], periode: cfg.periodes[0], ...f }, set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const go = async (e) => { e.preventDefault(); const r = await safe(say, () => send("POST", "/evaluations/", { ...v, date: v.date || null, classe: +id }), "✅ Évaluation enregistrée"); if (r?.id) nav(`/evaluations/${r.id}/notes`); };
  const Sel = ({ k, l, o }) => <><label>{l}</label><select value={v[k]} onChange={set(k)}>{o.map((x) => <option key={x}>{x}</option>)}</select></>;
  return (<form onSubmit={go} style={{ maxWidth: 560 }}><Steps items={ETAPES_EVALUATION} current={1} /><h1>Nouvelle évaluation</h1><p>Classe : <strong>{c.niveau} {c.nom}</strong></p>
    <Sel k="matiere" l="Matière" o={cfg.matieres} /><Sel k="type" l="Type" o={cfg.types} /><Sel k="periode" l="Période" o={cfg.periodes} />
    <label>Date</label><input type="date" value={v.date} onChange={set("date")} /><label>Titre</label><input required placeholder="Évaluation de grammaire" value={v.titre} onChange={set("titre")} />
    <label>Note maximale</label><input type="number" min="1" value={v.note_max} onChange={set("note_max")} /><label>Coefficient</label><input type="number" min="0" step="0.5" value={v.coefficient} onChange={set("coefficient")} />
    <p><button className="btn" style={{ marginTop: 16 }}>Enregistrer et saisir les notes</button></p></form>);
}

export function Evaluations() {
  const [cl] = useGet("/classes/");
  return (<>
    <div className="page-header">
      <h1>Évaluations</h1>
      <p className="subtitle">Gérez les évaluations et les notes de vos élèves</p>
    </div>
    
    <Steps items={ETAPES_EVALUATION} current={0} />
    
    <h2 className="section-title">Choisissez une classe</h2>
    
    {!cl?.length ? <Empty>Créez d'abord une classe dans <Link to="/classes">Mes classes</Link>.</Empty> : (
      <div className="classes-grid">
        {cl.map((c) => (
          <div className="class-card" key={c.id}>
            <div className="class-header">
              <span className="class-level">{c.niveau}</span>
              <span className="class-name">{c.nom}</span>
            </div>
            <div className="class-actions">
              <Link className="btn" to={`/classes/${c.id}/evaluations/nouvelle`}>Nouvelle évaluation</Link>
              <Link className="btn sec" to={"/classes/" + c.id}>Ouvrir</Link>
            </div>
          </div>
        ))}
      </div>
    )}
  </>);
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
  return (<><Steps items={ETAPES_EVALUATION} current={2} />
    <h1>{ev.titre}</h1><p className="muted">{ev.matiere} – {ev.type} – {ev.periode} – sur {+ev.note_max}</p>
    <p role="status" className={etat === "erreur" ? "err" : etat === "ok" ? "okc" : "warn"}>{ETAT[etat]}</p>
    {lock && <p className="warn">🔒 Ces résultats sont validés : ils ne peuvent plus être modifiés. <Link to={`/classes/${ev.classe}/verification?periode=${encodeURIComponent(ev.periode)}`}>Rouvrir pour modifier</Link></p>}
    {missing > 0 && <p className="warn">⚠️ Certaines notes sont manquantes ({missing})</p>}{invalid > 0 && <p className="err">❌ {invalid} valeur(s) invalide(s) : la note doit être comprise entre 0 et {+ev.note_max}.</p>}
    <div style={{ overflowX: "auto" }}><table><thead><tr><th>Élève</th><th>Note</th><th>Observation éventuelle</th></tr></thead><tbody>{rows.map((r, i) => (<tr key={r.eleve}><td>{r.nom}</td>
      <td style={{ width: 150 }}><input inputMode="decimal" disabled={lock} aria-label={"Note de " + r.nom} className={bad(r.valeur) ? "bad" : ""} value={r.valeur ?? ""} onChange={(e) => set(i, "valeur", e.target.value)} onBlur={() => save(r)}
        onKeyDown={(e) => e.key === "Enter" && e.target.closest("tr").nextSibling?.querySelector("input")?.focus()} /></td>
      <td><input disabled={lock} aria-label={"Observation pour " + r.nom} value={r.observation ?? ""} onChange={(e) => set(i, "observation", e.target.value)} onBlur={() => save(r)} /></td></tr>))}</tbody></table></div>
    <p className="muted">Chaque saisie est sauvegardée sur cet appareil immédiatement, puis envoyée au serveur. Entrée passe à l'élève suivant.</p>
    <p className="muted">🤖 Les appréciations de la période sont déduites automatiquement des moyennes (barème des <Link to="/parametres">Paramètres</Link>) : aucune saisie n'est nécessaire de votre part.</p>
    <Link className="btn" to={`/evaluations/${id}/resultats`}>Voir les résultats</Link></>);
}

export function Resultats() {
  const { id } = useParams(), [ev] = useGet(`/evaluations/${id}/`), [r] = useGet(`/evaluations/${id}/resultats/`);
  if (!ev || !r) return <Wait />;
  const max = Math.max(1, ...r.distribution), lab = ["0–25 %", "25–50 %", "50–75 %", "75–100 %"];
  return (<><Steps items={ETAPES_EVALUATION} current={3} /><h1>Résultats : {ev.titre}</h1>
    <div className="grid">{[["Moyenne", r.moyenne], ["Meilleure note", r.meilleure], ["Note minimale", r.minimale], ["Élèves", `${r.saisies}/${r.effectif}`]].map(([l, v]) => <div className="card" key={l}><strong style={{ fontSize: "1.6rem" }}>{v ?? "—"}</strong><div className="muted">{l}</div></div>)}</div>
    <h2>Distribution des résultats</h2>{r.distribution.map((n, i) => <div className="row" key={i} style={{ flexWrap: "nowrap" }}><span style={{ flex: "0 0 90px" }}>{lab[i]}</span><div className="bar" style={{ flex: "0 0 " + (n / max) * 60 + "%" }} /><span style={{ flex: "0 0 40px" }}>{n}</span></div>)}
    <h2>Moyennes</h2><table><thead><tr>{r.classement && <th>Rang</th>}<th>Nom</th><th>Note</th></tr></thead><tbody>{r.eleves.map((e) => <tr key={e.eleve}>{r.classement && <td>{e.rang} —</td>}<td>{e.nom}</td><td>{e.note}/{r.note_max}</td></tr>)}</tbody></table>
    <p style={{ marginTop: 16 }}><Link className="btn sec" to={`/evaluations/${id}/notes`}>Modifier les notes</Link><Link className="btn" to={`/classes/${ev.classe}/appreciations?periode=${encodeURIComponent(ev.periode)}`}>Passer aux appréciations</Link></p></>);
}

// Appréciations : le serveur les REMPLIT automatiquement (barème des Paramètres appliqué aux moyennes).
// L'enseignant n'a donc rien à saisir ; il peut personnaliser un élève, et son texte validé prévaut sur la règle.
export function Appreciations() {
  const { id } = useParams(), [sp] = useSearchParams(), say = useContext(Say), per = sp.get("periode") || "", q = `?periode=${encodeURIComponent(per)}`;
  const [res] = useGet(`/classes/${id}/resultats/${q}`), [saved] = useGet(`/classes/${id}/appreciations/${q}`), [ver] = useGet(`/classes/${id}/verification/${q}`), [a, setA] = useState({}), [travail, setTravail] = useState({});
  useEffect(() => { if (saved) setA(saved); }, [saved]);
  if (!res || !ver) return <Wait />;
  const lock = ver.statut === "valide";
  const ligne = (eid) => a[eid] || { texte: "", auto: "", source: "auto", brouillon: "", validee: false };
  // Valeur affichée : ce que l'enseignant est en train d'écrire, sinon son texte enregistré, sinon l'appréciation automatique.
  const champ = (eid) => travail[eid] ?? (ligne(eid).brouillon || ligne(eid).texte);
  const envoyer = async (list, ok) => {
    const r = await safe(say, () => send("PUT", `/classes/${id}/appreciations/${q}`, list), ok);
    if (r && !r?.queued) { setA(r); setTravail((x) => { const m = { ...x }; list.forEach((g) => delete m[g.eleve]); return m; }); }
    return r;
  };
  const personnalises = res.filter((r) => ligne(r.eleve).brouillon); // textes écrits mais non validés : jamais publiés en l'état
  const validerTout = () => envoyer(personnalises.map((r) => ({ eleve: r.eleve, texte: ligne(r.eleve).brouillon, validee: true })), "✅ Vos textes personnalisés sont validés");
  const revenirTout = () => confirmer("Revenir aux appréciations automatiques pour toute la classe ?\n\nLes textes personnalisés seront retirés : l'appréciation sera de nouveau déduite des moyennes.") && envoyer(res.map((r) => ({ eleve: r.eleve, texte: "", validee: false })), "🤖 Appréciations automatiques rétablies pour toute la classe");
  return (<><Steps items={ETAPES_EVALUATION} current={4} /><h1>Appréciations : {per}</h1>
    <p className="pill">🤖 Remplies automatiquement à partir des moyennes (barème défini dans <Link to="/parametres">Paramètres</Link>) : rien à saisir. Personnalisez un élève seulement si vous le souhaitez — votre texte validé prévaut alors sur la règle.</p>
    {lock && <p className="warn">🔒 Résultats validés : <Link to={`/classes/${id}/verification${q}`}>rouvrir pour modifier</Link></p>}
    <p className="muted">{ver.appreciations} appréciation(s) prête(s) sur {ver.eleves} · {ver.appreciations_auto ?? 0} automatique(s) · {ver.appreciations_personnalisees ?? 0} personnalisée(s)</p>
    {personnalises.length > 0 && <p className="warn">✏️ {personnalises.length} texte(s) personnalisé(s) enregistré(s) mais non validé(s) : l'appréciation automatique est utilisée à leur place jusqu'à validation.</p>}
    <p><button className="btn sec sm" disabled={lock || !personnalises.length} onClick={validerTout}>Valider mes {personnalises.length} texte(s) personnalisé(s)</button>
      <button className="btn sec sm" disabled={lock} onClick={revenirTout}>Revenir aux appréciations automatiques</button></p>
    {res.map((r) => { const x = ligne(r.eleve), v = champ(r.eleve), modifie = v.trim() !== (x.brouillon || x.texte).trim();
      return (<div className="card" key={r.eleve} style={{ marginBottom: 10 }}>
        <strong>{r.nom}</strong> <span className="muted">Moyenne : {r.moyenne ?? "—"}</span>{" "}
        {x.source === "enseignant" ? <span className="badge">✏️ Personnalisée</span> : x.brouillon ? <span className="badge">✏️ À valider</span> : <span className="badge">🤖 Automatique</span>}
        {modifie && <span className="muted"> · non enregistré</span>}
        <textarea aria-label={"Appréciation de " + r.nom} disabled={lock} value={v}
          placeholder={x.auto || "Aucune note dans cette période : pas encore d'appréciation automatique"}
          onChange={(e) => setTravail((t) => ({ ...t, [r.eleve]: e.target.value }))}
          onBlur={() => !lock && modifie && envoyer([{ eleve: r.eleve, texte: v, validee: false }])} />
        <p className="param-aide">Barème appliqué : « {x.auto || "—"} »{x.source === "enseignant" ? " — votre texte validé prévaut" : " — c'est l'appréciation utilisée"}.</p>
        <button className="btn sm" disabled={lock || !v.trim()} onClick={() => envoyer([{ eleve: r.eleve, texte: v, validee: true }], "✅ Appréciation enregistrée")}>Enregistrer mon texte</button>
        <button className="btn sec sm" disabled={lock || (!x.brouillon && x.source === "auto")} onClick={() => envoyer([{ eleve: r.eleve, texte: "", validee: false }], "🤖 Appréciation automatique rétablie")}>Retour à la règle automatique</button>
      </div>); })}
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
  return (<><Steps items={ETAPES_EVALUATION} current={5} /><h1>Vérification des résultats — {per}</h1>
    <p><span className="badge">{S}</span></p>
    <div className="card"><p>{v.eleves} élèves</p><p>{v.notes_saisies} notes saisies (sur {v.notes_attendues})</p><p>Moyenne générale : {v.moyenne_generale ?? "—"}</p><p>Appréciations prêtes : {v.appreciations}/{v.eleves} — {v.appreciations_auto ?? 0} automatique(s), {v.appreciations_personnalisees ?? 0} personnalisée(s)</p><p>Erreurs : {v.erreurs}</p></div>
    {(v.informations || []).map((i) => <p key={i} className="muted">🤖 {i}</p>)}
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
  if (err) return <><Steps items={ETAPES_EVALUATION} current={6} /><Empty>{err}<p><Link className="btn" to={`/classes/${id}/verification${q}`}>Aller à la vérification</Link></p></Empty></>;
  if (!b) return <Wait />;
  if (!gen) return (<><Steps items={ETAPES_EVALUATION} current={6} /><h1>Générer les documents</h1>
    <div className="grid">{[["📄", "Bulletin"], ["📘", "Livret"]].map(([i, t]) => <button key={t} className={"choice" + (type === t ? " on" : "")} onClick={() => setType(t)}>{i} {t}</button>)}</div>
    <p className="muted">Modèle provisoire configurable : aucun modèle officiel n'est imposé ni revendiqué par l'application.</p><button className="btn" disabled={!type} onClick={() => setGen(true)}>Générer les documents</button></>);
  return (<><h1 className="noprint">Aperçu du {type.toLowerCase()}</h1><p className="noprint"><button className="btn sec" onClick={() => setGen(false)}>Modifier</button><Pdf /></p><BulletinDocument data={b} type={type} /></>);
}
