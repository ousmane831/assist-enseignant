import { useContext, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { call, draftSet, drafts, get, pending, send } from "./api";
import BulletinDocument, { exporterPdf } from "./BulletinDocument";
import { Empty, Say, Steps, Wait, confirmer, useGet, DrapeauSenegal } from "./ui";

const NIVEAUX = ["CI", "CP", "CE1", "CE2", "CM1", "CM2"];
// Listes proposées dans le formulaire de demande de compte. Valeurs de référence à ajuster si besoin :
// les académies (IA) sont régionales ; le libellé de l'IEF reste libre (chaque département a la sienne).
const REGIONS = ["Dakar", "Diourbel", "Fatick", "Kaffrine", "Kaolack", "Kédougou", "Kolda", "Louga", "Matam", "Saint-Louis", "Sédhiou", "Tambacounda", "Thiès", "Ziguinchor"];
const PIECES = [["cni", "Carte nationale d'identité"], ["passeport", "Passeport"], ["carte_electeur", "Carte d'électeur"], ["carte_pro", "Carte professionnelle"], ["autre", "Autre pièce d'identité"]];
const dt = (d) => new Date(d).toLocaleDateString("fr-FR");
const msg = (e) => e?.status === 0 ? "🟠 Cette action nécessite une connexion Internet." : e?.status === 404 ? "❌ Cette page n'existe plus ou n'est plus accessible." : e?.status === 400 || e?.status === 409 ? "⚠️ " + (e.detail || "Vérifiez les informations saisies.") : e?.status === 401 ? "Votre session a expiré." : e?.status === 429 ? "⏳ Trop de tentatives en peu de temps. Patientez une minute, puis réessayez." : "❌ Impossible d'enregistrer. Vos données locales sont conservées.";
// Écran de connexion : distinguer un vrai refus d'identifiants d'un problème technique.
// Sans cela, un serveur éteint, une origine bloquée par CORS ou une limitation de débit feraient
// croire à tort à un mot de passe faux (message trompeur).
const safe = async (say, fn, ok) => { try { const r = await fn(); if (r?.queued) say("🟠 Enregistré sur cet appareil : sera synchronisé dès que la connexion sera disponible."); else if (ok) say(ok); return r; } catch (e) { say(msg(e)); } };
const msgConnexion = (e) => e?.status === 400 || e?.status === 401 ? "❌ Identifiant ou mot de passe incorrect."
  : e?.status === 429 ? "⏳ Trop de tentatives en peu de temps. Patientez une minute, puis réessayez."
  : e?.status ? `❌ Connexion impossible (erreur ${e.status} du serveur). Réessayez dans un instant.`
  : `🟠 Serveur injoignable : vérifiez qu'il est démarré (port 8000) et ouvrez l'application sur http://localhost:5173 (adresse autorisée).`;
const supprimer = async (say, path, reload) => { const r = await safe(say, () => send("DELETE", path)); if (r !== undefined && !r?.queued) reload(); }; // recharge seulement si le serveur a confirmé
const Pdf = () => (<span className="noprint"><button className="btn sec" onClick={exporterPdf}>Télécharger PDF</button><button className="btn sec" onClick={exporterPdf}>Imprimer</button></span>);

export function Login({ onDone, message }) {
  const [u, setU] = useState(""), [p, setP] = useState(""), [err, setErr] = useState(""), [voir, setVoir] = useState(false), [demande, setDemande] = useState(false), [envoi, setEnvoi] = useState(false);
  const go = async (ev) => {
    ev.preventDefault(); setErr(""); setEnvoi(true);
    try { const r = await call("POST", "/login/", { username: u, password: p }); localStorage.setItem("token", r.token); localStorage.setItem("user", u); onDone(); }
    catch (e) { setErr(msgConnexion(e)); }
    finally { setEnvoi(false); }
  };
  return (<div className="login-page">
    <section className="login-brand">
      <DrapeauSenegal size={96} />
      <div>
        <p className="login-etat">École élémentaire · Sénégal</p>
        <h1>Assistant Enseignant</h1>
        <p className="login-tagline">Préparez vos leçons, saisissez vos notes et éditez vos bulletins, même sans connexion Internet.</p>
      </div>
      <ul className="login-avantages">
        <li>Fiches pédagogiques et exercices par niveau</li>
        <li>Évaluations, moyennes et bulletins prêts à imprimer</li>
        <li>Vos données restent enregistrées sur votre appareil</li>
      </ul>
    </section>
    <section className="login-form-panel">
      {demande ? <DemandeCompte onRetour={() => setDemande(false)} /> : (<form onSubmit={go} className="login-card" aria-labelledby="login-titre">
        <div className="login-tricolore" aria-hidden="true"><span /><span /><span /></div>
        <h2 id="login-titre">Connexion</h2>
        <p className="muted">Connectez-vous pour retrouver vos classes et vos fiches.</p>
        {message && <p className="warn" role="alert">{message}</p>}
        <label htmlFor="u">Identifiant</label>
        <input id="u" value={u} onChange={(ev) => setU(ev.target.value)} autoComplete="username" required aria-describedby={err ? "login-err" : undefined} />
        <label htmlFor="p">Mot de passe</label>
        <div className="login-pass">
          <input id="p" type={voir ? "text" : "password"} value={p} onChange={(ev) => setP(ev.target.value)} autoComplete="current-password" required aria-describedby={err ? "login-err" : undefined} />
          <button type="button" className="login-eye" onClick={() => setVoir(!voir)} aria-pressed={voir}>{voir ? "Masquer" : "Afficher"}</button>
        </div>
        {err && <p className="err" id="login-err" role="alert">{err}</p>}
        <button className="btn login-submit" disabled={envoi}>{envoi ? "Connexion en cours…" : "Se connecter"}</button>
        <p className="login-sep">ou</p>
        <button type="button" className="btn sec login-demande" onClick={() => setDemande(true)}>Demander un compte</button>
        <p className="login-note">Accès réservé aux enseignants autorisés : les comptes sont créés par l'administrateur après vérification.</p>
      </form>)}
    </section>
  </div>);
}

// Demande d'ouverture de compte : écran ouvert sans compte, atteint par le bouton de la page de connexion.
// La demande part vers le serveur (POST /demandes-compte/) : l'administrateur vérifie l'identité déclarée
// puis crée le compte. Aucun compte n'est créé automatiquement et aucune donnée d'élève n'est demandée.
export function DemandeCompte({ onRetour }) {
  const vide = { nom_complet: "", telephone: "", email: "", region: "", ia: "", ief: "", type_piece: "cni", numero_piece: "" };
  const [f, setF] = useState(vide), [err, setErr] = useState(""), [ok, setOk] = useState(null), [envoi, setEnvoi] = useState(false);
  const set = (k) => (ev) => setF((v) => ({ ...v, [k]: ev.target.value }));
  const envoyer = async (ev) => {
    ev.preventDefault(); setErr(""); setEnvoi(true);
    try { setOk(await call("POST", "/demandes-compte/", f)); } catch (e) { setErr(msg(e)); } finally { setEnvoi(false); }
  };
  if (ok) return (<div className="login-card large">
    <div className="login-tricolore" aria-hidden="true"><span /><span /><span /></div>
    <h2>Demande enregistrée</h2>
    <p className="okc" role="status">✅ Demande n° {ok.id} transmise pour {ok.nom_complet}.</p>
    <p className="muted">L'administrateur vérifie vos informations, puis vous contacte au {ok.telephone} pour vous remettre vos identifiants. Elles ne sont pas partagées avec d'autres enseignants.</p>
    <button className="btn login-submit" onClick={onRetour}>Retour à la connexion</button>
  </div>);
  return (<form onSubmit={envoyer} className="login-card large" aria-labelledby="demande-titre">
    <div className="login-tricolore" aria-hidden="true"><span /><span /><span /></div>
    <h2 id="demande-titre">Demander un compte</h2>
    <p className="muted">Ces informations servent à vérifier votre identité d'enseignant. L'envoi nécessite une connexion Internet.</p>
    <label htmlFor="dc-nom">Nom complet</label>
    <input id="dc-nom" value={f.nom_complet} onChange={set("nom_complet")} autoComplete="name" required />
    <div className="form-grid">
      <div>
        <label htmlFor="dc-tel">Numéro de téléphone</label>
        <input id="dc-tel" type="tel" value={f.telephone} onChange={set("telephone")} autoComplete="tel" placeholder="77 123 45 67" required />
      </div>
      <div>
        <label htmlFor="dc-mail">E-mail <span className="muted">(facultatif)</span></label>
        <input id="dc-mail" type="email" value={f.email} onChange={set("email")} autoComplete="email" />
      </div>
      <div>
        <label htmlFor="dc-region">Région</label>
        <select id="dc-region" value={f.region} onChange={set("region")} required>
          <option value="">— Choisir —</option>{REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="dc-ia">IA (Inspection d'Académie)</label>
        <input id="dc-ia" list="dc-ia-liste" value={f.ia} onChange={set("ia")} placeholder="ex. IA de Thiès" required />
        <datalist id="dc-ia-liste">{REGIONS.map((r) => <option key={r} value={`IA de ${r}`} />)}</datalist>
      </div>
      <div>
        <label htmlFor="dc-ief">IEF (Inspection de l'Éducation et de la Formation)</label>
        <input id="dc-ief" value={f.ief} onChange={set("ief")} placeholder="ex. IEF de Mbour" required />
      </div>
      <div>
        <label htmlFor="dc-piece">Pièce d'identité</label>
        <div className="row">
          <select id="dc-piece" aria-label="Type de pièce d'identité" value={f.type_piece} onChange={set("type_piece")}>
            {PIECES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input aria-label="Numéro de la pièce d'identité" value={f.numero_piece} onChange={set("numero_piece")} placeholder="Numéro de la pièce" required />
        </div>
      </div>
    </div>
    {err && <p className="err" role="alert">{err}</p>}
    <button className="btn login-submit" disabled={envoi}>{envoi ? "Envoi en cours…" : "Envoyer la demande"}</button>
    <p className="login-note">Une seule demande en attente par numéro de téléphone. <button type="button" className="lien" onClick={onRetour}>Retour à la connexion</button></p>
  </form>);
}

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

export function Dashboard() {
  const [me] = useGet("/me/"), [cl] = useGet("/classes/"), [el] = useGet("/eleves/"), [fi] = useGet("/fiches/"), [ev] = useGet("/evaluations/");
  const niv = Object.fromEntries((cl || []).map((c) => [c.id, c.niveau]));
  const act = [...(fi || []).map((f) => ({ t: f.updated_at, l: `Fiche ${f.niveau} – ${f.matiere} – ${f.lecon}` })),
    ...(ev || []).map((e) => ({ t: e.created_at, l: `Évaluation ${niv[e.classe] || ""} – ${e.matiere}` }))].sort((a, b) => b.t.localeCompare(a.t)).slice(0, 5);
  return (<>
    <div className="welcome-section">
      <h1>Bienvenue, {me?.nom}</h1>
      <p className="subtitle">Tableau de bord</p>
    </div>
    
    <div className="dashboard-grid">
      <div className="action-card primary">
        <div className="card-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </div>
        <h2>Préparer une leçon</h2>
        <p>Créez ou retrouvez rapidement une fiche pédagogique et les exercices associés.</p>
        <Link className="btn" to="/preparation">Commencer</Link>
      </div>
      
      <div className="action-card secondary">
        <div className="card-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
        </div>
        <h2>Gérer une évaluation</h2>
        <p>Saisissez les notes, calculez les résultats et préparez vos bulletins.</p>
        <Link className="btn sec" to="/evaluations">Nouvelle évaluation</Link>
      </div>
    </div>
    
    <div className="stats-grid">
      {[
        { label: "Classes", value: cl?.length ?? 0 },
        { label: "Élèves", value: el?.length ?? 0 },
        { label: "Fiches", value: Math.min(fi?.length || 0, 5) },
        { label: "Évaluations", value: Math.min(ev?.length || 0, 5) }
      ].map((stat) => (
        <div className="stat-card" key={stat.label}>
          <div className="stat-value">{stat.value}</div>
          <div className="stat-label">{stat.label}</div>
        </div>
      ))}
    </div>
    
    <div className="recent-section">
      <h2>Activité récente</h2>
      {act.length ? (
        <div className="activity-list">
          {act.map((a, i) => (
            <div className="activity-item" key={i}>{a.l}</div>
          ))}
        </div>
      ) : (
        <Empty>Aucune activité récente. Commencez par préparer une leçon.</Empty>
      )}
    </div>
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
  const ajouter = async () => { if (!nv.trim()) return; await safe(say, () => send("POST", "/lecons/", { niveau: niv, matiere: mat, titre: nv }), "Enregistrement réussi"); setNv(""); reload(); };
  return (<>
    <div className="page-header">
      <h1>Préparer une leçon</h1>
      <p className="subtitle">Créez une fiche pédagogique en quelques étapes</p>
    </div>
    
    <div className="progress-bar">
      <div className="progress-step completed">Niveau</div>
      <div className="progress-step completed">Matière</div>
      <div className="progress-step completed">Leçon</div>
      <div className="progress-step">Fiche</div>
      <div className="progress-step">Exercices</div>
      <div className="progress-step">Aperçu</div>
    </div>
    
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
      
      {(lecons || []).filter((l) => l.titre.toLowerCase().includes(q.toLowerCase())).map((l) => (
        <div className="lesson-card" key={l.id}>
          <div className="lesson-info">
            {l.domaine && <span className="lesson-domain">{l.domaine} → </span>}
            <span className="lesson-title">{l.titre}</span>
          </div>
          <button className="btn" onClick={() => ouvrir(l.titre)}>Ouvrir</button>
        </div>
      ))}
      
      {!lecons?.length && <Empty>Le programme officiel n'est pas préchargé. En attendant, saisissez votre leçon ci-dessous.</Empty>}
      
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
  return (<>
    <div className="page-header">
      <h1>Évaluations</h1>
      <p className="subtitle">Gérez les évaluations et les notes de vos élèves</p>
    </div>
    
    <div className="progress-bar">
      <div className="progress-step">Évaluation</div>
      <div className="progress-step active">Classe</div>
      <div className="progress-step">Notes</div>
      <div className="progress-step">Résultats</div>
      <div className="progress-step">Appréciations</div>
      <div className="progress-step">Vérification</div>
      <div className="progress-step">Bulletin</div>
    </div>
    
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

export function Parametres({ onLogout }) {
  const say = useContext(Say), [cfg, recharger] = useGet("/parametres/"), [c, setC] = useState(null);
  useEffect(() => { if (cfg) setC(cfg); }, [cfg]);
  if (!c) return <Wait />;
  const modifie = JSON.stringify(c) !== JSON.stringify(cfg); // affiche l'état « modifications non enregistrées »
  // set(clé, valeur) : met à jour la copie locale de la configuration (appelée avec deux arguments).
  const set = (k, v) => setC({ ...c, [k]: v });
  const liste = (k, l, aide) => (<div>
    <label htmlFor={"p-" + k}>{l}</label>
    <p className="param-aide">{aide}</p>
    <textarea id={"p-" + k} value={c[k].join("\n")} onChange={(e) => set(k, e.target.value.split("\n"))} />
  </div>);
  const seuils = c.appreciations.map((a) => `${a.min}|${a.texte}`).join("\n");
  const enregistrer = async () => {
    const propre = { ...c, matieres: c.matieres.filter(Boolean).map((x) => x.trim()), types: c.types.filter(Boolean).map((x) => x.trim()),
      periodes: c.periodes.filter(Boolean).map((x) => x.trim()), canevas: c.canevas.filter(Boolean).map((x) => x.trim()) };
    const r = await safe(say, () => send("PUT", "/parametres/", propre), "✅ Paramètres enregistrés.");
    if (r !== undefined && !r?.queued) recharger(); // une écriture seulement mise en file ne doit pas effacer la saisie
  };
  const enAttente = pending();
  return (<>
    <div className="page-header">
      <h1>Paramètres</h1>
      <p className="subtitle">Réglages et listes utilisés par vos fiches, vos évaluations et vos bulletins.</p>
    </div>
    <p className="pill">Valeurs provisoires de l'application : aucune n'est une règle officielle — à valider avec les documents pédagogiques et administratifs de référence.</p>

    <section className="card param-section">
      <h2>Année scolaire et calculs</h2>
      <p className="param-aide">Ces réglages s'appliquent aux moyennes, aux résultats et aux bulletins.</p>
      <div className="param-grille">
        <div>
          <label htmlFor="p-annee_scolaire">Année scolaire</label>
          <input id="p-annee_scolaire" placeholder="2025/2026" value={c.annee_scolaire || ""} onChange={(e) => set("annee_scolaire", e.target.value)} />
          <p className="param-aide">Reprise sur vos fiches et vos documents.</p>
        </div>
        <div>
          <label htmlFor="p-base_moyenne">Base de la moyenne</label>
          <input id="p-base_moyenne" type="number" min="1" value={c.base_moyenne} onChange={(e) => set("base_moyenne", +e.target.value)} />
          <p className="param-aide">Toutes les notes sont ramenées sur cette base (ex. 20).</p>
        </div>
        <div>
          <label htmlFor="p-modele_bulletin">Modèle de bulletin / livret</label>
          <input id="p-modele_bulletin" value={c.modele_bulletin} onChange={(e) => set("modele_bulletin", e.target.value)} />
          <p className="param-aide">Mention imprimée sur les documents : aucun modèle officiel n'est revendiqué.</p>
        </div>
        <div>
          <label htmlFor="p-classement">Classement des élèves</label>
          <label className="case"><input id="p-classement" type="checkbox" checked={c.classement} onChange={(e) => set("classement", e.target.checked)} /> Afficher le rang dans les résultats et les bulletins</label>
        </div>
      </div>
    </section>

    <section className="card param-section">
      <h2>Listes pédagogiques</h2>
      <p className="param-aide">Une valeur par ligne ; supprimez une ligne pour retirer la valeur. Ces listes alimentent les menus de toute l'application.</p>
      <div className="param-grille">
        {liste("matieres", "Matières", "Utilisées pour les fiches et les évaluations.")}
        {liste("types", "Types d'évaluation", "Ex. Devoir, Évaluation, Composition.")}
        {liste("periodes", "Périodes", "Ordre d'affichage dans l'application.")}
        {liste("canevas", "Rubriques de la fiche pédagogique", "Titres des sections de vos fiches.")}
      </div>
    </section>

    <section className="card param-section">
      <h2>Suggestions d'appréciation</h2>
      <p className="param-aide">Proposition faite à partir de la moyenne : elle n'est jamais appliquée sans votre validation. Une règle par ligne, au format <code>seuil|texte</code>, le seuil étant une fraction de la base (ex. <code>0.5|Résultats satisfaisants</code>).</p>
      <textarea id="p-appreciations" value={seuils} onChange={(e) => set("appreciations", e.target.value.split("\n").filter(Boolean).map((l) => { const [m, ...t] = l.split("|"); return { min: parseFloat(m) || 0, texte: t.join("|") }; }))} />
    </section>

    <section className="card param-section zone-danger">
      <h2>Compte et session</h2>
      <p className="param-aide">Vos données restent sur le serveur ; se déconnecter retire seulement l'accès de cet appareil{enAttente ? ` (${enAttente} modification(s) en attente y resteront enregistrées jusqu'à votre prochaine connexion)` : ""}.</p>
      <button className="btn danger" onClick={() => { if (confirmer("Se déconnecter de cet appareil ?")) onLogout(); }}>Se déconnecter</button>
    </section>

    <div className="barre-actions">
      <button className="btn" disabled={!modifie} onClick={enregistrer}>Enregistrer les paramètres</button>
      <button className="btn sec" disabled={!modifie} onClick={() => setC(cfg)}>Annuler les modifications</button>
      {modifie ? <span className="etat-modif" role="status">● Modifications non enregistrées</span> : <span className="muted" role="status">À jour</span>}
    </div>
  </>);
}
