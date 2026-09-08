---
title: Manual Test Guide
description: Step-by-step walkthrough of every Nouto desktop app feature, designed for manual testers with no prior API client experience.
sidebar:
  order: 10
---

# Nouto Desktop App: Manual Test Guide

## Purpose

This document walks you through every feature of the Nouto desktop app, one step at a time. You do not need any prior experience with API clients or programming. Each scenario tells you exactly what to click, what to type, and what to expect. If something does not match the expected result, mark it as failed and file a GitHub issue.

## Prerequisites

- **Nouto desktop app** installed on your computer
- **Node.js** (version 18 or later) installed. Download it from https://nodejs.org
- **pnpm** package manager installed. After installing Node.js, open a terminal and run:
  ```bash
  npm install -g pnpm
  ```
  Verify it works by running `pnpm --version`. You should see a version number.
- **Internet connection** (some tests use public online APIs)

## What is an API?

An API (Application Programming Interface) is a way for programs to talk to each other over the internet. When you type a URL in a browser, you are making a request to a server. The server sends back a response (usually a web page). API clients like Nouto let you send these requests manually and inspect the responses in detail, which is useful for building and testing software.

## How to Log Your Results

Since you are reading this guide on a website, the checkboxes are not interactive. Use one of these methods to track your results:

1. **Spreadsheet template (recommended):** [Download the test results template](/test-results-template.csv) and open it in Google Sheets, Excel, or LibreOffice Calc. All 187 scenarios are already listed. Just fill in the **Result** column with `Pass` or `Fail` and add any observations in the **Notes** column.
2. **Print this page:** Print this guide (or save it as a PDF with `Ctrl+P`) and check off each scenario with a pen.
3. **Notepad:** Open a text file and write the scenario number and result for each test, e.g.:
   ```
   1.1 - Pass
   1.2 - Pass
   1.3 - Fail - Could not find About section
   ```

When you are done, share the completed spreadsheet or notes with the development team.

## Conventions

- **Steps** are numbered. Follow them in order.
- **Expected** describes what you should see after completing the steps.
- Each scenario ends with `- [ ] Pass`. Mark it as "Pass" or "Fail" in your tracking sheet.
- Text in `monospace` is something you type or click exactly as written.
- `>` means a menu path: "File > New" means click File, then click New.

## Starting the Test Servers

Some tests require local servers running on your computer. Open a terminal (Command Prompt, PowerShell, or Terminal) for each server. You can start them all at once before you begin, or start each one when you reach the relevant section.

**WebSocket Echo Server (needed for Section 16):**
```bash
cd test-servers/ws-echo-test
pnpm install
node server.js
```
You should see: `WebSocket echo server running on ws://localhost:4001`

**SSE Server (needed for Section 17):**
```bash
cd test-servers/sse-test
pnpm install
node server.js
```
You should see: `SSE test server running on http://localhost:4002`

**GraphQL Subscriptions Server (needed for Section 18):**
```bash
cd test-servers/gql-sub-test
pnpm install
node server.js
```
You should see the server running on port 4000.

**gRPC Server (needed for Section 19):**
```bash
cd test-servers/grpc-test
pnpm install
node server.js
```
You should see the server running on port 50051.

## When a Test Fails

If a scenario does not produce the expected result, follow these steps before moving on:

1. **Take a screenshot** of the current state of the app.
   - Windows: press `Win + Shift + S`, then select the area to capture. The screenshot is saved to your clipboard; paste it into a file or directly into the GitHub issue.
   - Mac: press `Cmd + Shift + 4`, then select the area. The screenshot is saved to your Desktop.

2. **Open the Developer Tools** to check for errors.
   - Press `Ctrl + Shift + I` (Windows) or `Cmd + Option + I` (Mac) to open the DevTools panel.
   - Click the **Console** tab.
   - Look for red error messages. If you see any, take a screenshot of the console too.
   - You do not need to understand the errors. Just capture them for the bug report.

3. **Copy diagnostics** from the app.
   - Go to Settings > Desktop > **Copy Diagnostics**. This copies system info to your clipboard.
   - Paste it into your bug report.

4. **Note what happened** in your own words: what you saw, what was missing, or what looked wrong.

5. **File a GitHub issue** (see below), then continue testing. Do not stop at the first failure.

## Reporting Issues

If any scenario fails, or you notice something unexpected (a crash, confusing behavior, or a visual glitch), please create a GitHub issue.

**Where to file:** https://github.com/frostybee/nouto/issues

**Use this template:**

> **Title:** Short description (e.g., "WebSocket: echo message not received")
>
> **Section & Scenario:** Section 16, Scenario 16.3
>
> **Steps to reproduce:**
> 1. (Copy the steps from this guide)
> 2. (Note any deviations from the guide)
>
> **Expected result:** (What this guide said should happen)
>
> **Actual result:** (What actually happened)
>
> **Screenshots:** Attach screenshots of the app and, if applicable, the DevTools console.
>
> **Console errors:** (Paste any red error messages from DevTools > Console, or write "None" if the console was clean)
>
> **Diagnostics:** (Paste the output from Settings > Desktop > Copy Diagnostics)
>
> **Environment:**
> - OS: (e.g., Windows 11, macOS 14)
> - App version: (from Settings > About)
>
> **Labels:** Use `bug` for broken functionality, `ux` for confusing or unintuitive behavior.

---

# Test Sections

---

## Section 1: First Launch and Orientation

> **What is a REST client?** A REST client is an application that lets you send HTTP requests to servers and inspect the responses. Think of it as a more powerful browser that shows you all the technical details of each request.

### 1.1 Launch the App

**Steps:**
1. Open the Nouto desktop app.

**Expected:** The app opens with a welcome screen or an empty workspace. You should see:
- A **toolbar** at the top with workspace, environment, and settings controls
- An **activity rail** on the far left (vertical strip of icons)
- A **sidebar** on the left with tabs (Collections, History, Trash)
- A **main panel** in the center (empty or showing a welcome screen)
- A **status bar** at the bottom

`- [ ] Pass`

### 1.2 Create a New Project

**Steps:**
1. Click the **workspace menu** (top-left area of the toolbar, or the folder icon).
2. Click **New Project**.
3. Choose a folder on your computer (e.g., create a folder called `nouto-test` on your Desktop).
4. Confirm creation.

**Expected:** The app creates a new project. The title bar or workspace area shows the project name. The sidebar should be empty (no collections yet).

`- [ ] Pass`

### 1.3 Check App Version

**Steps:**
1. Click the **gear icon** (Settings) in the activity rail or toolbar.
2. Navigate to **About**.

**Expected:** You see the app version number (e.g., `0.1.0`). Note this version for bug reports.

`- [ ] Pass`

### 1.4 Toggle the Sidebar

**Steps:**
1. Click the **sidebar toggle** button (usually a hamburger icon or panel icon in the toolbar).
2. Click it again to bring the sidebar back.

**Expected:** The sidebar hides and shows. The main panel expands to fill the space when the sidebar is hidden.

`- [ ] Pass`

### 1.5 Resize Panels

**Steps:**
1. Hover your mouse over the border between the sidebar and the main panel. The cursor should change to a resize cursor.
2. Click and drag left or right to resize.
3. If there is a request/response split in the main panel, try resizing that divider too.

**Expected:** Panels resize smoothly. Content adjusts to the new size.

`- [ ] Pass`

---

## Section 2: Basic HTTP Requests

> **What is an HTTP request?** When you visit a website, your browser sends an HTTP request to a server. The request has a "method" (like GET to fetch data, or POST to send data) and a URL (the address). The server sends back a response with a status code (like 200 for success) and data.

### 2.1 Send a GET Request

**Steps:**
1. Click the **New Request** button (or press `Ctrl+N`).
2. Make sure the method dropdown says **GET**.
3. In the URL bar, type: `https://jsonplaceholder.typicode.com/posts/1`
4. Click **Send** (or press `Ctrl+Enter`).

**Expected:** The response panel appears with:
- Status: **200 OK** (shown in green)
- Body containing JSON with fields like `userId`, `id`, `title`, and `body`
- Duration in milliseconds
- Size information

`- [ ] Pass`

### 2.2 Send a POST Request with JSON Body

**Steps:**
1. Open a new request tab.
2. Change the method dropdown to **POST**.
3. In the URL bar, type: `https://jsonplaceholder.typicode.com/posts`
4. Click the **Body** tab in the request panel.
5. Select **JSON** as the body type.
6. In the body editor, type:
   ```json
   {
     "title": "Test Post",
     "body": "This is a test",
     "userId": 1
   }
   ```
7. Click **Send**.

**Expected:** Status: **201 Created**. The response body contains the data you sent, plus an `id` field (e.g., `101`).

`- [ ] Pass`

### 2.3 Send a PUT Request

**Steps:**
1. Open a new request tab.
2. Change the method to **PUT**.
3. URL: `https://jsonplaceholder.typicode.com/posts/1`
4. Click the **Body** tab, select **JSON**, and type:
   ```json
   {
     "id": 1,
     "title": "Updated Title",
     "body": "Updated content",
     "userId": 1
   }
   ```
5. Click **Send**.

**Expected:** Status: **200 OK**. The response body shows the updated data.

`- [ ] Pass`

### 2.4 Send a PATCH Request

**Steps:**
1. Open a new request tab.
2. Change the method to **PATCH**.
3. URL: `https://jsonplaceholder.typicode.com/posts/1`
4. Body tab > JSON:
   ```json
   {
     "title": "Patched Title"
   }
   ```
5. Click **Send**.

**Expected:** Status: **200 OK**. The response body shows the post with `title` changed to `"Patched Title"` and other fields unchanged.

`- [ ] Pass`

### 2.5 Send a DELETE Request

**Steps:**
1. Open a new request tab.
2. Change the method to **DELETE**.
3. URL: `https://jsonplaceholder.typicode.com/posts/1`
4. Click **Send**.

**Expected:** Status: **200 OK**. The response body is an empty object `{}`.

`- [ ] Pass`

### 2.6 Send a HEAD Request

**Steps:**
1. Open a new request tab.
2. Change the method to **HEAD**.
3. URL: `https://jsonplaceholder.typicode.com/posts/1`
4. Click **Send**.

