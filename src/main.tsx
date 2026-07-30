import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./app/router";
import "./styles/tokens.css";
import "./styles/global.css";
import "./styles/utilities.css";
import "./app/styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Application root was not found.");
}

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
