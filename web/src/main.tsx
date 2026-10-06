import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/tokens.css";
import "./styles/base.css";
import "./ui/shell.css";
import "./ui/skill.css";

async function boot() {
  // Serveur simulé (fixtures) : `?mock=1`, développement uniquement. Le bloc disparaît du bundle de production.
  if (import.meta.env.DEV && new URLSearchParams(location.search).has("mock")) {
    (await import("./dev/mock")).installMock();
  }
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