**Expected:** Status: **200 OK**. The response body is empty (HEAD requests only return headers, no body). Response headers should still be visible in the Headers tab.

`- [ ] Pass`

### 2.7 Send an OPTIONS Request

**Steps:**
1. Open a new request tab.
2. Change the method to **OPTIONS**.
3. URL: `https://httpbin.org/get`
4. Click **Send**.

**Expected:** Status: **200 OK**. The response includes CORS-related headers like `Access-Control-Allow-Methods`.

`- [ ] Pass`

### 2.8 Request with Query Parameters

**Steps:**
1. Open a new request tab.
2. Method: **GET**.
3. URL: `https://httpbin.org/get`
4. Click the **Query** tab (or Params tab) in the request panel.
5. Add a parameter: Key = `name`, Value = `Alice`
6. Add another parameter: Key = `age`, Value = `30`
7. Click **Send**.

**Expected:** Status: **200 OK**. In the response body, you should see an `args` object containing `"name": "Alice"` and `"age": "30"`. The URL bar should update to show `?name=Alice&age=30`.

`- [ ] Pass`

### 2.9 Request with Custom Headers

**Steps:**
1. Open a new request tab.
2. Method: **GET**.
3. URL: `https://httpbin.org/headers`
4. Click the **Headers** tab in the request panel.
5. Add a header: Key = `X-Custom-Header`, Value = `HelloWorld`
6. Add another header: Key = `X-Test-Id`, Value = `12345`
7. Click **Send**.

**Expected:** Status: **200 OK**. The response body shows a `headers` object that includes `"X-Custom-Header": "HelloWorld"` and `"X-Test-Id": "12345"`.

`- [ ] Pass`

### 2.10 Cancel a Long-Running Request

**Steps:**
1. Open a new request tab.
2. Method: **GET**.
3. URL: `https://httpbin.org/delay/10` (this endpoint waits 10 seconds before responding).
4. Click **Send**.
5. Immediately click the **Cancel** button (it replaces the Send button while a request is in progress).

**Expected:** The request is cancelled. You should see a cancellation message or error instead of a response. The duration should be much less than 10 seconds.

`- [ ] Pass`

### 2.11 Send with Keyboard Shortcut

**Steps:**
1. Open a new request tab.
2. Method: **GET**.
3. URL: `https://httpbin.org/get`
4. Press `Ctrl+Enter` (instead of clicking Send).

**Expected:** The request is sent and you receive a **200 OK** response, same as clicking the Send button.

`- [ ] Pass`

---

## Section 3: Request Body Types

> **What is a request body?** When you send data to a server (like submitting a form), the data goes in the request body. Different formats exist for different purposes: JSON is the most common for APIs, Form Data is used for file uploads, and URL-encoded is what browsers use for HTML forms.

### 3.1 JSON Body

**Steps:**
1. Open a new request tab. Method: **POST**. URL: `https://httpbin.org/post`
2. Body tab > select **JSON**.
3. Type:
   ```json
   { "message": "Hello JSON" }
   ```
4. Click **Send**.

**Expected:** Status: **200 OK**. The response `json` field contains `{ "message": "Hello JSON" }`. The `headers` section shows `Content-Type` as `application/json`.

`- [ ] Pass`

### 3.2 Text Body

**Steps:**
1. Open a new request tab. Method: **POST**. URL: `https://httpbin.org/post`
2. Body tab > select **Text**.
3. Type: `Hello, this is plain text`
4. Click **Send**.

**Expected:** Status: **200 OK**. The response `data` field contains `"Hello, this is plain text"`. The `Content-Type` header should be `text/plain`.

`- [ ] Pass`

### 3.3 XML Body

**Steps:**
1. Open a new request tab. Method: **POST**. URL: `https://httpbin.org/post`
2. Body tab > select **XML**.
3. Type:
   ```xml
   <note>
     <to>Tester</to>
     <message>Hello XML</message>
   </note>
   ```
4. Click **Send**.

**Expected:** Status: **200 OK**. The response `data` field contains the XML text you typed.

`- [ ] Pass`

### 3.4 Form Data

**Steps:**
1. Open a new request tab. Method: **POST**. URL: `https://httpbin.org/post`
2. Body tab > select **Form Data** (multipart).
3. Add a field: Key = `username`, Value = `tester`
4. Add a field: Key = `color`, Value = `blue`
5. Click **Send**.

**Expected:** Status: **200 OK**. The response `form` field contains `"username": "tester"` and `"color": "blue"`.

`- [ ] Pass`

### 3.5 URL-Encoded Form

**Steps:**
1. Open a new request tab. Method: **POST**. URL: `https://httpbin.org/post`
2. Body tab > select **URL Encoded**.
3. Add a field: Key = `email`, Value = `test@example.com`
4. Add a field: Key = `password`, Value = `secret123`
5. Click **Send**.

**Expected:** Status: **200 OK**. The response `form` field contains `"email": "test@example.com"` and `"password": "secret123"`. The `Content-Type` header shows `application/x-www-form-urlencoded`.

`- [ ] Pass`

### 3.6 Binary File Upload

**Steps:**
1. Open a new request tab. Method: **POST**. URL: `https://httpbin.org/post`
2. Body tab > select **Binary**.
3. Click the file picker and choose any small file from your computer (e.g., a `.txt` or `.png` file).
4. Click **Send**.

**Expected:** Status: **200 OK**. The response should show information about the uploaded file in the `data` or `files` field.

`- [ ] Pass`

---

## Section 4: Response Viewer

> **What is the response viewer?** After you send a request, the server's response appears in the response panel. Nouto provides multiple tabs and views to inspect different parts of the response: the body (the actual data), headers (metadata), cookies, timing, and more.

### 4.1 Text View vs. Tree View

**Steps:**
1. Send a GET request to `https://jsonplaceholder.typicode.com/posts/1`.
2. In the response body, look for a toggle to switch between **Text** (raw text) and **Tree** (structured tree) views.
3. Switch to Tree view.
4. Switch back to Text view.

**Expected:** Text view shows the raw JSON as formatted text. Tree view shows an expandable/collapsible tree with each field as a node. Both display the same data in different formats.

`- [ ] Pass`

### 4.2 Pretty vs. Raw Toggle

**Steps:**
1. With the same response from 4.1 open, look for a **Pretty/Raw** toggle in the body tab.
2. Switch to Raw mode.
3. Switch back to Pretty mode.

**Expected:** Pretty mode shows the JSON nicely formatted with indentation. Raw mode shows the unformatted, compact JSON.

`- [ ] Pass`

### 4.3 JSONPath Filter

**Steps:**
1. Send a GET request to `https://jsonplaceholder.typicode.com/posts` (note: no `/1` at the end, so this returns a list).
2. In the response body area, look for a **JSONPath filter** input.
3. Type: `$[0].title`
4. Press Enter or apply.

**Expected:** The filtered result shows only the title of the first post, instead of the entire array.

`- [ ] Pass`

### 4.4 JSON Stats

**Steps:**
1. With a JSON response loaded (from step 4.1 or 4.3), look for a **JSON stats** button or panel.
2. Open it.

**Expected:** You see statistics about the JSON: number of keys, depth, or similar metrics.

`- [ ] Pass`

### 4.5 Response Headers Tab

**Steps:**
1. Send a GET request to `https://httpbin.org/get`.
2. Click the **Headers** tab in the response panel.

**Expected:** You see two sections: the request headers (what you sent) and the response headers (what the server returned). Response headers should include things like `Content-Type`, `Content-Length`, `Access-Control-Allow-Origin`.

`- [ ] Pass`

### 4.6 Cookies Tab

**Steps:**
1. Send a GET request to `https://httpbin.org/cookies/set/testcookie/testvalue`.
2. Click the **Cookies** tab in the response panel.

**Expected:** You see cookie information. The `Set-Cookie` header should be visible, showing `testcookie=testvalue`.

`- [ ] Pass`

### 4.7 Timing Breakdown

**Steps:**
1. Send a GET request to `https://httpbin.org/get`.
2. Click the **Timing** tab in the response panel.

**Expected:** A timing breakdown showing phases like DNS lookup, TCP connection, TLS handshake, time to first byte (TTFB), and download time. Each phase has a duration in milliseconds.

`- [ ] Pass`

### 4.8 Redirect Chain

**Steps:**
1. Send a GET request to `https://httpbin.org/redirect/3` (this redirects 3 times before responding).
2. Click the **Redirects** tab in the response panel (it may only appear when redirects occur).

**Expected:** Status: **200 OK** (the final response). The Redirects tab shows 3 redirect hops, each with its status code (302) and URL.

`- [ ] Pass`

### 4.9 Image Response

**Steps:**
1. Send a GET request to `https://httpbin.org/image/png`.
2. Look at the response body.

**Expected:** The response body area shows the PNG image rendered as a preview, rather than raw binary data.

`- [ ] Pass`

### 4.10 Download a Response

**Steps:**
1. Send a GET request to `https://jsonplaceholder.typicode.com/posts/1`.
2. Look for a **Download** button in the response panel.
3. Click it and save the file to your Desktop.

**Expected:** A `.json` file is saved to your Desktop containing the response body.

`- [ ] Pass`

### 4.11 Copy Response and Zoom

**Steps:**
1. With a JSON response loaded, try copying the response body (look for a copy button, or select all and `Ctrl+C`).
2. Look for zoom controls (zoom in/out buttons or `Ctrl+`/`Ctrl-`) in the response editor.
3. Zoom in, then zoom out.

**Expected:** The response body is copied to clipboard. Zoom controls increase/decrease the font size in the response editor.

`- [ ] Pass`

---

## Section 5: Collections and Organization

> **What is a collection?** A collection is a group of saved requests, organized into folders. Think of it like a folder on your computer that contains bookmarks. Collections let you save requests you use frequently so you do not have to re-type them.

### 5.1 Create a New Collection

**Steps:**
1. In the sidebar, look for a **New Collection** button or right-click in the Collections tab.
2. Create a new collection named `Test Collection`.

**Expected:** A new collection called `Test Collection` appears in the sidebar.

`- [ ] Pass`

### 5.2 Save a Request to the Collection

