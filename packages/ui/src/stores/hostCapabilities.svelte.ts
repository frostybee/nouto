/**
 * Capabilities of the host embedding this webview. All flags default to off;
 * a host entry point opts in to what it actually implements — the VS Code
 * request-panel bootstrap enables spec editing, the Tauri desktop app (which
 * has no OpenAPI editor) never does, so gated actions simply don't render
 * there instead of posting messages the bus would drop.
 */
export const hostCapabilities = $state({
  /** Host can insert an inferred schema into an open OpenAPI document. */
  canEditOpenApiSpec: false,
});

export function setCanEditOpenApiSpec(value: boolean) {
  hostCapabilities.canEditOpenApiSpec = value;
}
