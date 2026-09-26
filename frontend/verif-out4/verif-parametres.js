import { jsxs, Fragment, jsx } from "react/jsx-runtime";
import { JSDOM } from "jsdom";
const dom = new JSDOM(`<!doctype html><html><body><div id="racine"></div></body></html>`, { url: "http://localhost:5173/" });
const poser = (nom, valeur) => Object.defineProperty(globalThis, nom, { value: valeur, configurable: true, writable: true });
poser("window", dom.window);
poser("document", dom.window.document);
poser("navigator", dom.window.navigator);
poser("HTMLElement", dom.window.HTMLElement);
poser("HTMLInputElement", dom.window.HTMLInputElement);
poser("HTMLTextAreaElement", dom.window.HTMLTextAreaElement);
poser("Event", dom.window.Event);
poser("localStorage", dom.window.localStorage);
poser("CustomEvent", dom.window.CustomEvent);
poser("addEventListener", dom.window.addEventListener.bind(dom.window));
poser("removeEventListener", dom.window.removeEventListener.bind(dom.window));
poser("dispatchEvent", dom.window.dispatchEvent.bind(dom.window));
let config = {
  matieres: ["Français"],
  types: ["Devoir"],
  periodes: ["1er trimestre"],
  canevas: ["Objectifs"],
  classement: true,
  base_moyenne: 20,
  appreciations: [{ min: 0, texte: "ok" }],
  modele_bulletin: "Modèle provisoire",
  annee_scolaire: "2025/2026"
};
const requetes = [];
globalThis.fetch = async (url, opts = {}) => {
  const methode = (opts.method || "GET").toUpperCase(), corps = opts.body ? JSON.parse(opts.body) : null;
  requetes.push(methode + " " + String(url).replace("http://localhost:8000/api", ""));
  if (methode === "PUT") config = corps;
  return { ok: true, status: 200, json: async () => corps ?? config };
};
localStorage.setItem("token", "jeton");
localStorage.setItem("user", "test");
const attente = (ms = 60) => new Promise((r) => setTimeout(r, ms));
async function test() {
  var _a, _b, _c, _d, _e, _f, _g, _h;
  const React = await import("react");
  const { Parametres } = await import("./assets/pages-DOgj5f_h.js");
  const { createRoot } = await import("react-dom/client");
  const rapport = [];
  const saisir = (el2, val) => {
    Object.getOwnPropertyDescriptor(el2.constructor.prototype, "value").set.call(el2, val);
    el2.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  };
  const boite = document.createElement("div");
  document.body.appendChild(boite);
  const Essai = () => {
    const [v, setV] = React.useState("depart");
    return React.createElement("input", { id: "essai", value: v, onChange: (e) => setV(e.target.value) });
  };
  createRoot(boite).render(React.createElement(Essai));
  await attente(40);
  saisir(document.getElementById("essai"), "modifie");
  await attente(20);
  rapport.push("0) TEMOIN champ minimal apres saisie : " + JSON.stringify(document.getElementById("essai").value));
  const racine = document.getElementById("racine");
  const Essai2 = () => {
    const [v, setV] = React.useState("depart2");
    return React.createElement("input", { id: "essai2", value: v, onChange: (e) => setV(e.target.value) });
  };
  const props = (n) => {
    const k = Object.keys(n).find((x) => x.startsWith("__reactProps"));
    const p = k ? n[k] : null;
    return p ? Object.keys(p).join(",") + " | onChange: " + typeof p.onChange : "(aucun)";
  };
  createRoot(racine).render(/* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(Essai2, {}),
    /* @__PURE__ */ jsx(Parametres, { onLogout: () => {
    } })
  ] }));
  await attente();
  rapport.push("P12) props React témoin (même racine) : " + props(document.getElementById("essai2")));
  rapport.push("P13) props React champ paramètres     : " + props(document.getElementById("p-annee_scolaire")));
  saisir(document.getElementById("essai2"), "modifie2");
  await attente(20);
  rapport.push("P14) témoin dans la même racine       : " + JSON.stringify(document.getElementById("essai2").value));
  const champ = () => document.getElementById("p-annee_scolaire");
  const etat = () => (racine.querySelector('[role="status"]') || {}).textContent;
  const bouton = (t) => [...racine.querySelectorAll("button")].find((b2) => b2.textContent.includes(t));
  rapport.push("1) champ Annee scolaire au depart    : " + JSON.stringify((_a = champ()) == null ? void 0 : _a.value));
  const el = champ();
  rapport.push("P1) element                         : " + (el ? el.outerHTML.substring(0, 150) : "ABSENT"));
  rapport.push("P2) nombre d'elements #p-annee_...  : " + document.querySelectorAll("#p-annee_scolaire").length);
  rapport.push("P3) disabled / readOnly             : " + (el ? el.disabled + " / " + el.readOnly : "-"));
  rapport.push("P4) type                            : " + (el ? el.type : "-"));
  rapport.push("P5) dans #racine ?                  : " + (el && el.closest("#racine") ? "oui" : "NON"));
  rapport.push("P6) onchange natif detecte ?         : " + (el && "onchange" in el ? "propriete presente" : "absente"));
  const cles = (n) => Object.keys(n).filter((k) => k.startsWith("__react")).join(" , ") || "(AUCUNE)";
  rapport.push("P8) cles internes React (témoin)     : " + cles(document.getElementById("essai")));
  rapport.push("P9) cles internes React (paramètres) : " + cles(el));
  rapport.push("P10) conteneur #racine React ?       : " + cles(document.getElementById("racine")));
  rapport.push("P11) conteneur boite React ?         : " + cles(boite));
  racine.addEventListener("input", (ev) => rapport.push("P7) 'input' recu par #racine depuis #" + ev.target.id + " (evenement propage)"));
  saisir(champ(), "2026/2027");
  rapport.push("2a) juste apres le dispatch          : " + JSON.stringify((_b = champ()) == null ? void 0 : _b.value));
  await attente(20);
  rapport.push("2b) apres un cycle React             : " + JSON.stringify((_c = champ()) == null ? void 0 : _c.value) + " | etat : " + etat());
  champ().focus();
  saisir(champ(), "2033/2034");
  await attente(20);
  rapport.push("2c) avec focus sur le champ          : " + JSON.stringify((_d = champ()) == null ? void 0 : _d.value) + " | etat : " + etat());
  saisir(champ(), "2044/2045");
  champ().dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  await attente(20);
  rapport.push("2d) avec un evenement 'change' natif  : " + JSON.stringify((_e = champ()) == null ? void 0 : _e.value) + " | etat : " + etat());
  const b = bouton("Enregistrer");
  rapport.push("3) bouton Enregistrer                : " + (b ? b.disabled ? "present mais DESACTIVE" : "actif" : "ABSENT"));
  if (b) {
    b.click();
    await attente(120);
  }
  rapport.push("4) requetes envoyees                 : " + requetes.join(" , "));
  rapport.push("5) apres enregistrement              : " + JSON.stringify((_f = champ()) == null ? void 0 : _f.value) + " | etat : " + etat());
  rapport.push("6) annee cote serveur                : " + JSON.stringify(config.annee_scolaire));
  rapport.push("7) file hors connexion               : " + (localStorage.getItem("q") || "vide"));
  localStorage.setItem("q", JSON.stringify([{ method: "PUT", path: "/classes/1/", body: {}, owner: "test", id: 1 }]));
  saisir(champ(), "2030/2031");
  await attente(20);
  rapport.push("8) saisie avec file non vide         : " + JSON.stringify((_g = champ()) == null ? void 0 : _g.value));
  if (b) {
    b.click();
    await attente(150);
  }
  rapport.push("9) apres enregistrement (file pleine): " + JSON.stringify((_h = champ()) == null ? void 0 : _h.value) + " | etat : " + etat());
  rapport.push("10) annee cote serveur               : " + JSON.stringify(config.annee_scolaire));
  rapport.push("11) requetes totales                 : " + requetes.join(" , "));
  console.log("\n===== RAPPORT =====\n" + rapport.join("\n") + "\n===================");
}
test();