**Steps:**
1. Open a new request tab. Method: **GET**. URL: `https://jsonplaceholder.typicode.com/posts`
2. Click the **Save** button (or `Ctrl+S`).
3. Choose `Test Collection` as the destination.
4. Name the request `List All Posts`.
5. Confirm save.

**Expected:** The request `List All Posts` appears inside `Test Collection` in the sidebar. The tab title updates to show the saved name.

`- [ ] Pass`

### 5.3 Create Nested Folders

**Steps:**
1. Right-click on `Test Collection` in the sidebar.
2. Select **New Folder**.
3. Name it `Users`.
4. Right-click on the `Users` folder.
5. Select **New Folder**.
6. Name it `Admin`.

**Expected:** The sidebar shows: `Test Collection` > `Users` > `Admin`, a folder inside a folder inside a collection.

`- [ ] Pass`

### 5.4 Save Requests into Folders

**Steps:**
1. Open a new request. Method: **GET**. URL: `https://jsonplaceholder.typicode.com/users`
2. Save it to the `Users` folder as `List Users`.
3. Open another request. Method: **GET**. URL: `https://jsonplaceholder.typicode.com/users/1`
4. Save it to the `Admin` folder as `Get Admin User`.

**Expected:** Both requests appear in their respective folders in the sidebar.

`- [ ] Pass`

### 5.5 Drag and Drop

**Steps:**
1. Click and hold the `Get Admin User` request in the `Admin` folder.
2. Drag it up to the `Users` folder (not inside `Admin`).
3. Release.

**Expected:** The request moves from `Admin` to `Users`. `Admin` folder is now empty.

`- [ ] Pass`

### 5.6 Rename a Request and Collection

**Steps:**
1. Right-click on `List All Posts` in the sidebar.
2. Select **Rename**.
3. Change the name to `Get All Posts`.
4. Right-click on `Test Collection`.
5. Select **Rename** (or Edit).
6. Change the name to `My API Tests`.

**Expected:** Both items show their new names in the sidebar.

`- [ ] Pass`

### 5.7 Duplicate a Request

**Steps:**
1. Right-click on `Get All Posts`.
2. Select **Duplicate**.

**Expected:** A copy appears (e.g., `Get All Posts (Copy)` or similar) in the same location. Opening it shows the same URL and settings as the original.

`- [ ] Pass`

### 5.8 Pin a Request

**Steps:**
1. Right-click on `Get All Posts`.
2. Select **Pin** (or similar).

**Expected:** The request appears in a "Pinned" section at the top of the sidebar, making it easy to find.

`- [ ] Pass`

### 5.9 Search and Filter Collections

**Steps:**
1. Look for a search/filter input at the top of the Collections tab.
2. Type `User`.

**Expected:** The sidebar filters to show only items matching "User" (e.g., `List Users`, `Users` folder). Non-matching items are hidden.

`- [ ] Pass`

### 5.10 Sort Collections

**Steps:**
1. Look for a sort control in the Collections tab (might be a dropdown or sort icon).
2. Sort by **A-Z**.
3. Sort by **Method**.

**Expected:** The items reorder according to the selected sort option. A-Z sorts alphabetically. Method groups by HTTP method (DELETE, GET, PATCH, POST, PUT).

`- [ ] Pass`

### 5.11 Multi-Select and Move

**Steps:**
1. Hold `Ctrl` and click on `Get All Posts` and `List Users` to select both.
2. Right-click on the selection.
3. Choose **Move** (or drag both items to the `Admin` folder).

**Expected:** Both requests are moved to the `Admin` folder.

`- [ ] Pass`

### 5.12 Copy as cURL

**Steps:**
1. Right-click on any saved request (e.g., `Get All Posts`).
2. Select **Copy as cURL**.
3. Open a text editor and paste (`Ctrl+V`).

**Expected:** A cURL command is pasted, like `curl 'https://jsonplaceholder.typicode.com/posts'`. It should be a valid cURL command that matches the request's method, URL, headers, and body.

`- [ ] Pass`

---

## Section 6: Trash

> **What is Trash?** When you delete a request or folder, it goes to the Trash instead of being permanently removed. You can restore items from the Trash or permanently delete them.

### 6.1 Delete and View in Trash

**Steps:**
1. Right-click on the `Get All Posts (Copy)` request (the duplicate from 5.7).
2. Select **Delete**.
3. Click the **Trash** tab in the sidebar.

**Expected:** The deleted request appears in the Trash tab.

`- [ ] Pass`

### 6.2 Restore from Trash

**Steps:**
1. In the Trash tab, find the deleted request.
2. Click **Restore** (or right-click > Restore).

**Expected:** The request reappears in its original location in the Collections tab.

`- [ ] Pass`

### 6.3 Permanently Delete

**Steps:**
1. Delete the same request again (right-click > Delete in Collections).
2. Go to the Trash tab.
3. Permanently delete it (right-click > Delete permanently, or similar).

**Expected:** The request is gone from both Collections and Trash. It cannot be recovered.

`- [ ] Pass`

---

## Section 7: Environments and Variables

> **What are environments?** Environments let you define variables (like `base_url`) that you can reuse across requests. This is useful when you have multiple servers (development, staging, production) and want to switch between them without editing every request.

### 7.1 Create an Environment

**Steps:**
1. Click the **Environments** icon in the activity rail (or open the environments panel).
2. Click the **Environments** tab.
3. Click **Create Environment** (or the + button).
4. Name it `Development`.

**Expected:** A new environment called `Development` appears in the list.

`- [ ] Pass`

### 7.2 Add Variables

**Steps:**
1. Select the `Development` environment.
2. Add a variable: Name = `base_url`, Value = `https://jsonplaceholder.typicode.com`
3. Add another variable: Name = `post_id`, Value = `1`

**Expected:** Both variables appear in the environment's variable list.

`- [ ] Pass`

### 7.3 Set Active Environment

**Steps:**
1. Set `Development` as the **active environment** (click it, or use the environment selector dropdown in the toolbar).

**Expected:** The environment selector in the toolbar shows `Development`. The environment may be highlighted or marked as active in the environments panel.

`- [ ] Pass`

### 7.4 Use Variables in a Request

**Steps:**
1. Open a new request tab.
2. Method: **GET**.
3. URL: `{{base_url}}/posts/{{post_id}}`
4. Click **Send**.

**Expected:** The request is sent to `https://jsonplaceholder.typicode.com/posts/1`. Status: **200 OK**. The response shows the post with `id: 1`. The variables `{{base_url}}` and `{{post_id}}` are substituted with their values from the active environment.

`- [ ] Pass`

### 7.5 Create a Second Environment and Switch

**Steps:**
1. Create another environment called `Production`.
2. Add a variable: Name = `base_url`, Value = `https://httpbin.org`
3. Add a variable: Name = `post_id`, Value = `get`
4. Switch the active environment to `Production`.
5. Go back to the request from step 7.4 (with URL `{{base_url}}/posts/{{post_id}}`).
6. Click **Send**.

**Expected:** The request now goes to `https://httpbin.org/posts/get` instead. The response will be different (likely a 404, since httpbin does not have that path). The point is that the same request URL resolved to a different address because you switched environments.

`- [ ] Pass`

### 7.6 Global Variables

**Steps:**
1. Switch back to the `Development` environment.
2. In the environments panel, go to the **Global Variables** tab.
3. Add a variable: Name = `app_name`, Value = `Nouto`
4. Open a new request. Method: **GET**. URL: `https://httpbin.org/get`
5. Add a header: Key = `X-App-Name`, Value = `{{app_name}}`
6. Click **Send**.

**Expected:** In the response body `headers`, you see `"X-App-Name": "Nouto"`. Global variables are available regardless of which environment is active.

`- [ ] Pass`

### 7.7 Secret Variables

**Steps:**
1. In the `Development` environment, add a variable: Name = `api_key`, Value = `sk-12345-secret`
2. Mark it as **secret** (there should be a toggle, lock icon, or checkbox).

**Expected:** The variable value is masked (shown as dots or asterisks) in the environments panel. It is stored securely in the OS keychain. The actual value is still used when sending requests.

`- [ ] Pass`

### 7.8 Dynamic Variables

**Steps:**
1. Open a new request. Method: **POST**. URL: `https://httpbin.org/post`
2. Body tab > JSON:
   ```json
   {
     "requestId": "{{$uuid.v4}}",
     "timestamp": "{{$timestamp.iso}}",
     "random": "{{$random.int, 1, 100}}"
   }
   ```
3. Click **Send**.
4. Click **Send** again (a second time).

**Expected:** Status: **200 OK** both times. In the response `json` field:
- `requestId` is a UUID (like `a1b2c3d4-e5f6-...`), different each time
- `timestamp` is an ISO date string, different each time
- `random` is a number between 1 and 100, likely different each time

`- [ ] Pass`

### 7.9 Link a .env File

**Steps:**
1. Create a file called `test.env` on your computer with this content:
   ```
   DB_HOST=localhost
   DB_PORT=5432
   ```
2. In the environments panel, look for a **Link .env file** option.
3. Link the `test.env` file you just created.
4. Open a new request. Method: **GET**. URL: `https://httpbin.org/get`
5. Add a header: Key = `X-DB-Host`, Value = `{{DB_HOST}}`
6. Click **Send**.

**Expected:** In the response `headers`, you see `"X-Db-Host": "localhost"`. The variables from the `.env` file are available for use.

`- [ ] Pass`

---

## Section 8: Cookie Jar

> **What is a cookie jar?** Cookies are small pieces of data that servers store in your browser to remember things (like login sessions). A cookie jar in Nouto stores cookies received from servers. You can have multiple jars and switch between them.

### 8.1 Open Cookie Jar

**Steps:**
1. In the environments panel, click the **Cookie Jar** tab.

**Expected:** The cookie jar panel opens, showing a jar (possibly empty or with a default jar).

`- [ ] Pass`

### 8.2 Create a New Cookie Jar

**Steps:**
1. Click **Create Cookie Jar** (or the + button).
2. Name it `Test Jar`.

**Expected:** A new jar called `Test Jar` appears in the jar list.

`- [ ] Pass`

### 8.3 Send a Request That Sets Cookies

**Steps:**
1. Make sure the `Test Jar` (or the default jar) is active.
2. Open a new request. Method: **GET**.
3. URL: `https://httpbin.org/cookies/set/flavor/chocolate`
4. Click **Send**.
5. Go back to the Cookie Jar panel.

