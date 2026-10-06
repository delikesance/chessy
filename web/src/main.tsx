import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initTheme } from "./theme";
import "./styles/tokens.css";
import "./styles/base.css";
import "./ui/shell.css";
import "./ui/skill.css";
import "./styles/color.css";

initTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
