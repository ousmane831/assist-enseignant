import { defineConfig } from "vite"; import react from "@vitejs/plugin-react";
// Port fixe : l'API n'autorise que http://localhost:5173 (CORS). Sans strictPort, Vite basculerait
// silencieusement sur 5174 et toute l'application semblerait cassée (connexion impossible).
export default defineConfig({ plugins: [react()], server: { port: 5173, strictPort: true } });