**Expected:** The cookie `flavor=chocolate` appears in the jar, under the domain `httpbin.org`.

`- [ ] Pass`

### 8.4 Delete a Cookie

**Steps:**
1. In the cookie jar, find the `flavor` cookie.
2. Delete it (click a delete button or right-click > Delete).

**Expected:** The cookie is removed from the jar.

`- [ ] Pass`

### 8.5 Clear the Cookie Jar

**Steps:**
1. First, send another cookie-setting request: GET `https://httpbin.org/cookies/set/color/red`
2. In the cookie jar panel, click **Clear** (clear all cookies).

**Expected:** All cookies in the jar are removed. The jar is empty.

`- [ ] Pass`

---

## Section 9: Authentication

> **What is authentication?** Authentication is how a server verifies who you are. There are many methods: Basic Auth (username + password), Bearer Token (a secret key), API Key (a code sent in a header or URL parameter), and more. Nouto supports all common auth methods.

### 9.1 Basic Authentication

**Steps:**
1. Open a new request. Method: **GET**.
2. URL: `https://httpbin.org/basic-auth/testuser/testpass`
3. Click the **Auth** tab in the request panel.
4. Select **Basic Auth**.
5. Username: `testuser`
6. Password: `testpass`
7. Click **Send**.

**Expected:** Status: **200 OK**. The response body shows `{ "authenticated": true, "user": "testuser" }`.

`- [ ] Pass`

### 9.2 Basic Auth with Wrong Credentials

**Steps:**
1. Same request as 9.1, but change the password to `wrongpass`.
2. Click **Send**.

**Expected:** Status: **401 Unauthorized**. The server rejects the request.

`- [ ] Pass`

### 9.3 Bearer Token

**Steps:**
1. Open a new request. Method: **GET**.
2. URL: `https://httpbin.org/bearer`
3. Auth tab > select **Bearer Token**.
4. Token: `my-secret-token-12345`
5. Click **Send**.

**Expected:** Status: **200 OK**. The response body shows `{ "authenticated": true, "token": "my-secret-token-12345" }`.

`- [ ] Pass`

### 9.4 API Key in Header

**Steps:**
1. Open a new request. Method: **GET**.
2. URL: `https://httpbin.org/headers`
3. Auth tab > select **API Key**.
4. Key: `X-API-Key`
5. Value: `abc123`
6. Location: **Header**
7. Click **Send**.

**Expected:** Status: **200 OK**. In the response `headers`, you see `"X-Api-Key": "abc123"`.

`- [ ] Pass`

### 9.5 API Key in Query Parameter

**Steps:**
1. Open a new request. Method: **GET**.
2. URL: `https://httpbin.org/get`
3. Auth tab > select **API Key**.
4. Key: `api_key`
5. Value: `xyz789`
6. Location: **Query Parameter**
7. Click **Send**.

**Expected:** Status: **200 OK**. In the response `args`, you see `"api_key": "xyz789"`. The URL in the response shows `?api_key=xyz789`.

`- [ ] Pass`

### 9.6 Auth Inheritance

**Steps:**
1. Right-click on `My API Tests` collection.
2. Open **Settings** (or Edit).
3. In the Auth section, set **Bearer Token** with value `collection-token`.
4. Save.
5. Open the `Get All Posts` request (inside this collection).
6. In the Auth tab, make sure it says **Inherit from parent** (or similar).
7. Click **Send** to `https://httpbin.org/headers` (change the URL temporarily).

**Expected:** The response headers show `"Authorization": "Bearer collection-token"`. The request inherited the auth from its parent collection.

`- [ ] Pass`

### 9.7 Override Inherited Auth

**Steps:**
1. In the same request from 9.6, change the Auth tab to **Basic Auth**.
2. Set username: `override`, password: `pass`.
3. Send to `https://httpbin.org/headers`.

**Expected:** The response headers show a `Basic` authorization header (base64-encoded `override:pass`) instead of the Bearer token. The request-level auth overrides the collection-level auth.

`- [ ] Pass`

### 9.8 Digest Authentication

**Steps:**
1. Open a new request. Method: **GET**.
2. URL: `https://httpbin.org/digest-auth/auth/user/passwd`
3. Auth tab > select **Digest Auth**.
4. Username: `user`
5. Password: `passwd`
6. Click **Send**.

**Expected:** Status: **200 OK**. The response body shows `{ "authenticated": true, "user": "user" }`.

`- [ ] Pass`

---

## Section 10: Request Settings

> **What are request settings?** Each request can have its own settings for things like timeouts (how long to wait for a response), redirect behavior, and SSL/TLS configuration.

### 10.1 Custom Timeout (Success)

**Steps:**
1. Open a new request. Method: **GET**.
2. URL: `https://httpbin.org/delay/3` (responds after 3 seconds).
3. Click the **Settings** tab in the request panel.
4. Set **Timeout** to `10000` (10 seconds).
5. Click **Send**.

**Expected:** After about 3 seconds, you get Status: **200 OK**. The request succeeded because the timeout (10s) was longer than the delay (3s).

`- [ ] Pass`

### 10.2 Custom Timeout (Failure)

**Steps:**
1. Open a new request. Method: **GET**.
2. URL: `https://httpbin.org/delay/10` (responds after 10 seconds).
3. Settings tab > set **Timeout** to `2000` (2 seconds).
4. Click **Send**.

**Expected:** After about 2 seconds, the request fails with a timeout error. You should see an error message indicating the request timed out.

`- [ ] Pass`

### 10.3 Disable Follow Redirects

**Steps:**
1. Open a new request. Method: **GET**.
2. URL: `https://httpbin.org/redirect/1` (redirects once).
3. Settings tab > set **Follow Redirects** to **off** (or uncheck it).
4. Click **Send**.

**Expected:** Status: **302 Found** (or 301/307/308). The app shows the redirect response itself, rather than following the redirect to the final destination. You should see a `Location` header in the response pointing to the redirect target.

`- [ ] Pass`

### 10.4 SSL Toggle

**Steps:**
1. In the request Settings tab, look for **SSL** options (e.g., "Reject Unauthorized").
2. Verify the toggle exists and can be switched on/off.

**Expected:** The SSL options are visible and toggleable. (Testing with an actual self-signed certificate is not required here. Just verify the controls exist.)

`- [ ] Pass`

---

## Section 11: Pre-request and Post-response Scripts

> **What are scripts?** Scripts are small JavaScript programs that run before a request is sent (pre-request) or after a response is received (post-response). You can use them to set headers dynamically, log information, or extract data from responses.

### 11.1 Pre-request Script: Set a Header

**Steps:**
1. Open a new request. Method: **GET**. URL: `https://httpbin.org/headers`
2. Click the **Scripts** tab in the request panel.
3. In the **Pre-request** script editor, type:
   ```javascript
   nt.request.setHeader('X-Script-Header', 'added-by-script');
   ```
4. Click **Send**.

**Expected:** Status: **200 OK**. In the response `headers`, you see `"X-Script-Header": "added-by-script"`. The header was added by the script before the request was sent.

`- [ ] Pass`

### 11.2 Post-response Script: Log Output

**Steps:**
1. Open a new request. Method: **GET**. URL: `https://jsonplaceholder.typicode.com/posts/1`
2. Scripts tab > **Post-response** script:
   ```javascript
   console.log('Status:', nt.response.status);
   console.log('Title:', nt.response.json().title);
   ```
3. Click **Send**.
4. In the response panel, click the **Scripts** tab (in the response area, not the request area).

**Expected:** The Scripts output shows two log lines:
- `Status: 200`
- `Title:` followed by the title of the post

`- [ ] Pass`

### 11.3 Script: Set Variable from Response

**Steps:**
1. Open a new request. Method: **GET**. URL: `https://jsonplaceholder.typicode.com/posts/1`
2. Scripts tab > Post-response:
   ```javascript
   const data = nt.response.json();
   nt.setVar('savedTitle', data.title);
   console.log('Saved title:', data.title);
   ```
3. Click **Send**.
4. Open a **new** request. Method: **POST**. URL: `https://httpbin.org/post`
5. Body tab > JSON:
   ```json
   {
     "previousTitle": "{{savedTitle}}"
   }
   ```
6. Click **Send**.

**Expected:** In the second response, the `json` field shows `"previousTitle"` with the actual title from the first request (not the literal text `{{savedTitle}}`). The variable was set by the script and used in the next request.

`- [ ] Pass`

### 11.4 Script: Write a Test

**Steps:**
1. Open a new request. Method: **GET**. URL: `https://jsonplaceholder.typicode.com/posts/1`
2. Scripts tab > Post-response:
   ```javascript
   nt.test('Status is 200', () => {
     expect(nt.response.status).to.equal(200);
   });

   nt.test('Body has a title', () => {
     const body = nt.response.json();
     expect(body).to.have.property('title');
   });
   ```
3. Click **Send**.
4. In the response panel, check both the **Scripts** tab and the **Tests** tab.

**Expected:** Two tests are listed, both passing (green checkmarks). The test names "Status is 200" and "Body has a title" appear with pass indicators.

`- [ ] Pass`

### 11.5 Script: Failing Test

**Steps:**
1. Same request as 11.4. Change the post-response script to:
   ```javascript
   nt.test('Status should be 404', () => {
     expect(nt.response.status).to.equal(404);
   });
   ```
2. Click **Send**.

**Expected:** The test "Status should be 404" appears with a fail indicator (red). The actual status was 200, not 404.

`- [ ] Pass`

---

## Section 12: Assertions (No-Code Tests)

> **What are assertions?** Assertions are tests you can add to a request without writing code. You pick what to check (status code, body, header, etc.), how to compare (equals, contains, greater than, etc.), and what value to expect.

### 12.1 Status Code Assertion

**Steps:**
1. Open a new request. Method: **GET**. URL: `https://jsonplaceholder.typicode.com/posts/1`
2. Click the **Tests** tab (or Assertions tab) in the request panel.
3. Click **Add Assertion** (or the + button).
4. Set: Target = **Status Code**, Operator = **=**, Expected = `200`
5. Click **Send**.

**Expected:** In the response Tests tab, the assertion shows as **passed** (green). Status code was 200, which equals the expected 200.

