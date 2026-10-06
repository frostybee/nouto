# README media harness

Records GIFs of the real VS Code request panel in Chromium. `harness.ts` mounts the production entry (`src/main.ts`) with a fake extension host (`fakeHost.ts`) and fixture data, and `gifs.spec.ts` drives it with Playwright. `recorder.ts` captures PNG frames over the Chrome DevTools screencast and encodes them with ffmpeg.

## Requirements

- Playwright's Chromium: `npx playwright install chromium` from `packages/ui` if it is missing.
- ffmpeg on `PATH`, or set `FFMPEG_PATH` to the executable.

## Capture your VS Code theme (one time)

The harness copies VS Code's theme variables from a dump, so recordings match your theme and fonts. Without a dump it uses Nouto's fallback colors and logs a warning.

1. In VS Code, open any Nouto request tab.
2. Run **Developer: Open Webview Developer Tools** from the Command Palette. The developer tools attach to the whole VS Code window. Each webview runs in a frame inside it: an `index.html` frame that hosts an inner `fake.html` frame with the extension's page.
3. Open the **Console** tab. Click the context dropdown at its top-left, which reads `top`, and choose a **`fake.html`** entry.
4. Run this snippet. It copies the theme to the clipboard and reports whether it found the request panel:

   ```js
   const d = document.getElementById('active-frame')?.contentDocument ?? document;
   const vars = Object.fromEntries([...d.documentElement.style]
     .filter((n) => n.startsWith('--vscode-'))
     .map((n) => [n, d.documentElement.style.getPropertyValue(n).trim()]));
   copy(JSON.stringify({
     bodyClass: d.body.className,
     dataset: { ...d.body.dataset },
     defaultStyles: d.getElementById('_defaultStyles')?.textContent ?? '',
     vars,
   }, null, 2));
   `${Object.keys(vars).length} theme variables copied (request panel found: ${!!d.querySelector('.url-input')})`;
   ```

5. Check the result. Expect a few hundred variables and `request panel found: true`. Otherwise you picked another webview (for example the Nouto sidebar): choose a different `fake.html` entry and run the snippet again. The snippet also works from an `index.html` entry.
6. Paste the clipboard into `tests/media/themes/vscode.json`.

## Record

From the repository root:

```bash
pnpm -F @nouto/ui run media:gifs
```

GIFs are written to `tests/media/output/` (ignored by git), one per test in `gifs.spec.ts`. Review a GIF there before copying it to `media/screenshots/`.

## Record in VS Code for the Web

`vscode-gifs.spec.ts` records in the full VS Code window instead of the harness, with VS Code's own theme and real requests. It drives VS Code served by `code serve-web`, where Nouto runs in the server's Node.js extension host. Everything lives under `D:\tmp\nouto-media\`, so your normal VS Code setup is untouched.

1. Create `D:\tmp\nouto-media\workspace\.vscode\settings.json`. These settings keep the window clean and make editor typing predictable:

   ```json title="D:\tmp\nouto-media\workspace\.vscode\settings.json"
   {
     "workbench.colorTheme": "Default Dark Modern",
     "workbench.startupEditor": "none",
     "workbench.tips.enabled": false,
     "workbench.secondarySideBar.defaultVisibility": "hidden",
     "chat.disableAIFeatures": true,
     "editor.minimap.enabled": false,
     "editor.stickyScroll.enabled": false,
     "[yaml]": {
       "editor.autoIndent": "keep",
       "editor.wordBasedSuggestions": "off"
     }
   }
   ```

2. Start the server in your own terminal and leave it running. The first start downloads the VS Code server and asks you to accept its license terms:

   ```bash
   code serve-web --host 127.0.0.1 --port 8000 --without-connection-token --disable-telemetry --cli-data-dir D:\tmp\nouto-media\cli --server-data-dir D:\tmp\nouto-media\server --default-folder D:\tmp\nouto-media\workspace
   ```

3. Build the extension (`pnpm run compile && pnpm run package:nouto-ext`) and install it with the downloaded server's CLI:

   ```bash
   D:\tmp\nouto-media\cli\serve-web\<commit>\bin\code-server.cmd --server-data-dir D:\tmp\nouto-media\server --extensions-dir D:\tmp\nouto-media\server\extensions --install-extension packages\vscode\nouto-<version>.vsix
   ```

4. Record from the repository root. To record one GIF, filter by its number:

   ```bash
   pnpm -F @nouto/ui run media:vscode-gifs
   pnpm -F @nouto/ui run media:vscode-gifs -g "#3"
   ```

The extension README shows these GIFs from `media/gifs/nouto-vscode/` at the repository root, loaded from GitHub's `main` branch. After re-recording one, copy it there under its README name (for example `output/vscode-environments.gif` to `environments.gif`) and push it.

Each test seeds Nouto's data before it opens a window (`state.ts`): the baseline collections and environments from `fixtures/nouto-state/`, empty Drafts and history, plus any collections, environments, or workspace files the GIF needs from `fixtures/workspace/`. The run then trusts the demo folder, marks onboarding as done, and closes leftover editors and notifications. The OpenAPI GIF also turns off OpenAPI linting in Nouto's settings, so lint squiggles don't cover the demo.

Playwright keeps its browser profile in `D:\tmp\nouto-media\browser`. Under serve-web, Nouto's settings and the workbench layout are stored in that profile too, so the preparation steps are quick after the first run. If a run fails, it saves `output/<name>.failure.png`. Override the server URL, browser profile, Nouto storage folder, or workspace folder with `NOUTO_MEDIA_VSCODE_URL`, `NOUTO_MEDIA_BROWSER_DIR`, `NOUTO_MEDIA_STORAGE_DIR`, and `NOUTO_MEDIA_WORKSPACE_DIR`.

## Add a GIF

1. If the GIF needs different data, add a scene to `scenes` in `harness.ts` and its fixture to `fixtures/`.
2. Add a test to `gifs.spec.ts`: load `harness.html?scene=<name>&cursor=1`, call `startRecording(page)`, drive the page with `click`, `moveTo`, `typeText`, and `pause`, then call `recording.stop('<name>')`.
3. Keep each GIF between 10 and 15 seconds; the recorder warns above 4 MB.

For a GIF in VS Code for the Web, add a test to `vscode-gifs.spec.ts` that calls `withVsCode('<name>', seed, async (page, sidebar) => { ... })`. Pass the data it needs as `seed` (see `SeedOptions` in `state.ts`), find Nouto's webviews with `frameWith`, and record with the same `recorder.ts` helpers.
