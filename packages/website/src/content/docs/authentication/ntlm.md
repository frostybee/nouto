---
title: NTLM Authentication
description: Configure NTLM (Windows-integrated) authentication in Nouto for corporate intranets, IIS servers, and Windows-based APIs.
---

NTLM (NT LAN Manager) is a Windows challenge-response authentication protocol used in corporate intranets, IIS applications, SharePoint, and other Windows-based services. Nouto handles the multi-step NTLM handshake automatically.

<!-- screenshot: authentication/ntlm-fields.png -->
![NTLM auth fields: Username, Password, and Domain](/screenshots/authentication/ntlm-fields.png)

## Setup

1. Open a request and click the **Auth** tab.
2. Select **NTLM** from the type dropdown.
3. Fill in the fields:
   - **Username**: your Windows username
   - **Password**: your Windows password
   - **Domain**: your Windows domain (e.g., `CORP`, `EXAMPLE`) — leave blank if not required

## How It Works

NTLM uses a three-way handshake. Nouto manages this automatically when you click **Send**:

1. Nouto sends the initial request without credentials.
2. The server responds with `401 Unauthorized` and an NTLM challenge.
3. Nouto computes a response using your credentials and the server's challenge, then resends the request with the NTLM token in the `Authorization` header.
4. The server validates the response and returns the actual result.

You only see the final response.

## Variable Support

All three fields accept `{{variable}}` syntax:

| Field | Example |
|-------|---------|
| Username | `{{NTLM_USERNAME}}` |
| Password | `{{NTLM_PASSWORD}}` |
| Domain | `{{NTLM_DOMAIN}}` |

## When to Use NTLM

NTLM is the right choice when you are connecting to:

- IIS web applications configured for Windows authentication
- SharePoint on-premises
- Internal corporate APIs behind a Windows auth gateway
- Any service that responds to unauthenticated requests with a `WWW-Authenticate: NTLM` header

For modern APIs outside of Windows environments, prefer Basic, Bearer, or OAuth 2.0 authentication.

## Troubleshooting

**401 Unauthorized after handshake**: The username, password, or domain is incorrect. Verify each field and check whether the domain prefix is required by the server.

**Connection reset or no response**: Some proxies strip NTLM headers. If you are behind a corporate proxy, check whether the proxy supports NTLM pass-through.

**Domain format**: Some servers expect the domain and username as `DOMAIN\username` in the username field with the domain left blank. Try both formats if authentication fails.