`- [ ] Pass`

### 12.2 Body Contains Assertion

**Steps:**
1. Same request. Add another assertion:
   - Target = **Response Body**, Operator = **contains**, Expected = `userId`
2. Click **Send**.

**Expected:** The assertion passes. The response body contains the text "userId".

`- [ ] Pass`

### 12.3 Response Time Assertion

**Steps:**
1. Same request. Add another assertion:
   - Target = **Response Time**, Operator = **<**, Expected = `5000`
2. Click **Send**.

**Expected:** The assertion passes (assuming the response took less than 5000ms).

`- [ ] Pass`

### 12.4 Header Assertion

**Steps:**
1. Same request. Add another assertion:
   - Target = **Header**, Property = `content-type`, Operator = **contains**, Expected = `json`
2. Click **Send**.

**Expected:** The assertion passes. The `content-type` header contains "json" (it is `application/json; charset=utf-8`).

`- [ ] Pass`

### 12.5 JSON Path Assertion

**Steps:**
1. Same request. Add another assertion:
   - Target = **JSON Path**, Property = `$.userId`, Operator = **=**, Expected = `1`
2. Click **Send**.

**Expected:** The assertion passes. The JSONPath `$.userId` evaluates to `1`, which equals the expected value.

`- [ ] Pass`

### 12.6 Failing Assertion

**Steps:**
1. Same request. Add another assertion:
   - Target = **Status Code**, Operator = **=**, Expected = `404`
2. Click **Send**.

**Expected:** This assertion **fails** (red). The other assertions from previous steps still pass. You can see a mix of passed and failed assertions.

`- [ ] Pass`

---

## Section 13: History

> **What is history?** Every request you send is automatically saved in the History tab. This lets you go back and see what you sent previously, even if you did not save it to a collection.

### 13.1 View History

**Steps:**
1. Click the **History** tab in the sidebar.

**Expected:** You see a list of all the requests you have sent during this testing session, with timestamps, methods, URLs, and status codes.

`- [ ] Pass`

### 13.2 Search History

**Steps:**
1. In the History tab, look for a search input.
2. Type `httpbin`.

**Expected:** The history filters to show only requests that were sent to `httpbin.org`.

`- [ ] Pass`

### 13.3 Open a History Entry

**Steps:**
1. Click on any history entry.

**Expected:** The request opens in a new tab with its original method, URL, headers, and body pre-filled. You can re-send it.

`- [ ] Pass`

### 13.4 Save History Entry to Collection

**Steps:**
1. Right-click on a history entry (or find a "Save" option).
2. Save it to `My API Tests` collection.
3. Give it a name.

**Expected:** The request appears in the collection.

`- [ ] Pass`

### 13.5 View History Stats

**Steps:**
1. Look for a **Stats** button or link in the History tab.
2. Click it.

**Expected:** You see statistics about your request history: number of requests, status code distribution, top endpoints, average response time, or similar.

`- [ ] Pass`

### 13.6 Export History

**Steps:**
1. Look for an **Export** option in the History tab.
2. Export as **JSON**.
3. Export as **CSV**.

**Expected:** Two files are saved: a `.json` file and a `.csv` file, both containing your request history data.

`- [ ] Pass`

### 13.7 Clear History

**Steps:**
1. Look for a **Clear** option in the History tab.
2. Clear all history.
3. Confirm the action.

**Expected:** The History tab is now empty. All previous entries are gone.

`- [ ] Pass`

---

## Section 14: Collection Runner

> **What is the collection runner?** The collection runner lets you execute all requests in a collection (or folder) in sequence, automatically. It is useful for running a series of API tests and seeing which ones pass or fail.

### 14.1 Prepare a Test Collection

**Steps:**
1. Create a new collection called `Runner Tests`.
2. Add these requests (save each to the collection):
   - GET `https://jsonplaceholder.typicode.com/posts/1`. Name: `Get Post`
   - POST `https://jsonplaceholder.typicode.com/posts` with JSON body `{"title":"Runner Test","body":"test","userId":1}`. Name: `Create Post`
   - GET `https://jsonplaceholder.typicode.com/users`. Name: `Get Users`
   - GET `https://httpbin.org/status/404`. Name: `Expect 404`
3. Add an assertion to `Get Post`: Status Code = 200
4. Add an assertion to `Expect 404`: Status Code = 200 (this will fail on purpose)

**Expected:** The collection has 4 requests, two with assertions.

`- [ ] Pass`

### 14.2 Run the Collection

**Steps:**
1. Click the **Runner** icon in the activity rail.
2. Select `Runner Tests` collection.
3. Click **Run** (or Start).

**Expected:** The runner executes all 4 requests in order. You see a progress bar and results appear one by one. `Get Post` passes, `Create Post` passes, `Get Users` passes, `Expect 404` fails (because the status was 404 but the assertion expected 200).

`- [ ] Pass`

### 14.3 Filter Results

**Steps:**
1. After the run completes, look for a filter option (All / Passed / Failed).
2. Click **Failed**.

**Expected:** Only `Expect 404` is shown (the one that failed).

`- [ ] Pass`

### 14.4 Retry Failed Requests

**Steps:**
1. Click **Retry Failed** (or similar button).

**Expected:** Only the failed request (`Expect 404`) runs again. It fails again (same reason).

`- [ ] Pass`

### 14.5 Data-Driven Run

**Steps:**
1. Create a CSV file called `test-data.csv` on your computer with this content:
   ```csv
   post_id
   1
   2
   3
   ```
2. Create a new collection called `Data Runner`.
3. Add a request: GET `https://jsonplaceholder.typicode.com/posts/{{post_id}}`. Name: `Get Post By ID`
4. Open the Runner, select `Data Runner`.
5. Click **Select Data File** and choose `test-data.csv`.
6. Run the collection.

**Expected:** The runner executes the request 3 times, once for each row in the CSV: with `post_id` = 1, then 2, then 3. All three should return **200 OK** with different post data.

`- [ ] Pass`

### 14.6 Export Run Results

**Steps:**
1. After a completed run, look for an **Export** button.
2. Export as **HTML**.

**Expected:** An HTML report file is saved. Opening it in a browser shows a formatted test report with pass/fail results.

`- [ ] Pass`

### 14.7 View Run History

**Steps:**
1. In the Runner panel, look for a **History** section.
2. Click on a past run.

**Expected:** You see the full details of that past run: which requests passed, which failed, timing, and assertion results.

`- [ ] Pass`

---

## Section 15: GraphQL

> **What is GraphQL?** GraphQL is an alternative to REST APIs. Instead of having fixed endpoints (like `/posts/1`), GraphQL has a single endpoint where you send a "query" describing exactly what data you want. The server returns only the fields you asked for.

### 15.1 Switch to GraphQL Mode

**Steps:**
1. Open a new request.
2. Switch the connection mode to **GraphQL** (look for a mode switcher near the URL bar, or in the method dropdown).
3. URL: `https://countries.trevorblades.com/graphql`

**Expected:** The request panel changes to show a GraphQL query editor instead of the regular body/params tabs.

`- [ ] Pass`

### 15.2 Introspect the Schema

**Steps:**
1. Look for an **Introspect** or **Fetch Schema** button.
2. Click it.

**Expected:** The schema is loaded from the server. You may see a "Schema loaded" notification. A schema explorer panel or dropdown becomes available.

`- [ ] Pass`

### 15.3 Browse the Schema Explorer

**Steps:**
1. Open the **Schema Explorer** (may be a tab or sidebar within the GraphQL panel).
2. Browse the available types and fields.

**Expected:** You see the GraphQL schema structure: types like `Country`, `Continent`, `Language`, and their fields. You can click on types to see their fields.

`- [ ] Pass`

### 15.4 Simple Query

**Steps:**
1. In the query editor, type:
   ```graphql
   {
     countries {
       name
       code
     }
   }
   ```
2. Click **Send**.

**Expected:** Status: **200 OK**. The response shows a list of countries, each with a `name` and `code` field (e.g., `{ "name": "Andorra", "code": "AD" }`).

`- [ ] Pass`

### 15.5 Query with Variables

**Steps:**
1. In the query editor, type:
   ```graphql
   query GetCountry($code: ID!) {
     country(code: $code) {
       name
       capital
       currency
     }
   }
   ```
2. In the **Variables** pane (below or beside the query editor), type:
   ```json
   {
     "code": "US"
   }
   ```
3. Click **Send**.

**Expected:** Status: **200 OK**. The response shows: `{ "country": { "name": "United States", "capital": "Washington, D.C.", "currency": "USD,USN,USS" } }`.

`- [ ] Pass`

### 15.6 View Response in Tree View

**Steps:**
1. In the response panel, switch to **Tree View**.

**Expected:** The response is shown as an expandable tree: `data` > `country` > `name`, `capital`, `currency`.

`- [ ] Pass`

---

## Section 16: WebSocket

> **What is a WebSocket?** Unlike regular HTTP requests (where you send a request and get one response), a WebSocket creates a persistent two-way connection. Both the client and server can send messages at any time. It is used for real-time features like chat, live updates, and gaming.

**Prerequisite:** Start the WebSocket echo server:
```bash
cd test-servers/ws-echo-test
pnpm install
node server.js
```

### 16.1 Connect to WebSocket

**Steps:**
1. Open a new request.
2. Switch the connection mode to **WebSocket**.
3. URL: `ws://localhost:4001`
4. Click **Connect**.

**Expected:** The connection status changes to "Connected" (green). You receive a welcome message: `{ "type": "welcome", "message": "Connected to HiveFetch test WebSocket server" }`.

`- [ ] Pass`

### 16.2 Send a Text Message

**Steps:**
1. In the message input area, type: `Hello WebSocket!`
2. Click **Send**.

**Expected:** Your sent message appears in the message log (marked as "sent" or with an outgoing arrow). Shortly after, an echo response appears: `{ "type": "echo", "original": "Hello WebSocket!", "timestamp": "...", "length": 16 }`.

`- [ ] Pass`

### 16.3 Observe Automatic Pings

**Steps:**
1. Wait about 10 seconds without sending anything.
2. Watch the message log.

**Expected:** You see automatic ping messages arriving approximately every 5 seconds: `{ "type": "ping", "time": "..." }`.

