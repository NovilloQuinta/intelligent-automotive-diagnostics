import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error(
    'Root element #root not found in the DOM. Ensure index.html contains <div id="root"></div>.',
  );
}

const router = getRouter();
createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
