---
title: External references
description: Resolve $ref values that point into other local files, with cross-file completions, go to definition, diagnostics, quick fixes, and outline entries.
sidebar:
  order: 6
---

An OpenAPI spec can split definitions across files with relative `$ref` values. When **Resolve external $refs** is on in **Settings** > **OpenAPI**, Nouto loads the referenced files and extends completions, go to definition, diagnostics, quick fixes, the outline, and the preview across them. The setting is on by default and works independently of **Enable OpenAPI IntelliSense**.

## Supported references

Nouto resolves `$ref` values that are relative paths to local files, with an optional `#` JSON Pointer fragment:

```yaml
# One component in another file
$ref: './common.yaml#/components/schemas/Address'
# A whole file
$ref: '../schemas/pet.json'
```

Nouto never fetches references over the network. A `$ref` that uses a URL such as `https://...`, an absolute path, or a Windows drive path gets an `external-ref-unsupported` warning and is not resolved.

Only specs saved on disk resolve external references. In an untitled spec, every external `$ref` gets the `external-ref-unsupported` warning until you save the file.

Nouto follows references inside the referenced files too, resolving each one relative to the file that contains it. A chain of references can follow at most 10 hops, and one analysis loads at most 50 files. Exceeding either limit, or a reference cycle across files, produces a diagnostic at the `$ref` in your spec.

## Cross-file features

With external references on, these features work across files:

| Feature | Behavior |
|---------|----------|
| Completions | Inside a `$ref` value, Nouto suggests `./file.yaml#/...` targets from files your spec already references. After you type a file path followed by `#`, it suggests the targets inside that file. |
| Go to definition | `Ctrl+Click` (`Cmd+Click` on macOS) an external `$ref` to open the referenced file and reveal the target |
| Diagnostics | A missing file (`external-file-not-found`) or a missing target inside an existing file (`external-pointer-not-found`) is reported as an error at the `$ref` in your spec. When you edit an open referenced file, Nouto re-checks every open spec that depends on it. |
| Outline | A **Referenced files** group lists the files your spec references |
| Preview | Referenced definitions are bundled into the rendered documentation. A banner warns when some references could not be resolved. |

## Referenced files in the outline

The [outline](/openapi/outline) adds a **Referenced files** group when your spec contains at least one external reference. Each file node shows how many references point to it. Its children list each distinct target pointer in that file, or `(whole document)` for a reference to the whole file. Click a child to open the file at that target. A file that Nouto could not load shows a red error icon.

## Fix broken external references

Two quick fixes repair broken cross-file references in both VS Code and the desktop app. Place the cursor on the broken `$ref`, then click the lightbulb or press `Ctrl+.` (`Cmd+.` on macOS).

- **Create missing file** creates the referenced file. When the `$ref` points at `#/components/<section>/<name>` in that file, the new file already contains a skeleton for that component, so the reference resolves immediately.
- **Create missing component** adds a skeleton component to an existing file when the `$ref` points at a `#/components/<section>/<name>` entry that the file does not define.

See [Diagnostics and quick fixes](/openapi/diagnostics) for every available fix.
