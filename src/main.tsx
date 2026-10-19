import React, { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

class AppBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="page-shell empty-state">
        <h1>Se nos ha escapado el balón.</h1>
        <p>
          No hemos podido mostrar esta página. Tus reservas siguen guardadas.
        </p>
        <button
          className="primary-button"
          onClick={() => window.location.reload()}
        >
          Volver a intentarlo
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppBoundary>
      <App />
    </AppBoundary>
  </React.StrictMode>,
);
