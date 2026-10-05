---
title: NTLM authentication
description: Configure NTLM (Windows) authentication in Nouto for IIS, SharePoint on-premises, and other servers that use Windows authentication.
sidebar:
  order: 6
---

NTLM (NT LAN Manager) is a Windows challenge-response authentication protocol. Use it for servers that respond to an unauthenticated request with `WWW-Authenticate: NTLM`, such as IIS sites configured for Windows authentication and SharePoint on-premises. Nouto runs the NTLM handshake for you on every send.

## Set up NTLM auth

1. Open a request and select the **Auth** tab.
2. Select **NTLM** from the **Type** dropdown.
3. Enter the **Username** and **Password** of the Windows account.
4. If the server requires a domain, enter it in **Domain**, for example `CORPORATE`.
5. If the server requires a workstation name, enter it in **Workstation**.

**Domain** and **Workstation** are optional. **Username** and **Password** resolve `{{variable}}` references at send time. **Domain** and **Workstation** are sent as typed.

## NTLM handshake

When you click **Send**, Nouto runs the three-message NTLM handshake:

1. Nouto sends the request with an NTLM negotiate message in the `Authorization` header.
2. The server responds with `401 Unauthorized` and an NTLM challenge in the `WWW-Authenticate` header.
3. Nouto computes a response from your credentials and the challenge, and sends the request again with it in the `Authorization` header.

The response panel shows the server's response to the final request. Nouto never sends the password itself.

:::note
In the VS Code extension, NTLM requests don't go through the proxy configured in Nouto, and the **Timing** tab doesn't break the request time down into phases.
:::

## Troubleshooting NTLM

### `401 Unauthorized` after the handshake

The server rejected the credentials. Check the username, password, and domain. Some servers expect the domain inside the username as `DOMAIN\username` with **Domain** left empty, which is the format the **Username** placeholder shows. If one format fails, try the other.

### Connection reset or no response

A proxy between Nouto and the server can strip the NTLM headers or break the connection the handshake depends on. If you're behind a corporate proxy, check whether it supports NTLM pass-through.
