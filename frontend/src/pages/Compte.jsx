// Compte de l'enseignant : profil, mot de passe, paramètres.
import { useContext, useEffect, useState } from "react";
import { call, mediaUrl, pending, send, upload } from "../api";
import { Say, Wait, confirmer, useGet } from "../ui";
import { REGIONS, CORPS, msg, safe } from "./communs";

// Profil de l'enseignant : coordonnées et informations professionnelles, toutes facultatives (le compte reste
// utilisable sans). Le nom enregistré ici est celui affiché partout dans l'application. La photo exige une
// connexion (un fichier ne se met pas en file d'attente) et n'est visible que par son propriétaire.
export function Profil() {
  const say = useContext(Say), [p, reload] = useGet("/profil/"), [f, setF] = useState(null), [envoi, setEnvoi] = useState(false);
  useEffect(() => { if (p) setF(p); }, [p]);
  if (!f) return <Wait />;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const enregistrer = async () => { const r = await safe(say, () => send("PUT", "/profil/", f), "✅ Profil enregistré"); if (r && !r.queued) reload(); };
  const changerPhoto = async (ev) => {
    const fichier = ev.target.files?.[0]; if (!fichier) return;
    setEnvoi(true);
    try { await upload("/profil/photo/", fichier); say("✅ Photo enregistrée"); reload(); dispatchEvent(new CustomEvent("profil-modifie")); }
    catch (e) { say(msg(e)); } finally { setEnvoi(false); ev.target.value = ""; }
  };
  const retirerPhoto = async () => {
    if (!confirmer("Retirer votre photo de profil ?")) return;
    await safe(say, () => call("DELETE", "/profil/photo/"), "Photo retirée");
    reload(); dispatchEvent(new CustomEvent("profil-modifie"));
  };
  const initiales = ((f.prenom?.[0] || "") + (f.nom?.[0] || "")).toUpperCase();
  return (<>
    <div className="page-header">
      <h1>Mon profil</h1>
      <p className="subtitle">Vos coordonnées et vos informations professionnelles</p>
    </div>

    <div className="card">
      <div className="profil-tete">
        {f.photo ? <img className="profil-photo" src={mediaUrl(f.photo)} alt="Photo de profil" />
          : <span className="profil-photo vide" aria-hidden="true">{initiales || "👤"}</span>}
        <div className="profil-tete-texte">
          <label htmlFor="p-photo">Photo de profil (JPEG, PNG ou WebP, 2 Mo maximum)</label>
          <input id="p-photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={envoi} onChange={changerPhoto} />
          <p className="param-aide">{envoi ? "Envoi de la photo…" : "Visible uniquement par vous. L'envoi nécessite une connexion Internet."}</p>
          {f.photo && <button className="btn sec sm" onClick={retirerPhoto}>Retirer la photo</button>}
        </div>
      </div>

      <div className="row">
        <div><label htmlFor="p-civilite">Civilité</label>
          <select id="p-civilite" value={f.civilite || ""} onChange={set("civilite")}><option value="">—</option><option value="mme">Madame</option><option value="m">Monsieur</option></select></div>
        <div><label htmlFor="p-nom">Nom</label><input id="p-nom" value={f.nom || ""} onChange={set("nom")} /></div>
        <div><label htmlFor="p-prenom">Prénoms</label><input id="p-prenom" value={f.prenom || ""} onChange={set("prenom")} /></div>
      </div>

      <div className="row">
        <div><label htmlFor="p-tel">Téléphone</label><input id="p-tel" value={f.telephone || ""} onChange={set("telephone")} placeholder="77 123 45 67" /></div>
        <div><label htmlFor="p-email">E-mail (facultatif)</label><input id="p-email" type="email" value={f.email || ""} onChange={set("email")} /></div>
      </div>

      <div className="row">
        <div><label htmlFor="p-matricule">Matricule / n° d'identification (facultatif)</label><input id="p-matricule" value={f.matricule || ""} onChange={set("matricule")} /></div>
        <div><label htmlFor="p-corps">Corps</label><select id="p-corps" value={f.corps || ""} onChange={set("corps")}>{CORPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      </div>

      <div className="row">
        <div><label htmlFor="p-ecole">École / établissement</label><input id="p-ecole" value={f.ecole || ""} onChange={set("ecole")} /></div>
        <div><label htmlFor="p-region">Région</label>
          <select id="p-region" value={f.region || ""} onChange={set("region")}><option value="">—</option>{REGIONS.map((r) => <option key={r}>{r}</option>)}</select></div>
      </div>

      <div className="row">
        <div><label htmlFor="p-ia">IA (Inspection d'Académie)</label>
          <input id="p-ia" list="p-ia-liste" value={f.ia || ""} onChange={set("ia")} placeholder="ex. IA de Thiès" />
          <datalist id="p-ia-liste">{REGIONS.map((r) => <option key={r} value={`IA de ${r}`} />)}</datalist></div>
        <div><label htmlFor="p-ief">IEF (Inspection de l'Éducation et de la Formation)</label><input id="p-ief" value={f.ief || ""} onChange={set("ief")} /></div>
      </div>
    </div>

    <div className="barre-actions">
      <button className="btn" onClick={enregistrer}>💾 Enregistrer</button>
      <span className="muted">Ces informations restent privées : aucun autre enseignant ne les voit.</span>
    </div>
  </>);
}

// Changement du mot de passe (dont le mot de passe temporaire remis par l'administrateur).
// Connexion requise : un mot de passe ne se met jamais en file d'attente sur l'appareil.
// Le serveur révoque les autres sessions et renvoie un nouveau token pour cet appareil.
function MotDePasse() {
  const say = useContext(Say), vide = { ancien: "", nouveau: "", confirmation: "" };
  const [f, setF] = useState(vide), [err, setErr] = useState(""), [envoi, setEnvoi] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const differents = f.confirmation && f.nouveau !== f.confirmation;
  const changer = async (ev) => {
    ev.preventDefault(); setErr("");
    if (f.nouveau !== f.confirmation) return setErr("La confirmation ne correspond pas au nouveau mot de passe.");
    setEnvoi(true);
    try {
      const r = await call("POST", "/mot-de-passe/", { ancien: f.ancien, nouveau: f.nouveau });
      localStorage.setItem("token", r.token); setF(vide);
      say("✅ Mot de passe modifié. Vos autres appareils devront se reconnecter.");
    } catch (e) { setErr(e.status === 400 ? "⚠️ " + (e.detail || "Vérifiez les informations saisies.") : msg(e)); }
    finally { setEnvoi(false); }
  };
  return (<form className="card param-section" onSubmit={changer}>
    <h2>Mot de passe</h2>
    <p className="param-aide">Remplacez le mot de passe temporaire remis par l'administrateur. 8 caractères minimum, pas uniquement des chiffres. L'opération nécessite une connexion Internet.</p>
    <div className="param-grille">
      <div><label htmlFor="mdp-ancien">Mot de passe actuel</label>
        <input id="mdp-ancien" type="password" autoComplete="current-password" required value={f.ancien} onChange={set("ancien")} /></div>
      <div><label htmlFor="mdp-nouveau">Nouveau mot de passe</label>
        <input id="mdp-nouveau" type="password" autoComplete="new-password" required minLength={8} value={f.nouveau} onChange={set("nouveau")} /></div>
      <div><label htmlFor="mdp-confirmation">Confirmer le nouveau mot de passe</label>
        <input id="mdp-confirmation" type="password" autoComplete="new-password" required value={f.confirmation} onChange={set("confirmation")} aria-invalid={differents || undefined} />
        {differents && <p className="err">Les deux saisies ne correspondent pas.</p>}</div>
    </div>
    {err && <p className="err" role="alert">{err}</p>}
    <button className="btn" disabled={envoi || differents}>{envoi ? "Modification…" : "Changer le mot de passe"}</button>
  </form>);
}

export function Parametres({ onLogout }) {
  const say = useContext(Say), [cfg, recharger] = useGet("/parametres/"), [c, setC] = useState(null);
  // Texte brut du barème tel que tapé : le relire à chaque frappe effaçait le point décimal (« 0. » -> 0)
  // et les lignes vides (impossible d'ajouter une règle avec Entrée). null = afficher la configuration.
  const [seuilsBruts, setSeuilsBruts] = useState(null);
  useEffect(() => { if (cfg) { setC(cfg); setSeuilsBruts(null); } }, [cfg]);
  if (!c) return <Wait />;
  const modifie = JSON.stringify(c) !== JSON.stringify(cfg); // affiche l'état « modifications non enregistrées »
  // set(clé, valeur) : met à jour la copie locale de la configuration (appelée avec deux arguments).
  const set = (k, v) => setC({ ...c, [k]: v });
  const liste = (k, l, aide) => (<div>
    <label htmlFor={"p-" + k}>{l}</label>
    <p className="param-aide">{aide}</p>
    <textarea id={"p-" + k} value={c[k].join("\n")} onChange={(e) => set(k, e.target.value.split("\n"))} />
  </div>);
  const seuils = seuilsBruts ?? c.appreciations.map((a) => `${a.min}|${a.texte}`).join("\n");
  const lireSeuils = (texte) => texte.split("\n").filter((l) => l.trim()).map((l) => { const [m, ...t] = l.split("|"); return { min: parseFloat(String(m).replace(",", ".")) || 0, texte: t.join("|").trim() }; });
  const changerSeuils = (texte) => { setSeuilsBruts(texte); set("appreciations", lireSeuils(texte)); };
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
      <h2>Appréciations automatiques</h2>
      <p className="param-aide">Barème appliqué <strong>automatiquement</strong> à la moyenne de la période : l'application remplit l'appréciation de chaque élève, vous n'avez rien à saisir. Une règle par ligne, au format <code>seuil|texte</code>, le seuil étant une fraction de la base (ex. <code>0.5|Résultats satisfaisants</code>) ; c'est le seuil le plus élevé atteint qui est retenu. Un texte que vous validez pour un élève prévaut toujours sur ce barème.</p>
      <textarea id="p-appreciations" value={seuils} onChange={(e) => changerSeuils(e.target.value)} />
    </section>

    <MotDePasse />

    <section className="card param-section zone-danger">
      <h2>Compte et session</h2>
      <p className="param-aide">Vos données restent sur le serveur ; se déconnecter retire seulement l'accès de cet appareil{enAttente ? ` (${enAttente} modification(s) en attente y resteront enregistrées jusqu'à votre prochaine connexion)` : ""}.</p>
      <button className="btn danger" onClick={() => { if (confirmer("Se déconnecter de cet appareil ?")) onLogout(); }}>Se déconnecter</button>
    </section>

    <div className="barre-actions">
      <button className="btn" disabled={!modifie} onClick={enregistrer}>Enregistrer les paramètres</button>
      <button className="btn sec" disabled={!modifie} onClick={() => { setC(cfg); setSeuilsBruts(null); }}>Annuler les modifications</button>
      {modifie ? <span className="etat-modif" role="status">● Modifications non enregistrées</span> : <span className="muted" role="status">À jour</span>}
    </div>
  </>);
}
