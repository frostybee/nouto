---
title: Authentication
description: Configure authentication for your HTTP requests. Nouto supports eight auth types plus an inheritance system for collections and folders.
---

Nouto has a dedicated **Auth** tab in the request editor for configuring authentication. The auth type you select determines which fields appear and how the credentials are sent with each request.

<!-- screenshot: authentication/auth-tab-overview.png -->
![Auth tab in the request panel showing the auth type dropdown open with all available types listed](/screenshots/authentication/auth-tab-overview.png)

## Auth Types

| Type | Best for |
|------|----------|
| [Basic](/authentication/basic) | HTTP Basic auth, legacy APIs, internal tools |
| [Bearer Token](/authentication/bearer) | JWT tokens, OAuth access tokens, API tokens |
| [API Key](/authentication/api-key) | API keys sent as a header or query parameter |
| [OAuth 2.0](/authentication/oauth2) | APIs using standard OAuth flows |
| [AWS Signature v4](/authentication/aws-signature) | AWS services (S3, DynamoDB, API Gateway, etc.) |
| [NTLM](/authentication/ntlm) | Windows-integrated auth, IIS, corporate intranets |
| [Digest](/authentication/digest) | Legacy systems, network appliances, some enterprise APIs |
| None | Public endpoints, or when auth is set via headers manually |

## Accessing the Auth Tab

Open any request and click the **Auth** tab. Select a type from the dropdown. The fields below update immediately to match the selected type.

## Variable Support

Every auth field accepts `{{variable}}` syntax. Store credentials in environment variables rather than entering them directly, especially for secrets like tokens and passwords.

```
{{API_TOKEN}}
{{AWS_ACCESS_KEY}}
{{OAUTH_CLIENT_SECRET}}
```

## Auth Inheritance

Requests inside collections and folders can inherit auth from their parent instead of configuring it separately. This is useful when all requests in a collection share the same credentials.

See [Auth Inheritance](/authentication/inheritance) for the full configuration guide.

## Security

Sensitive fields (passwords, tokens, client secrets) are always masked in the UI. When you send a request over unencrypted HTTP to a non-localhost URL, Nouto shows a security warning.