`- [ ] Pass`

### 16.4 Send Multiple Messages

**Steps:**
1. Send three more messages quickly:
   - `Message 1`
   - `Message 2`
   - `Message 3`

**Expected:** The message log shows all sent messages and their echo responses, each with timestamps. Messages are displayed in chronological order with direction indicators (sent vs. received).

`- [ ] Pass`

### 16.5 Record a Session

**Steps:**
1. Click the **Record** button (or start recording option).
2. Send two messages: `Recording test A` and `Recording test B`
3. Click **Stop Recording**.
4. Save the session (give it a name like `Test Session`).

**Expected:** The recording stops. A session is saved with the messages exchanged during the recording period.

`- [ ] Pass`

### 16.6 Load and Replay a Session

**Steps:**
1. Disconnect from the WebSocket.
2. Look for a **Sessions** list or **Load Session** option.
3. Load `Test Session`.
4. Connect to `ws://localhost:4001` again.
5. Click **Replay**.

**Expected:** The saved messages are replayed: `Recording test A` and `Recording test B` are sent automatically, and you receive echo responses for each.

`- [ ] Pass`

### 16.7 Disconnect

**Steps:**
1. Click **Disconnect**.

**Expected:** The connection status changes to "Disconnected". No more messages are received.

`- [ ] Pass`

---

## Section 17: Server-Sent Events (SSE)

> **What is SSE?** Server-Sent Events is a one-way streaming technology. The server continuously sends events (data updates) to the client over a single HTTP connection. Unlike WebSocket, only the server sends data; the client just listens. It is used for live feeds, notifications, and real-time dashboards.

**Prerequisite:** Start the SSE server:
```bash
cd test-servers/sse-test
pnpm install
node server.js
```

### 17.1 Connect to SSE Stream

**Steps:**
1. Open a new request.
2. Switch the connection mode to **SSE**.
3. URL: `http://localhost:4002/events`
4. Click **Connect**.

**Expected:** The connection status changes to "Connected". Events start appearing in the event stream viewer, approximately one per second.

`- [ ] Pass`

### 17.2 View Incoming Events

**Steps:**
1. Watch the event stream for about 5 seconds.

**Expected:** You see multiple events, each with:
- **Event type:** `counter`
- **Data:** JSON like `{ "count": 1, "time": "..." }`, `{ "count": 2, "time": "..." }`, etc.
- **ID:** An incrementing number (1, 2, 3, ...)

The count increases by 1 with each event.

`- [ ] Pass`

### 17.3 Disconnect from SSE

**Steps:**
1. Click **Disconnect**.
2. Wait a few seconds.

**Expected:** The connection status changes to "Disconnected". No new events appear. The events you already received remain visible.

`- [ ] Pass`

---

## Section 18: GraphQL Subscriptions

> **What are GraphQL subscriptions?** GraphQL subscriptions are like SSE but for GraphQL. They use a WebSocket connection to stream real-time data updates from the server to the client. You write a subscription query, and the server sends events whenever the subscribed data changes.

**Prerequisite:** Start the GraphQL Subscriptions server:
```bash
cd test-servers/gql-sub-test
pnpm install
node server.js
```

### 18.1 Connect and Subscribe (Countdown)

**Steps:**
1. Open a new request.
2. Switch the connection mode to **GraphQL Subscription**.
3. URL: `ws://localhost:4000`
4. In the query editor, type:
   ```graphql
   subscription {
     countdown(from: 5)
   }
   ```
5. Click **Connect** (or Subscribe/Send).

**Expected:** You receive 6 events over about 5 seconds:
- `{ "countdown": 5 }`
- `{ "countdown": 4 }`
- `{ "countdown": 3 }`
- `{ "countdown": 2 }`
- `{ "countdown": 1 }`
- `{ "countdown": 0 }`

Events arrive approximately one per second.

`- [ ] Pass`

### 18.2 Subscribe to Tick

**Steps:**
1. Change the query to:
   ```graphql
   subscription {
     tick
   }
   ```
2. Subscribe again.
3. Wait about 8 seconds.

**Expected:** You receive incrementing numbers approximately every 2 seconds: `{ "tick": 1 }`, `{ "tick": 2 }`, `{ "tick": 3 }`, `{ "tick": 4 }`.

`- [ ] Pass`

### 18.3 Disconnect

**Steps:**
1. Click **Disconnect**.

**Expected:** The connection closes. No more events arrive.

`- [ ] Pass`

### 18.4 Auto-Reconnect Toggle

**Steps:**
1. Look for an **Auto-Reconnect** toggle or setting.
2. Verify it exists and can be toggled on/off.

**Expected:** The auto-reconnect option is visible and toggleable.

`- [ ] Pass`

---

## Section 19: gRPC

> **What is gRPC?** gRPC is a high-performance communication protocol that programs use to call functions on remote servers. Instead of sending text like REST APIs, gRPC uses a compact binary format defined by `.proto` files (which describe the available services and data types). It supports streaming (sending multiple messages over a single connection).

**Prerequisite:** Start the gRPC server:
```bash
cd test-servers/grpc-test
pnpm install
node server.js
```

### 19.1 Switch to gRPC Mode

**Steps:**
1. Open a new request.
2. Switch the connection mode to **gRPC**.
3. In the URL/address field, type: `localhost:50051`

**Expected:** The request panel changes to show gRPC-specific controls (service/method selector, message editor, metadata tab).

`- [ ] Pass`

### 19.2 Server Reflection

**Steps:**
1. Click the **Reflect** button (or similar).

**Expected:** The app discovers the server's services automatically. You should see a list of services:
- `helloworld.Greeter`
- `test.TestService`
- `users.UserService`

`- [ ] Pass`

### 19.3 Browse Services and Methods

**Steps:**
1. Expand the `users.UserService` service.

**Expected:** You see its methods: `CreateUser`, `GetUser`, `ListUsers`, `UpdateUser`, `DeleteUser`. Each method shows its input and output types.

`- [ ] Pass`

### 19.4 Unary Call: SayHello

**Steps:**
1. Select service `helloworld.Greeter`, method `SayHello`.
2. In the message body, type:
   ```json
   {
     "name": "Tester"
   }
   ```
3. Click **Invoke** (or Send).

**Expected:** You receive a response with a greeting message (e.g., `{ "message": "Hello, Tester!" }` or similar).

`- [ ] Pass`

### 19.5 Unary Call: Echo

**Steps:**
1. Select service `test.TestService`, method `Echo`.
2. Message body:
   ```json
   {
     "message": "hello",
     "repeatCount": 3
   }
   ```
3. Click **Invoke**.

**Expected:** You receive a response echoing the message (possibly repeated or formatted based on `repeatCount`).

`- [ ] Pass`

### 19.6 gRPC Auth Error

**Steps:**
1. Select service `test.TestService`, method `RequireAuth`.
2. Message body: `{}`
3. Click **Invoke** (without setting any metadata).

**Expected:** You receive a gRPC error with status `UNAUTHENTICATED`. The error message indicates that authorization is required.

`- [ ] Pass`

### 19.7 gRPC with Metadata

**Steps:**
1. Same method `RequireAuth`.
2. Click the **Metadata** tab.
3. Add: Key = `authorization`, Value = `Bearer test-token`
4. Click **Invoke**.

**Expected:** The call succeeds. You receive a successful response instead of the UNAUTHENTICATED error.

`- [ ] Pass`

### 19.8 List Users

**Steps:**
1. Select service `users.UserService`, method `ListUsers`.
2. Message body: `{}`
3. Click **Invoke**.

**Expected:** You receive a list of users containing at least Alice (id: "1") and Bob (id: "2").

`- [ ] Pass`

### 19.9 Get Single User

**Steps:**
1. Select method `GetUser`.
2. Message body:
   ```json
   {
     "id": "1"
   }
   ```
3. Click **Invoke**.

**Expected:** You receive Alice's user data (name, email, and other fields).

`- [ ] Pass`

### 19.10 Load Proto File Manually

**Steps:**
1. Instead of using reflection, look for an option to **Load Proto File**.
2. Navigate to `test-servers/grpc-test/proto/greeter.proto` and open it.

**Expected:** The proto file is loaded. The `helloworld.Greeter` service appears with its `SayHello` method, without needing server reflection.

`- [ ] Pass`

---

## Section 20: Mock Server

> **What is a mock server?** A mock server is a fake server that you run locally. You define routes (URL paths) and the responses they should return. This is useful for testing your application when the real server is not available, or for simulating specific scenarios.

### 20.1 Open Mock Server

**Steps:**
1. Click the **Mock Server** icon in the activity rail.

**Expected:** The Mock Server panel opens, showing route configuration and server controls.

`- [ ] Pass`

### 20.2 Add a GET Route

**Steps:**
1. Click **Add Route** (or +).
2. Set: Method = **GET**, Path = `/api/hello`, Status = `200`
3. Response body:
   ```json
   {"message": "Hello from mock server!"}
   ```
4. Set a response header: `Content-Type` = `application/json`

**Expected:** The route appears in the routes list.

`- [ ] Pass`

### 20.3 Add a POST Route

**Steps:**
1. Add another route: Method = **POST**, Path = `/api/data`, Status = `201`
2. Response body:
   ```json
   {"created": true, "id": 42}
   ```

**Expected:** Both routes are listed.

`- [ ] Pass`

### 20.4 Add a Route with Latency

**Steps:**
1. Add another route: Method = **GET**, Path = `/api/slow`, Status = `200`
2. Response body: `{"slow": true}`
3. Set **Latency** to min: `500`, max: `1000` (milliseconds).

**Expected:** The route is configured with a delay of 500-1000ms.

`- [ ] Pass`

### 20.5 Start the Mock Server

**Steps:**
1. Set the port to `3000` (or leave the default).
2. Click **Start** (or the play button).

**Expected:** The server starts. The status changes to "Running" (green). You see a message like "Mock server running on port 3000".

`- [ ] Pass`

### 20.6 Test the Mock Server

**Steps:**
1. Open a new request tab. Method: **GET**. URL: `http://localhost:3000/api/hello`
2. Click **Send**.
3. Open another request. Method: **POST**. URL: `http://localhost:3000/api/data`
4. Click **Send**.
5. Open another request. Method: **GET**. URL: `http://localhost:3000/api/slow`
6. Click **Send**.

