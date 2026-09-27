// Tests de la navigation (Node ≥ 22, sans dépendance) : `npm test`
// Scénario clé : sur un téléphone, la barre du bas ne garde que quelques destinations, AVEC leur nom sous
// l'icône, et aucune destination ne doit devenir inaccessible — les Paramètres passent dans le menu du haut.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const lire = (f) => readFileSync(fileURLToPath(new URL("./" + f, import.meta.url)), "utf8");
const app = lire("App.jsx");
const css = lire("styles.css");

// On exécute les listes réellement déclarées dans App.jsx (aucune copie de la logique à maintenir).
const decl = (nom) => app.match(new RegExp(`const ${nom} = [^;]+;`, "s"))?.[0] || "";
const nav = new Function(`${decl("NAV")}${decl("CHEMINS_BAS")}${decl("ONGLETS_BAS")}${decl("MENU_HAUT")}
  return { NAV, CHEMINS_BAS, ONGLETS_BAS, MENU_HAUT };`)();
const chemins = nav.NAV.map(([to]) => to);

test("la barre du bas garde les 4 destinations du quotidien, avec leur nom", () => {
  assert.equal(nav.ONGLETS_BAS.length, 4, "4 onglets attendus dans la barre du bas");
  for (const [, , , court] of nav.ONGLETS_BAS) assert.ok(court, "chaque onglet du bas affiche un nom sous son icône");
  assert.deepEqual(nav.ONGLETS_BAS.map(([to]) => to), ["/", "/preparation", "/classes", "/fiches"]);
});

test("la barre du haut propose 4 entrées, le profil ferme la barre (à droite)", () => {
  assert.equal(nav.MENU_HAUT.length, 4, "4 liens attendus dans le menu du haut (mobile)");
  assert.ok(nav.MENU_HAUT.some(([to]) => to === "/profil"), "le profil de l'enseignant doit être accessible");
  assert.ok(!nav.ONGLETS_BAS.some(([to]) => to === "/parametres"), "Paramètres ne doit plus être en bas");
  assert.equal(nav.MENU_HAUT.at(-1)[0], "/profil", "le profil est le dernier lien du menu du haut");
});

test("aucune destination n'est perdue : barre du bas + menu du haut = toutes les entrées", () => {
  assert.equal(nav.ONGLETS_BAS.length + nav.MENU_HAUT.length, nav.NAV.length);
  assert.equal(new Set(chemins).size, nav.NAV.length, "chemins uniques dans NAV (pas de doublon d'onglet)");
  for (const c of nav.CHEMINS_BAS) assert.ok(chemins.includes(c), `chemin « ${c} » absent de NAV : l'onglet ne s'afficherait pas`);
  for (const [, , , court] of nav.MENU_HAUT) assert.ok(court, "chaque lien du menu du haut affiche un nom");
});

test("les deux barres ont le même alignement (entrées réparties sur toute la largeur)", () => {
  assert.match(css, /\.barre-haut a,\.onglets-bas a\{flex:1/, "une seule règle pour les deux barres : entrées étirées");
  assert.match(css, /\.barre-haut a svg,\.onglets-bas a svg\{width:22px;height:22px/, "icônes de même taille des deux côtés");
  assert.doesNotMatch(app, /barre-haut-marque/, "plus de zone vide : la marque n'occupe plus la barre du haut");
  assert.doesNotMatch(css, /barre-haut-marque/, "règle CSS devenue inutile supprimée");
});

test("les deux barres existent en mobile seulement, et jamais à l'impression", () => {
  assert.match(app, /className="barre-haut"/);
  assert.match(app, /className="onglets-bas"/);
  assert.match(app, /className="avatar-mini"/, "la photo de profil remplace l'icône dans la barre du haut");
  assert.match(css, /\.barre-haut,\.onglets-bas\{display:none\}/, "masquées sur ordinateur (barre latérale suffisante)");
  assert.match(css, /@media\(max-width:800px\)\{[\s\S]*?\.side\{display:none\}/, "barre latérale masquée en mobile");
  assert.match(css, /@media print\{\.side,\.barre-haut,\.onglets-bas/, "navigation absente des bulletins et fiches imprimés");
});
