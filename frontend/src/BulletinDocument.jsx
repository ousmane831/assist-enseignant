// Rendu du bulletin/livret à partir des données VALIDÉES renvoyées par GET /classes/:id/bulletins/.
// Point d'extension : remplacer `exporterPdf` (impression navigateur) par un vrai générateur PDF
// (côté serveur ou bibliothèque) sans toucher au reste du module : le JSON `data` est le contrat.
export const exporterPdf = () => window.print();

export default function BulletinDocument({ data, type }) {
  return data.eleves.map((r) => (
    <div className="apercu" key={r.eleve}>
      <h2>{type} — {data.periode}</h2>
      <p className="pill">{data.modele}</p>
      <p><strong>{r.nom}</strong> – Classe : {data.classe.niveau} {data.classe.nom} – {data.classe.annee_scolaire}</p>
      <table><thead><tr><th>Matière</th><th>Évaluations</th><th>Moyenne</th></tr></thead><tbody>
        {Object.entries(r.matieres).map(([mat, moy]) => (
          <tr key={mat}><td>{mat}</td>
            <td>{(r.evaluations[mat] || []).map((e, i) => <div key={i}>{e.titre} : {e.note}/{e.note_max}{e.coefficient !== 1 && ` (coef. ${e.coefficient})`}</div>)}</td>
            <td>{moy ?? "—"}</td></tr>))}
      </tbody></table>
      <p>Moyenne (sur {data.base}) : <strong>{r.moyenne ?? "—"}</strong>{data.classement && r.rang ? ` – Rang : ${r.rang}` : ""}</p>
      <p>Appréciation : {r.appreciation || "—"}</p>
      <p style={{ marginTop: 40 }}>Signature de l'enseignant : ____________________</p>
    </div>));
}
