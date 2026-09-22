import { Component, createContext, useCallback, useEffect, useState } from "react";
import { get } from "./api";
export const Say = createContext(() => {});
export function useGet(path) {
  const [d, setD] = useState(null);
  const load = useCallback(() => {
    if (path) get(path).then(setD).catch((e) => { setD(null); dispatchEvent(new CustomEvent("apierr", { detail: e.status })); });
  }, [path]);
  useEffect(load, [load]);
  return [d, load];
}
// Affiché tant que les données ne sont pas là : chargement, ou message clair en français si l'API a échoué.
export function Wait() {
  const [s, setS] = useState(null);
  useEffect(() => { const h = (e) => setS(e.detail); addEventListener("apierr", h); return () => removeEventListener("apierr", h); }, []);
  if (s === null) return <p>Chargement…</p>;
  const msg = s === 404 || s === 403 ? "Cette page n'existe plus ou n'est plus accessible." : s === 0 ? "Connexion interrompue. Ces données ne sont pas encore disponibles hors connexion." : "Impossible de charger ces données pour le moment.";
  return <div className="empty">{msg}<p><button className="btn sec" onClick={() => location.reload()}>Réessayer</button></p></div>;
}
export class ErrorBoundary extends Component {
  state = { e: false };
  static getDerivedStateFromError() { return { e: true }; }
  render() { return this.state.e ? <div className="empty">Une erreur est survenue sur cet écran. Vos données enregistrées sont conservées.<p><button className="btn" onClick={() => location.assign("/")}>Retour au tableau de bord</button></p></div> : this.props.children; }
}
export const Steps = ({ items, current }) => (
  <ol className="steps" aria-label="Étapes">{items.map((s, i) => <li key={s} className={i === current ? "on" : i < current ? "done" : ""}>{s}</li>)}</ol>);
export const Empty = ({ children }) => <div className="empty">{children}</div>;
export const confirmer = (msg = "Voulez-vous vraiment supprimer cet élément ?") => window.confirm(msg);
// Drapeau du Sénégal dessiné en SVG (vert – jaune – rouge, étoile verte) : aucune image à télécharger, donc visible même hors connexion.
// Les couleurs passent par l'attribut style (les attributs de présentation SVG ne savent pas lire var()).
export const DrapeauSenegal = ({ size = 96, className = "flag" }) => (
  <svg className={className} width={size} height={Math.round(size * 2 / 3)} viewBox="0 0 90 60" role="img" aria-label="Drapeau du Sénégal" focusable="false">
    <rect width="30" height="60" style={{ fill: "var(--sn-green)" }} /><rect x="30" width="30" height="60" style={{ fill: "var(--sn-yellow)" }} /><rect x="60" width="30" height="60" style={{ fill: "var(--sn-red)" }} />
    <path style={{ fill: "var(--sn-green)" }} d="M45 20l2.25 6.91h7.26l-5.88 4.27 2.25 6.91L45 33.82l-5.88 4.27 2.25-6.91-5.88-4.27h7.26z" />
  </svg>);
