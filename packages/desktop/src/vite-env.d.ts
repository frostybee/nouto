/// <reference types="vite/client" />

declare module '*.css';

// No published types. Used by @nouto/ui's CodeMirror setup, which desktop
// compiles from source through the tsconfig path alias.
declare module 'rainbowbrackets';