**Expected:**
- `/api/hello` returns **200 OK** with `{"message": "Hello from mock server!"}`
- `/api/data` returns **201 Created** with `{"created": true, "id": 42}`
- `/api/slow` returns **200 OK** with `{"slow": true}` after a 500-1000ms delay

`- [ ] Pass`

### 20.7 View Request Logs

**Steps:**
1. In the Mock Server panel, click the **Logs** tab.

**Expected:** You see the 3 requests you just sent, with timestamps, methods, paths, and status codes.

`- [ ] Pass`

### 20.8 Stop the Server

**Steps:**
1. Click **Stop** (or the stop button).

**Expected:** The server stops. The status changes to "Stopped". Sending a request to `http://localhost:3000/api/hello` now fails with a connection error.

`- [ ] Pass`

---

## Section 21: Benchmarking

> **What is benchmarking?** Benchmarking sends the same request many times in rapid succession to measure the server's performance. It reports statistics like average response time, requests per second, and percentile distributions (e.g., "95% of requests completed in under X milliseconds").

### 21.1 Open Benchmark Panel

**Steps:**
1. Click the **Benchmark** icon in the activity rail.

**Expected:** The Benchmark panel opens with configuration fields for iterations, concurrency, and other settings.

`- [ ] Pass`

### 21.2 Configure and Run a Benchmark

**Steps:**
1. Set up a request: Method = **GET**, URL = `https://httpbin.org/get`
2. Set **Iterations** to `20`
3. Set **Concurrent connections** to `3`
4. Click **Start** (or Run).

**Expected:** The benchmark starts. You see a progress indicator (e.g., 1/20, 2/20, ..., 20/20). Individual iteration results appear as they complete.

`- [ ] Pass`

### 21.3 View Statistics

**Steps:**
1. After the benchmark completes, look at the statistics table.

**Expected:** You see:
- **Mean** (average response time)
- **Median** (middle value)
- **p95** and **p99** (95th and 99th percentile)
- **Min** and **Max** response times
- **Requests per second** (RPS)
- Possibly a distribution chart

`- [ ] Pass`

### 21.4 Export Results

**Steps:**
1. Click **Export** and save as **CSV**.

**Expected:** A CSV file is saved with the benchmark results, including per-iteration data.

`- [ ] Pass`

---

## Section 22: OpenAPI Editor

> **What is OpenAPI?** OpenAPI (formerly Swagger) is a standard for describing REST APIs. An OpenAPI spec file (written in YAML or JSON) describes all the endpoints, parameters, request/response formats, and authentication methods of an API. Nouto includes a built-in editor for creating and viewing these spec files.

### 22.1 Open the OpenAPI Editor

**Steps:**
1. Click the **OpenAPI** icon in the activity rail.

**Expected:** The OpenAPI editor opens, showing a code editor (for YAML/JSON) and possibly a preview pane.

`- [ ] Pass`

### 22.2 Open a Sample Spec

**Steps:**
1. Look for an **Open File** option in the OpenAPI editor.
2. Open the sample OpenAPI file: `my-docs/testing/sample-files/sample-openapi.yaml` (if available), or paste this minimal spec:
   ```yaml
   openapi: "3.1.0"
   info:
     title: Test API
     version: "1.0"
   paths:
     /hello:
       get:
         summary: Say hello
         responses:
           "200":
             description: OK
             content:
               application/json:
                 schema:
                   type: object
                   properties:
                     message:
                       type: string
   ```

**Expected:** The spec appears in the editor with syntax highlighting.

`- [ ] Pass`

### 22.3 Browse the Outline

**Steps:**
1. Look for an **Outline** panel or tree on the side of the editor.
2. Click on different items in the outline.

**Expected:** The outline shows the structure of the spec (paths, operations, schemas). Clicking on an item navigates to that section in the editor.

`- [ ] Pass`

### 22.4 View the Preview

**Steps:**
1. Look for a **Preview** pane (it may already be visible, or you may need to toggle it).

**Expected:** The preview shows the API documentation rendered as interactive docs (similar to Swagger UI), with endpoints listed, expandable details, and parameter descriptions.

`- [ ] Pass`

### 22.5 Linting Diagnostics

**Steps:**
1. In the editor, intentionally introduce an error. For example, change `openapi: "3.1.0"` to `openapi: "9.9.9"`.
2. Look for diagnostic markers (underlines, icons, or a problems panel).

**Expected:** The editor shows a warning or error indicating that `9.9.9` is not a valid OpenAPI version.

`- [ ] Pass`

### 22.6 Generate Collection from Spec

**Steps:**
1. Fix the spec (change back to `"3.1.0"`).
2. Look for a **Generate Collection** option.
3. Click it.

**Expected:** A new collection is created in the sidebar based on the API spec. It contains requests matching the endpoints defined in the spec.

`- [ ] Pass`

---

## Section 23: Code Generation

> **What is code generation?** After composing a request in Nouto, you can generate equivalent code in different programming languages. This is useful when you want to replicate the same request in your own application.

### 23.1 Generate cURL

**Steps:**
1. Open a request with some configuration (e.g., GET `https://httpbin.org/get` with a custom header `X-Test: hello`).
2. Click **Send** to verify it works.
3. Look for a **Code** button or **Generate Code** option (often in the response panel or action bar).
4. Select **cURL**.

**Expected:** A cURL command is generated that matches your request, including the URL, method, and custom header.

`- [ ] Pass`

### 23.2 Generate Python

**Steps:**
1. In the code generation panel, switch to **Python (requests)**.

**Expected:** Python code using the `requests` library is generated. It should include `requests.get(...)` with the URL and headers.

`- [ ] Pass`

### 23.3 Generate Other Languages

**Steps:**
1. Switch through the available languages: **JavaScript (Fetch)**, **JavaScript (Axios)**, **Go**, **C#**, **Java**, **PHP**, **Swift**, **Dart**, **PowerShell**.
2. Verify each one generates code.

**Expected:** Each language shows syntactically plausible code for making the same HTTP request. The URL, method, and headers appear in each generated snippet.

`- [ ] Pass`

---

## Section 24: Import Collections

> **What is importing?** Importing lets you load collections from other API clients (like Postman, Insomnia, or Bruno) into Nouto. This is useful if you are migrating from another tool and do not want to re-create all your requests manually.

**Before starting this section,** [download the sample import files (ZIP)](/testing/sample-files.zip) and extract them to a folder on your computer. The files are also available in the repository at `my-docs/testing/sample-files/`.

### 24.1 Import Postman Collection

**Steps:**
1. In the Collections tab, click the **Import** button (or right-click > Import Collection).
2. Select the file: `my-docs/testing/sample-files/postman-collection.json`

**Expected:** A new collection appears in the sidebar with requests from the Postman file. The requests have correct methods, URLs, headers, and bodies.

`- [ ] Pass`

### 24.2 Import Postman Environment

**Steps:**
1. In the Environments panel, look for an **Import** option.
2. Select the file: `my-docs/testing/sample-files/postman-environment.json`

**Expected:** A new environment appears with variables from the Postman environment file.

`- [ ] Pass`

### 24.3 Import Insomnia Collection

**Steps:**
1. Import collection from: `my-docs/testing/sample-files/insomnia-export.json`

**Expected:** A new collection appears with requests from the Insomnia export.

`- [ ] Pass`

### 24.4 Import Hoppscotch Collection

**Steps:**
1. Import collection from: `my-docs/testing/sample-files/hoppscotch-collection.json`

**Expected:** A new collection appears with requests from the Hoppscotch file.

`- [ ] Pass`

### 24.5 Import HAR File

**Steps:**
1. Import collection from: `my-docs/testing/sample-files/sample.har`

**Expected:** A new collection appears with requests extracted from the HAR file (HAR files record browser network traffic).

`- [ ] Pass`

### 24.6 Import Thunder Client Collection

**Steps:**
1. Import collection from: `my-docs/testing/sample-files/thunder-client-collection.json`

**Expected:** A new collection appears with requests from the Thunder Client export.

`- [ ] Pass`

### 24.7 Import Thunder Client Folder

**Steps:**
1. Look for an **Import Thunder Client Folder** option.
2. Select the folder: `my-docs/testing/sample-files/thunder-tests/`

**Expected:** Collections are imported from the Thunder Client folder structure.

`- [ ] Pass`

### 24.8 Import Bruno Collection

**Steps:**
1. Import collection from: `my-docs/testing/sample-files/bruno/` (select the folder or individual `.bru` files).

**Expected:** A new collection appears with requests parsed from the Bruno `.bru` files.

`- [ ] Pass`

### 24.9 Import OpenAPI Spec as Collection

**Steps:**
1. Import collection from: `my-docs/testing/sample-files/sample-openapi.yaml`

**Expected:** A new collection appears with requests generated from the OpenAPI spec's endpoints.

`- [ ] Pass`

### 24.10 Import from cURL

**Steps:**
1. Look for an **Import cURL** option.
2. Paste this cURL command:
   ```
   curl -X POST https://httpbin.org/post -H "Content-Type: application/json" -d '{"test": true}'
   ```
3. Confirm.

**Expected:** A new request is created with: Method = POST, URL = `https://httpbin.org/post`, Header `Content-Type: application/json`, Body = `{"test": true}`.

`- [ ] Pass`

### 24.11 Import from URL

**Steps:**
1. Look for an **Import from URL** option.
2. Enter a URL to a hosted collection file (e.g., a raw GitHub URL to a Postman collection).

**Expected:** The file is fetched from the URL, the format is auto-detected, and a collection is created.

`- [ ] Pass`

---

## Section 25: Export Collections

> **What is exporting?** Exporting saves your collections in various file formats. You can export to share with teammates, migrate to another tool, or create backups.

### 25.1 Export as Nouto Native

**Steps:**
1. Right-click on a collection in the sidebar.
2. Select **Export as Nouto** (or Export > Nouto).
3. Save the file.

**Expected:** A `.json` file is saved in Nouto's native format.

`- [ ] Pass`

### 25.2 Export as Postman

**Steps:**
1. Right-click on a collection.
2. Select **Export to Postman**.
3. Save the file.

