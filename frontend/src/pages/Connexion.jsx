// Écran de connexion et demande de compte (accessibles sans compte).
import { useState } from "react";
import { call } from "../api";
import { DrapeauSenegal } from "../ui";
import { REGIONS, PIECES, msg, msgConnexion } from "./communs";

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
