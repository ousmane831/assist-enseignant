import { defineConfig } from "vite"; import react from "@vitejs/plugin-react";
// Build de vérification : React est regroupé avec le composant (comme dans le vrai bundle du navigateur),
// pour éviter qu'une instance externe de react/react-dom ne fausse le test.
export default defineConfig({ plugins: [react()], build: { outDir: "verif-out5", emptyOutDir: true, minify: false, lib: { entry: "verif-parametres-app.jsx", formats: ["es"], fileName: () => "app.js" } } });
