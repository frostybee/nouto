---
title: Generate from Collections
description: Generate a YAML OpenAPI specification from a Nouto collection.
sidebar:
  order: 7
---

Generate an OpenAPI document from an existing collection when you need a starting specification for requests you have already captured.

## Generate a specification

Use **Generate OpenAPI from Collection** from a collection's menu or the command palette. Choose a destination for the generated `.openapi.yaml` file. Nouto opens the resulting document in the OpenAPI editor.

The generator uses the collection's requests to infer paths, operations, parameters, headers, request bodies, and available response examples. Review the result before publishing it: request collections do not always contain enough information to infer every OpenAPI detail.

## Warnings

Nouto shows warnings when a source request cannot be represented completely. The YAML file is still generated so that you can complete or refine it in the OpenAPI editor.

Use [Import from OpenAPI](/import-export/from-other#openapi--swagger) for the reverse workflow.
