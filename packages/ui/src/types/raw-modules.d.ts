/**
 * Vite's `?raw` suffix imports a file as a string. Renderer bundles are loaded
 * this way so they can be inlined into the sandboxed preview document instead
 * of entering the shared CSS/JS pipeline.
 */
declare module '*?raw' {
  const content: string;
  export default content;
}

// No published types for the CodeMirror rainbow-brackets extension.
declare module 'rainbowbrackets';
