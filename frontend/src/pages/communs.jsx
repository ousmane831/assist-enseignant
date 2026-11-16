// Listes de référence et utilitaires partagés par les écrans.
import { send } from "../api";
import { exporterPdf } from "../BulletinDocument";

export const NIVEAUX = ["CI", "CP", "CE1", "CE2", "CM1", "CM2"];
// Listes proposées dans le formulaire de demande de compte. Valeurs de référence à ajuster si besoin :
// les académies (IA) sont régionales ; le libellé de l'IEF reste libre (chaque département a la sienne).
export const REGIONS = ["Dakar", "Diourbel", "Fatick", "Kaffrine", "Kaolack", "Kédougou", "Kolda", "Louga", "Matam", "Saint-Louis", "Sédhiou", "Tambacounda", "Thiès", "Ziguinchor"];
export const PIECES = [["cni", "Carte nationale d'identité"], ["passeport", "Passeport"], ["carte_electeur", "Carte d'électeur"], ["carte_pro", "Carte professionnelle"], ["autre", "Autre pièce d'identité"]];
// Corps d'appartenance proposés dans le profil. Valeurs PROVISOIRES (mêmes choix que le modèle Profil, côté serveur),
// à ajuster avec les enseignants : aucune liste officielle n'est imposée par l'application.
export const CORPS = [["", "—"], ["instituteur", "Instituteur"], ["instituteur_adjoint", "Instituteur adjoint"],
  ["maitre", "Maître contractuel"], ["professeur_ecole", "Professeur d'école"], ["autre", "Autre"]];
// Étapes des deux parcours guidés : une seule définition, l'étape courante est calculée par chaque écran.
export const ETAPES_FICHE = ["Préparation", "Niveau", "Matière", "Leçon", "Fiche", "Exercices", "Aperçu"];
export const ETAPES_EVALUATION = ["Classe", "Évaluation", "Notes", "Résultats", "Appréciations", "Vérification", "Bulletin"];
export const dt = (d) => new Date(d).toLocaleDateString("fr-FR");
export const msg = (e) => e?.status === 0 ? "🟠 Cette action nécessite une connexion Internet." : e?.status === 404 ? "❌ Cette page n'existe plus ou n'est plus accessible." : e?.status === 400 || e?.status === 409 ? "⚠️ " + (e.detail || "Vérifiez les informations saisies.") : e?.status === 401 ? "Votre session a expiré." : e?.status === 429 ? "⏳ Trop de tentatives en peu de temps. Patientez une minute, puis réessayez." : "❌ Impossible d'enregistrer. Vos données locales sont conservées.";
// Écran de connexion : distinguer un vrai refus d'identifiants d'un problème technique.
// Sans cela, un serveur éteint, une origine bloquée par CORS ou une limitation de débit feraient
// croire à tort à un mot de passe faux (message trompeur).
export const safe = async (say, fn, ok) => { try { const r = await fn(); if (r?.queued) say("🟠 Enregistré sur cet appareil : sera synchronisé dès que la connexion sera disponible."); else if (ok) say(ok); return r; } catch (e) { say(msg(e)); } };
export const msgConnexion = (e) => e?.status === 400 || e?.status === 401 ? "❌ Identifiant ou mot de passe incorrect."
  : e?.status === 429 ? "⏳ Trop de tentatives en peu de temps. Patientez une minute, puis réessayez."
  : e?.status ? `❌ Connexion impossible (erreur ${e.status} du serveur). Réessayez dans un instant.`
  : `🟠 Serveur injoignable : vérifiez qu'il est démarré (port 8000) et ouvrez l'application sur http://localhost:5173 (adresse autorisée).`;
export const supprimer = async (say, path, reload) => { const r = await safe(say, () => send("DELETE", path)); if (r !== undefined && !r?.queued) reload(); }; // recharge seulement si le serveur a confirmé
export const Pdf = () => (<span className="noprint"><button className="btn sec" onClick={exporterPdf}>Télécharger PDF</button><button className="btn sec" onClick={exporterPdf}>Imprimer</button></span>);
