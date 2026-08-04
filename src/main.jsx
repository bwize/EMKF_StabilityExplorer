import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { defineCustomElements } from "@esri/calcite-components/loader";

import "@esri/calcite-components/main.css";
import "@arcgis/core/assets/esri/themes/light/main.css";
import "./index.css";

import App from "./App.jsx";

// Registers every calcite-* custom element, each lazily code-split on first
// use — cheap to call once even though this app only uses a dozen of them.
defineCustomElements();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
