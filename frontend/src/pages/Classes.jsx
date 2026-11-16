// Classes : liste et détail d'une classe (élèves, évaluations, résultats, documents).
import { useContext, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { send } from "../api";
import { Empty, Say, Wait, useGet } from "../ui";
import { NIVEAUX, dt, safe } from "./communs";

export function Classes() {
  const say = useContext(Say), [cl, reload] = useGet("/classes/"), [el] = useGet("/eleves/"), [cfg] = useGet("/parametres/"), [n, setN] = useState({ niveau: "CE2", nom: "" });
  const add = async () => { if (!n.nom.trim()) return; await safe(say, () => send("POST", "/classes/", { ...n, annee_scolaire: cfg?.annee_scolaire || "" }), "Enregistrement réussi"); setN({ ...n, nom: "" }); reload(); };
  return (<>
    <div className="page-header">
      <h1>Mes classes</h1>
      <p className="subtitle">Gérez vos classes et vos élèves</p>
    </div>
    
    {!cl?.length ? <Empty>Aucune classe. Ajoutez votre première classe ci-dessous.</Empty> : (
      <div className="classes-grid">
        {cl.map((c) => {
          const elevesCount = (el || []).filter((e) => e.classe === c.id).length;
          return (
            <div className="class-card" key={c.id}>
              <div className="class-header">
                <span className="class-level">{c.niveau}</span>
                <span className="class-name">{c.nom}</span>
              </div>
              <div className="class-stats">
                <div className="class-stat">
                  <span className="stat-number">{elevesCount}</span>
                  <span className="stat-label">élèves</span>
                </div>
              </div>
              <p className="class-activity">Dernière activité : {dt(c.updated_at)}</p>
              <Link className="btn" to={"/classes/" + c.id}>Ouvrir</Link>
            </div>
          );
        })}
      </div>
    )}
    
    <div className="add-class-section">
      <h2 className="section-title">Ajouter une classe</h2>
      <div className="add-class-form">
        <select aria-label="Niveau" value={n.niveau} onChange={(e) => setN({ ...n, niveau: e.target.value })}>
          {NIVEAUX.map((x) => <option key={x}>{x}</option>)}
        </select>
        <input placeholder="Nom (ex. A)" aria-label="Nom de la classe" value={n.nom} onChange={(e) => setN({ ...n, nom: e.target.value })} />
        <button className="btn" onClick={add}>Ajouter</button>
      </div>
    </div>
  </>);
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