**Expected:** A `.postman_collection.json` file is saved that can be imported into Postman.

`- [ ] Pass`

### 25.3 Export as HAR

**Steps:**
1. Right-click on a collection.
2. Select **Export as HAR**.
3. Save the file.

**Expected:** A `.har` file is saved in the HAR format.

`- [ ] Pass`

### 25.4 Generate OpenAPI from Collection

**Steps:**
1. Right-click on a collection.
2. Select **Generate OpenAPI**.
3. Save the file.

**Expected:** An `.openapi.yaml` file is generated describing the collection's endpoints as an OpenAPI specification.

`- [ ] Pass`

### 25.5 Bulk Export All Collections

**Steps:**
1. Look for a **Bulk Export** option (might be in the collection tab's menu or context menu).
2. Export all collections as Nouto native.

**Expected:** A single file (or multiple files) containing all your collections is saved.

`- [ ] Pass`

---

## Section 26: Backup and Restore

> **What is backup?** Backup creates a complete snapshot of all your app data: collections, environments, settings, history, cookies, and more. You can restore from a backup to recover your data.

### 26.1 Create a Backup

**Steps:**
1. Look for a **Backup** option (might be in Settings, the workspace menu, or a dedicated menu).
2. Click **Export Backup**.
3. Save the backup file.

**Expected:** A `.nouto-backup` file is saved. This contains all your collections, environments, settings, and other data.

`- [ ] Pass`

### 26.2 Delete Some Data

**Steps:**
1. Delete one collection from the sidebar.
2. Delete one environment from the environments panel.

**Expected:** The collection and environment are gone.

`- [ ] Pass`

### 26.3 Restore from Backup

**Steps:**
1. Click **Import Backup** (same location as Export Backup).
2. Select the backup file from step 26.1.

**Expected:** Your deleted collection and environment are restored. All data is back to the state it was in when the backup was created.

`- [ ] Pass`

---

## Section 27: Settings

> **What are settings?** Settings let you customize the app's appearance, behavior, and default values. Changes here affect the entire app.

### 27.1 Change Theme

**Steps:**
1. Open Settings (gear icon).
2. Go to **Appearance** (or Theme).
3. Switch between **Dark**, **Light**, and **Auto** themes.

**Expected:** The app's color scheme changes accordingly. Dark uses dark backgrounds, Light uses light backgrounds, Auto follows your OS setting.

`- [ ] Pass`

### 27.2 Import a VS Code Theme

**Steps:**
1. In theme settings, look for **Import Theme** or **Browse Themes**.
2. Import a VS Code theme file (JSON format), or browse available themes.

**Expected:** The theme is applied. Colors change to match the imported theme.

`- [ ] Pass`

### 27.3 Change Interface Font and Size

**Steps:**
1. Go to **Interface** settings.
2. Change the interface font (dropdown showing system fonts).
3. Change the font size (increase or decrease).

**Expected:** The app's UI text changes to the selected font and size. All menus, labels, and buttons reflect the change.

`- [ ] Pass`

### 27.4 Change Editor Font and Size

**Steps:**
1. In the same settings area, change the **editor font** and **editor size**.
2. Go back to a request and look at the body editor or response viewer.

**Expected:** The code/text editor uses the new font and size. The UI font (menus, labels) is unaffected.

`- [ ] Pass`

### 27.5 Modify Keyboard Shortcuts

**Steps:**
1. Go to **Shortcuts** settings.
2. Find the "Send Request" shortcut (default: `Ctrl+Enter`).
3. Click to change it (or just verify the recording UI works).
4. Press `Escape` to cancel the change (or set it back to the original).

**Expected:** The shortcut editor lets you record a new key combination. Conflict detection warns if you pick a shortcut already in use.

`- [ ] Pass`

### 27.6 Enable Autostart

**Steps:**
1. Go to **Desktop** settings.
2. Toggle **Autostart on login**.

**Expected:** The toggle switches. (You can verify by restarting your computer, but just toggling it on/off is sufficient for this test.)

`- [ ] Pass`

### 27.7 Set a Global Shortcut

**Steps:**
1. In Desktop settings, look for **Global Shortcut**.
2. Set a system-wide hotkey (e.g., `Ctrl+Shift+N`).
3. Minimize the app.
4. Press the hotkey.

**Expected:** The Nouto app comes to the foreground when you press the global shortcut, even when another app is focused.

`- [ ] Pass`

### 27.8 Configure OpenAPI Lint Rules

**Steps:**
1. Go to **OpenAPI** settings.
2. Find the lint rule configuration section.
3. Change a rule's severity (e.g., change one from "warning" to "error", or turn one off).

**Expected:** The rule severity updates. If you open the OpenAPI editor, the diagnostics reflect the new severity.

`- [ ] Pass`

---

## Section 28: Projects and Workspace

> **What is a project?** A project in Nouto is a folder on your computer where all your collections, environments, and settings are stored. Different projects keep their data separate, so you can have one project per team or per API.

### 28.1 Create a New Project

**Steps:**
1. Open the workspace menu (top-left).
2. Click **New Project**.
3. Create a new folder (e.g., `nouto-project-2`).
4. Confirm.

**Expected:** A new, empty project opens. The sidebar has no collections. This is a separate workspace from your previous project.

`- [ ] Pass`

### 28.2 Close the Project

**Steps:**
1. Open the workspace menu.
2. Click **Close Project**.

**Expected:** The project closes. You may see the welcome screen or an empty state.

`- [ ] Pass`

### 28.3 Recent Projects

**Steps:**
1. Open the workspace menu.
2. Look for **Open Recent** or a recent projects list.

**Expected:** You see both projects you created (`nouto-test` and `nouto-project-2`) in the recent list.

`- [ ] Pass`

### 28.4 Reopen from Recent

**Steps:**
1. Click on the first project (`nouto-test`) from the recent list.

**Expected:** The project opens with all your previously saved collections, environments, and data intact.

`- [ ] Pass`

### 28.5 Workspace Metadata

**Steps:**
1. Look for **Workspace Settings** or workspace metadata (might be in the workspace menu).
2. Set a name and description for the workspace.
3. Save.

**Expected:** The workspace name and description are saved. They may appear in the title bar or workspace menu.

`- [ ] Pass`

---

## Section 29: Miscellaneous

### 29.1 Command Palette

> **What is the command palette?** The command palette is a quick search bar (like Spotlight on Mac or Start menu search on Windows) that lets you find and open requests, collections, environments, and commands by typing.

**Steps:**
1. Press `Ctrl+K` (or click the search icon in the toolbar).
2. Type the name of a saved request (e.g., `Get Post`).
3. Select it from the results.

**Expected:** The command palette opens as a search overlay. Typing filters the results. Selecting a request opens it in a tab.

`- [ ] Pass`

### 29.2 Undo and Redo

**Steps:**
1. Open a saved request.
2. Change the URL to something different.
3. Press `Ctrl+Z` (Undo).
4. Press `Ctrl+Shift+Z` (Redo).

**Expected:** Undo reverts the URL to its previous value. Redo restores the change.

`- [ ] Pass`

### 29.3 Duplicate a Request Tab

**Steps:**
1. Look for a way to duplicate the current tab (right-click on the tab, or use a menu option).

**Expected:** A new tab opens with the same request contents.

`- [ ] Pass`

### 29.4 Responsive Layout

**Steps:**
1. Make the app window very wide (full screen on a wide monitor).
2. Look at the request/response split. It should be **horizontal** (side by side).
3. Make the window narrow (about half the screen width).
4. Look at the split. It should switch to **vertical** (stacked top/bottom).

**Expected:** The layout automatically adjusts based on the window width. Wide = side by side, narrow = stacked.

`- [ ] Pass`

### 29.5 Copy Diagnostics

**Steps:**
1. Go to Settings > Desktop.
2. Click **Copy Diagnostics**.
3. Paste into a text editor.

**Expected:** System diagnostic information is copied to your clipboard, including OS version, app version, and other technical details useful for bug reports.

`- [ ] Pass`

### 29.6 Load Sample Collection

**Steps:**
1. In the Collections tab, look for a **Load Sample Collection** option (might be on the welcome screen or in a menu).
2. Click it.

**Expected:** A sample collection is added to the sidebar with example requests that demonstrate the app's features.

`- [ ] Pass`

---

## Test Summary

After completing all sections, count your results:

| Section | Name | Scenarios | Passed | Failed |
|---------|------|-----------|--------|--------|
| 1 | First Launch and Orientation | 5 | __ | __ |
| 2 | Basic HTTP Requests | 11 | __ | __ |
| 3 | Request Body Types | 6 | __ | __ |
| 4 | Response Viewer | 11 | __ | __ |
| 5 | Collections and Organization | 12 | __ | __ |
| 6 | Trash | 3 | __ | __ |
| 7 | Environments and Variables | 9 | __ | __ |
| 8 | Cookie Jar | 5 | __ | __ |
| 9 | Authentication | 8 | __ | __ |
| 10 | Request Settings | 4 | __ | __ |
| 11 | Pre-request and Post-response Scripts | 5 | __ | __ |
| 12 | Assertions (No-Code Tests) | 6 | __ | __ |
| 13 | History | 7 | __ | __ |
| 14 | Collection Runner | 7 | __ | __ |
| 15 | GraphQL | 6 | __ | __ |
| 16 | WebSocket | 7 | __ | __ |
| 17 | SSE | 3 | __ | __ |
| 18 | GraphQL Subscriptions | 4 | __ | __ |
| 19 | gRPC | 10 | __ | __ |
| 20 | Mock Server | 8 | __ | __ |
| 21 | Benchmarking | 4 | __ | __ |
| 22 | OpenAPI Editor | 6 | __ | __ |
| 23 | Code Generation | 3 | __ | __ |
| 24 | Import Collections | 11 | __ | __ |
| 25 | Export Collections | 5 | __ | __ |
| 26 | Backup and Restore | 3 | __ | __ |
| 27 | Settings | 8 | __ | __ |
| 28 | Projects and Workspace | 5 | __ | __ |
| 29 | Miscellaneous | 6 | __ | __ |
| **Total** | | **187** | **__** | **__** |

**Thank you for testing!** Please file GitHub issues for any failed scenarios at: https://github.com/frostybee/nouto/issues
