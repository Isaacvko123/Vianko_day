import React from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { queryClient } from "./lib/queryClient";
import "./styles.css";
import "./product.css";
import "./day.css";
import "./responsive.css";
import "./pwa.css";
import { startPwa } from './lib/pwa';

startPwa();

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("No se encontro el contenedor root.");
}

createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
