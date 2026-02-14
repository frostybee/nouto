const REQUEST_KIND = {
  HTTP: "http",
  GRAPHQL: "graphql",
  WEBSOCKET: "websocket",
  SSE: "sse"
};
function isFolder(item) {
  return item.type === "folder";
}
function isRequest(item) {
  return !isFolder(item);
}
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
function createCollection(name) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return {
    id: generateId(),
    name,
    items: [],
    expanded: true,
    createdAt: now,
    updatedAt: now
  };
}
function createFolder(name) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return {
    type: "folder",
    id: generateId(),
    name,
    children: [],
    expanded: true,
    createdAt: now,
    updatedAt: now
  };
}
export {
  REQUEST_KIND as R,
  isRequest as a,
  createFolder as b,
  createCollection as c,
  generateId as g,
  isFolder as i
};
//# sourceMappingURL=types-yqghzbIO.js.map
