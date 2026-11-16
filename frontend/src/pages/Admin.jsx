// Administration : gestion des demandes de compte (comptes administrateurs uniquement).
import { useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { call } from "../api";
import { Empty, Say, Wait, confirmer, useGet } from "../ui";
import { REGIONS, msg, safe } from "./communs";

// Écran affiché aux enseignants (non administrateurs) qui ouvrent une page réservée.
export function AccesReserve() {
  return <Empty>🔒 Cette page est réservée aux comptes administrateurs.<p><Link className="btn" to="/">Retour au tableau de bord</Link></p></Empty>;
}

const LIBELLE_STATUT = { nouvelle: "En attente", traitee: "Traitée", rejetee: "Rejetée" };
const Etiquette = ({ s }) => <span className={"badge st-" + s}>{LIBELLE_STATUT[s] || s}</span>;
const dh = (d) => (d ? new Date(d).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—");

// Détail d'une demande : informations déclarées en lecture seule + traitement par l'administrateur.
// La création du compte n'a lieu qu'après confirmation explicite ; le mot de passe temporaire est affiché une fois.
function PanneauDemande({ d, say, reload, onFermer }) {
  const [x, setX] = useState(d), [note, setNote] = useState(d.note || ""), [compte, setCompte] = useState(null), [encours, setEncours] = useState(false);
  const patcher = async (corps, msgOk) => {
    setEncours(true);
    try { const r = await safe(say, () => call("PATCH", `/admin/demandes-compte/${x.id}/`, corps), msgOk); if (r) { setX(r); setNote(r.note || ""); } }
    finally { setEncours(false); reload(); }
  };
  const supprimerDemande = async () => {
    if (!confirmer(`Supprimer définitivement la demande de ${x.nom_complet} ? La pièce d'identité déclarée sera perdue.`)) return;
    const r = await safe(say, () => call("DELETE", `/admin/demandes-compte/${x.id}/`), "✅ Demande supprimée.");
    if (r !== undefined) { onFermer(); reload(); }
  };
  const creerCompte = async () => {
    if (!confirmer(`Créer le compte de ${x.nom_complet} ? Un mot de passe temporaire sera affiché une seule fois.`)) return;
    setEncours(true);
    try { const r = await call("POST", `/admin/demandes-compte/${x.id}/creer-compte/`, {}); setCompte(r); setX({ ...x, statut: "traitee", compte_cree: r.username }); }
    catch (e) { say(msg(e)); }
    finally { setEncours(false); reload(); }
  };
  return (<div className="card demande-detail" style={{ marginTop: 20 }}>
    <h2>Demande de {x.nom_complet}</h2>
    <dl>
      <dt>Téléphone</dt><dd>{x.telephone}</dd>
      <dt>E-mail</dt><dd>{x.email || "—"}</dd>
      <dt>Région</dt><dd>{x.region}</dd>
      <dt>IA (Inspection d'Académie)</dt><dd>{x.ia}</dd>
      <dt>IEF</dt><dd>{x.ief}</dd>
      <dt>Pièce d'identité</dt><dd>{x.type_piece} n° {x.numero_piece}</dd>
      <dt>Reçue le</dt><dd>{dh(x.created_at)}</dd>
      <dt>Statut</dt><dd><Etiquette s={x.statut} /></dd>
      <dt>Traitée par</dt><dd>{x.traite_par ? `${x.traite_par} — ${dh(x.traite_le)}` : "—"}</dd>
      <dt>Compte créé</dt><dd>{x.compte_cree || "—"}</dd>
    </dl>
    <label htmlFor="d-note">Suite donnée / observations (visibles des administrateurs seulement)</label>
    <textarea id="d-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex. pièce vérifiée à l'IEF, enseignante appelée le 12/09…" />
    <div className="actions-ligne">
      <button className="btn sec sm" disabled={encours} onClick={() => patcher({ note }, "✅ Note enregistrée.")}>Enregistrer la note</button>
      {x.statut !== "traitee" && <button className="btn sm" disabled={encours} onClick={() => patcher({ statut: "traitee" }, "✅ Demande marquée comme traitée.")}>Marquer comme traitée</button>}
      {x.statut !== "rejetee" && <button className="btn sec sm" disabled={encours} onClick={() => { if (confirmer("Marquer cette demande comme rejetée ?")) patcher({ statut: "rejetee" }, "✅ Demande rejetée."); }}>Rejeter</button>}
      {!x.compte_cree && <button className="btn sm" disabled={encours} onClick={creerCompte}>Créer le compte</button>}
      <button className="btn danger sm" disabled={encours} onClick={supprimerDemande}>Supprimer la demande</button>
      <button className="btn sec sm" onClick={onFermer}>Fermer</button>
    </div>
    {compte && <div className="compte-cree" role="status">
      <strong>✅ Compte créé : {compte.username}</strong>
      <p>Mot de passe temporaire, affiché une seule fois et jamais enregistré :</p>
      <code>{compte.mot_de_passe}</code>
      <p className="muted">{compte.message}</p>
      <button className="btn sec sm" onClick={() => { navigator.clipboard?.writeText(compte.mot_de_passe); say("📋 Mot de passe copié."); }}>Copier</button>
    </div>}
  </div>);
}

// ---------- Page d'administration : gestion des demandes de compte ----------
// Cette page n'est qu'un confort d'utilisation : le serveur refuse déjà tout accès sans rôle
// administrateur (403) et n'expose jamais les demandes aux enseignants.
export function GestionDemandes() {
  const say = useContext(Say);
  const [statut, setStatut] = useState(""), [region, setRegion] = useState(""), [saisie, setSaisie] = useState(""), [q, setQ] = useState(""), [sel, setSel] = useState(null);
  useEffect(() => { const t = setTimeout(() => setQ(saisie.trim()), 400); return () => clearTimeout(t); }, [saisie]); // évite une requête à chaque frappe
  const [liste, reload] = useGet("/admin/demandes-compte/?" + new URLSearchParams({ ...(statut && { statut }), ...(region && { region }), ...(q && { q }) }));
  const demandes = liste || [];
  const nb = (s) => demandes.filter((d) => d.statut === s).length;
  return (<>
    <div className="page-header">
      <h1>Demandes de compte</h1>
      <p className="subtitle">Vérifiez l'identité déclarée, puis créez le compte. Aucun compte n'est créé automatiquement.</p>
    </div>
    <div className="card admin-filtres">
      <div><label htmlFor="f-statut">Statut</label>
        <select id="f-statut" value={statut} onChange={(e) => setStatut(e.target.value)}>
          <option value="">Toutes</option>{Object.entries(LIBELLE_STATUT).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select></div>
      <div><label htmlFor="f-region">Région</label>
        <select id="f-region" value={region} onChange={(e) => setRegion(e.target.value)}>
          <option value="">Toutes</option>{REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select></div>
      <div><label htmlFor="f-q">Recherche</label>
        <input id="f-q" type="search" value={saisie} onChange={(e) => setSaisie(e.target.value)} placeholder="nom, téléphone, IA, IEF, n° de pièce…" /></div>
    </div>
    {liste === null ? <Wait /> : demandes.length === 0 ? <Empty>Aucune demande ne correspond à cette recherche.</Empty> : (<>
      <p className="admin-resume">{demandes.length} demande(s) affichée(s) — en attente : {nb("nouvelle")}, traitées : {nb("traitee")}, rejetées : {nb("rejetee")}.</p>
      <div className="table-scroll"><table>
        <thead><tr><th>Demandeur</th><th>Téléphone</th><th>Région</th><th>IA / IEF</th><th>Reçue le</th><th>Statut</th><th>Action</th></tr></thead>
        <tbody>{demandes.map((d) => (<tr key={d.id}>
          <td>{d.nom_complet}{d.email && <><br /><span className="muted">{d.email}</span></>}</td>
          <td>{d.telephone}</td>
          <td>{d.region}</td>
          <td>{d.ia}<br /><span className="muted">{d.ief}</span></td>
          <td>{dh(d.created_at)}</td>
          <td><Etiquette s={d.statut} /></td>
          <td><button className="btn sec sm" onClick={() => setSel(d)}>Ouvrir</button></td>
        </tr>))}</tbody></table></div>
      {sel && <PanneauDemande key={sel.id} d={sel} say={say} reload={reload} onFermer={() => setSel(null)} />}
    </>)}
  </>);
}
