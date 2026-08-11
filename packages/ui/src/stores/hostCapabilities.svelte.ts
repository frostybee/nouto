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
  /** Host opens subtree/embedded-JSON documents in the same view (stack + Back)
   *  rather than a new editor tab. Only the Tauri desktop sets this. */
  jsonExplorerOpensInPlace: false,
});

export function setCanEditOpenApiSpec(value: boolean) {
  hostCapabilities.canEditOpenApiSpec = value;
}

export function setJsonExplorerOpensInPlace(value: boolean) {
  hostCapabilities.jsonExplorerOpensInPlace = value;
}
