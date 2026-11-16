// Élèves : liste et historique d'un élève.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { get } from "../api";
import { Empty, Wait, useGet } from "../ui";

export function Eleves() {
  const [q, setQ] = useState(""), [classe, setClasse] = useState(""), [el] = useGet("/eleves/"), [cl] = useGet("/classes/");
  const nom = Object.fromEntries((cl || []).map((c) => [c.id, `${c.niveau} ${c.nom}`]));
  const tous = el || [], classes = cl || [];
  const l = tous.filter((e) => (!classe || String(e.classe) === classe) && `${e.prenom} ${e.nom}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (<>
    <div className="page-header">
      <h1>Mes élèves</h1>
      <p className="subtitle">{tous.length} élève{tous.length > 1 ? "s" : ""} dans {classes.length} classe{classes.length > 1 ? "s" : ""} — les élèves s'ajoutent depuis une classe.</p>
    </div>
    <div className="filters-section">
      <input type="search" placeholder="Rechercher un élève (nom ou prénom)" aria-label="Rechercher un élève" value={q} onChange={(e) => setQ(e.target.value)} />
      <select aria-label="Filtrer par classe" value={classe} onChange={(e) => setClasse(e.target.value)}>
        <option value="">Toutes les classes</option>
        {classes.map((c) => <option key={c.id} value={c.id}>{c.niveau} {c.nom}</option>)}
      </select>
    </div>
    {!l.length ? <Empty>{tous.length ? "Aucun élève ne correspond à cette recherche." : "Aucun élève pour le moment : ouvrez une classe pour ajouter vos élèves."}</Empty> : (<>
      <p className="admin-resume">{l.length} élève{l.length > 1 ? "s" : ""} affiché{l.length > 1 ? "s" : ""}.</p>
      <div className="table-scroll"><table>
        <thead><tr><th>Élève</th><th>Classe</th><th>Action</th></tr></thead>
        <tbody>{l.map((e) => (<tr key={e.id}>
          <td><span className="personne"><span className="avatar" aria-hidden="true">{(e.prenom[0] || "") + (e.nom[0] || "")}</span><Link to={"/eleves/" + e.id}>{e.prenom} {e.nom}</Link></span></td>
          <td>{nom[e.classe] ? <Link className="badge" to={"/classes/" + e.classe}>{nom[e.classe]}</Link> : "—"}</td>
          <td><Link className="btn sec sm" to={"/eleves/" + e.id}>Ouvrir la fiche</Link></td>
        </tr>))}</tbody></table></div>
    </>)}
  </>);
}

export function Eleve() {
  const { id } = useParams(), [e] = useGet(`/eleves/${id}/`), [c] = useGet(e ? `/classes/${e.classe}/` : null), [cfg] = useGet("/parametres/"), [h, setH] = useState([]), [charge, setCharge] = useState(false);
  useEffect(() => { if (e && cfg) Promise.all(cfg.periodes.map(async (p) => { const q = `?periode=${encodeURIComponent(p)}`, [r, a] = await Promise.all([get(`/classes/${e.classe}/resultats/${q}`), get(`/classes/${e.classe}/appreciations/${q}`)]);
    return { p, m: r.find((x) => x.eleve === e.id)?.moyenne, a: a[e.id]?.validee ? a[e.id].texte : "" }; })).then(setH).catch(() => {}).finally(() => setCharge(true)); }, [e, cfg]);
  if (!e) return <Wait />;
  const base = cfg?.base_moyenne ?? 20;
  return (<>
    <div className="page-header">
      <div className="personne">
        <span className="avatar lg" aria-hidden="true">{(e.prenom[0] || "") + (e.nom[0] || "")}</span>
        <div>
          <h1 style={{ margin: 0 }}>{e.prenom} {e.nom}</h1>
          <p className="subtitle">Classe : {c ? <Link className="badge" to={"/classes/" + c.id}>{c.niveau} {c.nom}</Link> : "—"}</p>
        </div>
      </div>
    </div>
    <h2>Historique des périodes</h2>
    <p className="param-aide">Moyennes calculées à partir des notes enregistrées ; seules les appréciations validées apparaissent.</p>
    {!charge ? <p className="muted">Chargement de l'historique…</p> : !h.length ? <Empty>Aucun historique pour l'instant : saisissez les notes d'une évaluation.</Empty> : (
      <div className="table-scroll"><table>
        <thead><tr><th>Période</th><th>Moyenne / {base}</th><th>Appréciation validée</th></tr></thead>
        <tbody>{h.map((x) => <tr key={x.p}>
          <td>{x.p}</td>
          <td className="histo-moyenne">{x.m ?? "—"}</td>
          <td>{x.a || <span className="muted">—</span>}</td>
        </tr>)}</tbody>
      </table></div>)}
    <p><Link className="btn sec" to="/eleves">Tous les élèves</Link>{c && <Link className="btn sec" to={`/classes/${c.id}`}>Voir la classe</Link>}</p>
  </>);
}
