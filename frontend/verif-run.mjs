// Réducteur node : fournit un DOM (jsdom) puis exécute le scénario regroupé.
import { JSDOM } from "jsdom";
const dom = new JSDOM(`<!doctype html><html><body><div id="racine"></div></body></html>`, { url: "http://localhost:5173/" });
const poser = (nom, valeur) => Object.defineProperty(globalThis, nom, { value: valeur, configurable: true, writable: true });
poser("window", dom.window); poser("document", dom.window.document); poser("navigator", dom.window.navigator);
poser("HTMLElement", dom.window.HTMLElement); poser("HTMLInputElement", dom.window.HTMLInputElement);
poser("HTMLTextAreaElement", dom.window.HTMLTextAreaElement); poser("Event", dom.window.Event);
poser("localStorage", dom.window.localStorage); poser("CustomEvent", dom.window.CustomEvent);
poser("addEventListener", dom.window.addEventListener.bind(dom.window));
poser("removeEventListener", dom.window.removeEventListener.bind(dom.window));
poser("dispatchEvent", dom.window.dispatchEvent.bind(dom.window));
poser("getComputedStyle", dom.window.getComputedStyle.bind(dom.window));

const { lancer } = await import("./verif-out5/app.js");
console.log("\n===== RAPPORT (build groupé, comme le navigateur) =====\n" + (await lancer()) + "\n======================================================");
