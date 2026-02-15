# Desktop App Testing Plan - Phase 2 HTTP

## Prerequisites
```bash
cd packages/desktop
npm install  # If not already done
npm run dev:tauri
```

## Test Cases

### Test 1: Simple GET Request
1. Launch app (should open on port 5174)
2. In the main panel:
   - Method: GET
   - URL: `https://httpbin.org/get`
   - Click Send
3. **Expected:**
   - Response status: 200 OK
   - JSON response displays
   - Timing breakdown shows (DNS, TCP, TLS, Transfer, Total)
   - Response size shown

### Test 2: POST with JSON Body
1. Method: POST
2. URL: `https://httpbin.org/post`
3. Headers: Add `Content-Type: application/json`
4. Body tab → JSON:
   ```json
   {
     "name": "HiveFetch",
     "version": "0.0.1"
   }
   ```
5. Click Send
6. **Expected:**
   - Response status: 200 OK
   - Response includes echoed JSON in `json` field

### Test 3: Query Parameters
1. Method: GET
2. URL: `https://httpbin.org/get`
3. Params tab:
   - `foo` = `bar`
   - `test` = `123`
4. Click Send
5. **Expected:**
   - Response shows params in `args` field

### Test 4: Basic Authentication
1. Method: GET
2. URL: `https://httpbin.org/basic-auth/user/pass`
3. Auth tab → Basic Auth:
   - Username: `user`
   - Password: `pass`
4. Click Send
5. **Expected:**
   - Response status: 200 OK
   - Response shows `"authenticated": true`

### Test 5: Bearer Token
1. Method: GET
2. URL: `https://httpbin.org/bearer`
3. Auth tab → Bearer Token:
   - Token: `test-token-123`
4. Click Send
5. **Expected:**
   - Response status: 200 OK
   - Response shows `"authenticated": true` and `"token": "test-token-123"`

### Test 6: Request Cancellation
1. Method: GET
2. URL: `https://httpbin.org/delay/10` (10 second delay)
3. Click Send
4. Immediately click Cancel
5. **Expected:**
   - Request stops
   - Loading state clears
   - No response displayed

### Test 7: Error Handling (404)
1. Method: GET
2. URL: `https://httpbin.org/status/404`
3. Click Send
4. **Expected:**
   - Response status: 404 Not Found
   - Error flag set
   - Response shown

### Test 8: Compression
1. Method: GET
2. URL: `https://httpbin.org/gzip`
3. Click Send
4. **Expected:**
   - Response status: 200 OK
   - JSON response decompressed and displayed
   - `gzipped: true` in response

## Debug Checklist

If requests fail, check:
1. **Rust backend logs** - Look for errors in terminal running `tauri dev`
2. **Browser DevTools** - Check Console for JS errors
3. **Network** - Verify machine has internet connection
4. **Event emission** - Add console.log in App.svelte `handleMessage` to see if events arrive

## Known Limitations (Current Phase)

- ❌ Form-data with files (Phase 3 - File Service needed)
- ❌ Binary body uploads (Phase 3)
- ❌ GraphQL body type (Phase 3)
- ❌ OAuth2 flow (Phase 4)
- ❌ WebSocket/SSE (Phase 4)
- ❌ Collections persistence (Phase 3 - Storage Service needed)

## Success Criteria

Phase 2 is complete when:
- ✅ All 8 test cases pass
- ✅ Timing breakdown displays correctly
- ✅ Cancellation works
- ✅ Error responses handled
- ✅ No crashes or hangs
