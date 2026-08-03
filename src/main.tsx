import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/index.css";
import "./styles/fonts.css";
import App from "./app/App";
import { initCurrency } from "./app/services/currencyStore";

const root = document.getElementById("root");
if (!root) throw new Error("No #root element found in index.html");

initCurrency();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
