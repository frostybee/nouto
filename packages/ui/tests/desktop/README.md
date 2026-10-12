# Desktop smoke checks

Scripts that drive the running desktop app through flows that unit tests cannot cover, such as a gRPC call from the URL bar to the Rust backend and back to the Timeline. They connect to the app's WebView2 over the Chrome DevTools Protocol, so the app must be started with remote debugging enabled.

## gRPC against the test server

`grpc-smoke.mjs` creates a quick gRPC request, loads the schema over reflection, and checks unary, server-streaming, client-streaming, and bidirectional calls: real trailers, status codes and messages, base64 `bytes` fields, Send and Commit on an open stream, Ctrl+Enter, and Cancel ending as `CANCELLED 1`.

1. Start the gRPC test server in its own terminal:

   ```bash
   cd test-servers/grpc-test && npm install && npm start
   ```

2. Start the desktop app with the debugging port open, in another terminal:

   ```bash
   WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333 pnpm run dev:desktop
   ```

   In PowerShell, set the variable first: `$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9333"`.

3. Run the script once the window shows "Ready":

   ```bash
   pnpm -F @nouto/ui run smoke:desktop-grpc
   ```

The script prints one `PASS` or `FAIL` line per check and exits non-zero when any fails. Screenshots of each step land in `output/`, which is git-ignored. `NOUTO_CDP_PORT` and `NOUTO_GRPC_ADDRESS` override the defaults of `9333` and `localhost:50051`.

The app runs against your real profile. Each run leaves a "New gRPC Call" tab open and records the calls in History and Drafts; delete them from those views when you are done.

## How the script interacts with the app

Clicks are dispatched in the DOM (`el.click()`) and waits poll on a timer. WebView2 throttles animation frames and ignores synthetic mouse input while its window is not in the foreground, which makes Playwright's normal click and its frame-based waits hang. Keyboard input goes through the debugging protocol and works regardless of focus.

Selectors are scoped with `:visible` because inactive tabs can keep their panel in the DOM.
