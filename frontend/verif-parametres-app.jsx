// Scénario de vérification (regroupé avec React par vite.verif.config.js) : monte le vrai composant
// Parametres dans le DOM fourni par jsdom, simule une saisie, puis l'enregistrement.
import { createElement, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Parametres } from "./src/pages";

// Variantes pour isoler la cause : même motif de code que Parametres, du plus simple au plus complet.
function V2() { // état initial venu d'une promesse, puis copie dans un second état
  const [cfg, setCfg] = useState(null), [c, setC] = useState(null);
  useEffect(() => { Promise.resolve({ v: "a" }).then(setCfg); }, []);
  useEffect(() => { if (cfg) setC(cfg); }, [cfg]);
  if (!c) return createElement("p", null, "charge");
  return createElement("input", { id: "v2", value: c.v, onChange: (e) => setC({ ...c, v: e.target.value }) });
}
function V3() { // idem + indirection set(k)(v)
  const [cfg, setCfg] = useState(null), [c, setC] = useState(null);
  useEffect(() => { Promise.resolve({ v: "a" }).then(setCfg); }, []);
  useEffect(() => { if (cfg) setC(cfg); }, [cfg]);
  if (!c) return createElement("p", null, "charge");
  const set = (k) => (v) => setC({ ...c, [k]: v });
  return createElement("input", { id: "v3", value: c.v, onChange: (e) => set("v", e.target.value) });
}
function V4() { // idem V3 + valeur « a || "" » + élément role=status
  const [cfg, setCfg] = useState(null), [c, setC] = useState(null);
  useEffect(() => { Promise.resolve({ v: "a" }).then(setCfg); }, []);
  useEffect(() => { if (cfg) setC(cfg); }, [cfg]);
  if (!c) return createElement("p", null, "charge");
  const set = (k) => (v) => setC({ ...c, [k]: v });
  const modifie = JSON.stringify(c) !== JSON.stringify(cfg);
  return createElement("div", null,
    createElement("input", { id: "v4", value: c.v || "", onChange: (e) => set("v", e.target.value) }),
    createElement("span", { role: "status" }, modifie ? "modifie" : "a jour"));
}

export async function lancer() {
  const rapport = [], journal = [];
  let config = { matieres: ["Français"], types: ["Devoir"], periodes: ["1er trimestre"], canevas: ["Objectifs"], classement: true,
    base_moyenne: 20, appreciations: [{ min: 0, texte: "ok" }], modele_bulletin: "Modèle", annee_scolaire: "2025/2026" };
  globalThis.fetch = async (url, opts = {}) => {
    const methode = (opts.method || "GET").toUpperCase(), corps = opts.body ? JSON.parse(opts.body) : null;
    journal.push(methode);
    if (methode === "PUT") config = corps;
    return { ok: true, status: 200, json: async () => (corps ?? config) };
  };
  globalThis.localStorage.setItem("token", "jeton");
  globalThis.localStorage.setItem("user", "test");
  const attente = (ms = 40) => new Promise((r) => setTimeout(r, ms));
  const saisir = (el, v) => {
    Object.getOwnPropertyDescriptor(el.constructor.prototype, "value").set.call(el, v);
    el.dispatchEvent(new el.ownerDocument.defaultView.Event("input", { bubbles: true }));
  };
  const racine = document.getElementById("racine");
  createRoot(racine).render(createElement("div", null, createElement(V2), createElement(V3), createElement(V4), createElement(Parametres, { onLogout: () => {} })));
  await attente(80);
  // Bisection : mêmes événements sur les variantes
  for (const id of ["v2", "v3", "v4"]) {
    const e2 = document.getElementById(id);
    if (!e2) { rapport.push("variante " + id + " : ABSENTE"); continue; }
    saisir(e2, "Z");
    await attente(40);
    rapport.push("variante " + id + " apres saisie : " + JSON.stringify(e2.value));
  }
  const champ = () => document.getElementById("p-annee_scolaire");
  const etat = () => (racine.querySelector('[role="status"]') || {}).textContent;
  const dep = () => journal.join(" , ");
  rapport.push("1) au depart            : " + JSON.stringify(champ()?.value));
  saisir(champ(), "2026/2027");
  await attente(60);
  rapport.push("2) apres saisie         : " + JSON.stringify(champ()?.value) + " | etat : " + etat());
  const b = [...racine.querySelectorAll("button")].find((x) => x.textContent.includes("Enregistrer"));
  rapport.push("3) bouton Enregistrer   : " + (b ? (b.disabled ? "DESACTIVE" : "actif") : "ABSENT"));
  if (b) { b.click(); await attente(150); }
  rapport.push("4) requetes             : " + dep());
  rapport.push("5) apres enregistrement : " + JSON.stringify(champ()?.value) + " | etat : " + etat() + " | serveur : " + JSON.stringify(config.annee_scolaire));
  // Second scénario : une écriture est déjà en attente dans la file hors connexion.
  globalThis.localStorage.setItem("q", JSON.stringify([{ method: "PUT", path: "/classes/1/", body: {}, owner: "test", id: 1 }]));
  saisir(champ(), "2030/2031");
  await attente(60);
  rapport.push("6) saisie (file non vide) : " + JSON.stringify(champ()?.value) + " | etat : " + etat());
  const b2 = [...racine.querySelectorAll("button")].find((x) => x.textContent.includes("Enregistrer"));
  if (b2) { b2.click(); await attente(200); }
  rapport.push("7) apres enregistrement  : " + JSON.stringify(champ()?.value) + " | etat : " + etat() + " | serveur : " + JSON.stringify(config.annee_scolaire));
  return rapport.join("\n");
}
