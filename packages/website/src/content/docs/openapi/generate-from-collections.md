---
title: Generate from collections
description: Generate an OpenAPI 3.1 document from a Nouto collection, or from a HAR file in VS Code.
sidebar:
  order: 7
---

Nouto can generate an OpenAPI 3.1 document from a collection, which gives you a starting spec for an API you have already been testing. The VS Code extension can also generate one from a HAR file.

## Generate a spec from a collection

Open the collection's menu in the sidebar, either by right-clicking the collection or with its **More actions** button, and select **Export** > **OpenAPI Spec**. In VS Code, you can also run **Nouto: Generate OpenAPI from Collection** from the Command Palette and pick a collection.

What happens next depends on the platform:

- In VS Code, the generated document opens as an untitled YAML file. Save it wherever you want to keep it.
- In the desktop app, Nouto asks where to save the file, suggests `<collection name>.openapi.yaml`, and writes it there. Open the file in the [OpenAPI editor](/openapi) to keep editing it.

## Generate a spec from a HAR file

In VS Code, run **Nouto: Generate OpenAPI from HAR File** from the Command Palette and pick a `.har` file, or right-click a `.har` file in the Explorer and select **Generate OpenAPI from HAR File**. The generated document opens as an untitled YAML file. Response bodies recorded in the HAR file become response schemas.

## What the generator infers

The generator builds the document from the requests in the collection:

- The document title is the collection name, and `info.version` is `1.0.0`.
- Each request becomes an operation, with the request name as its `summary`. Requests with the same method and path merge into one operation.
- Numeric and UUID path segments become path parameters.
- Query parameters and headers become parameters, including headers inherited from folders and the collection. JSON request bodies produce inferred schemas.
- Saved response examples become responses with inferred schemas.
- A request inside a folder gets the name of its direct parent folder as a tag.
- Request URLs produce the `servers` list.
- Basic, Bearer, Digest, API key, and OAuth 2.0 auth produce security schemes, including auth inherited from folders and the collection.

Collection and folder variables are substituted before the generator reads URLs, parameters, and bodies. Review the result before you publish it: a request collection rarely contains every detail an OpenAPI document can describe.

## Warnings

When part of a request cannot be represented in OpenAPI, Nouto still generates the document and shows a warning that lists the first three problems. Typical warnings:

- A request uses a method that has no OpenAPI operation key, so it is skipped.
- A request body is not valid JSON, so it is exported without a schema.
- A GraphQL request is exported as a generic JSON request body.
- AWS Signature and NTLM auth have no OpenAPI security scheme, so security is omitted for those requests.
- No server URL could be determined, so the document has no `servers` entry.

For the reverse direction, see [Import from OpenAPI](/import-export/from-other#openapi).
