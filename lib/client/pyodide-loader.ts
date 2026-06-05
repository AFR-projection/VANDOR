"use client";

const PYODIDE_SRC = "https://cdn.jsdelivr.net/pyodide/v0.23.4/full/pyodide.js";

let loading: Promise<void> | null = null;

function hasLoadPyodide(): boolean {
  return (
    typeof (globalThis as { loadPyodide?: unknown }).loadPyodide === "function"
  );
}

/** Load Pyodide only when a code artifact runs Python (not on every chat page). */
export function ensurePyodideLoaded(): Promise<void> {
  if (hasLoadPyodide()) {
    return Promise.resolve();
  }

  if (loading) return loading;

  loading = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${PYODIDE_SRC}"]`);
    if (existing) {
      if (hasLoadPyodide()) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Pyodide gagal dimuat")),
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.src = PYODIDE_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Pyodide gagal dimuat"));
    document.head.appendChild(script);
  });

  return loading;
}
