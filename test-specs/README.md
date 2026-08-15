# Test Specs

Sample API specification documents for manually testing Nouto's OpenAPI
editor (VS Code extension and desktop app): diagnostics, outline, completion,
preview, Try It, and Generate Collection.

These are manual-testing assets. Automated test fixtures live next to their
suites (e.g. `packages/vscode/src/services/openapi/__fixtures__/`).

## openapi/

| File | Version | Source |
|---|---|---|
| `petstore-3.0.4.yaml` | OpenAPI 3.0.4 | Official Swagger Petstore, copied verbatim from [swagger-api/swagger-petstore](https://github.com/swagger-api/swagger-petstore/blob/master/src/main/resources/openapi.yaml) |
| `petstore-3.2.yaml` | OpenAPI 3.2.0 | Hand-upgraded from the official 3.0.4 spec. No official 3.2 Petstore exists; the OAI is [discussing a replacement example](https://github.com/OAI/OpenAPI-Specification/discussions/5273). |

The 3.2 file deliberately exercises features new since 3.0:

- the `query` operation keyword (`QUERY /pet/search`)
- `additionalOperations` for arbitrary HTTP methods (`COPY /pet/{petId}`)
- root-level `webhooks` (`newPet`, `orderShipped`)
- JSON Schema 2020-12 idioms: `type: [string, "null"]` instead of
  `nullable: true`, `examples` arrays instead of `example`

Both files pass Nouto's own analyzer and meta-schema validation with zero
diagnostics (verify with `analyzeOpenApi` + `validateOpenApiMetaSchema` from
`@nouto/core/services`).
