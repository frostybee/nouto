---
title: Query Filter
description: Filter JSON Explorer nodes with a field comparison language supporting operators, regex, and boolean combinators.
sidebar:
  order: 1
---

Press `Ctrl+Shift+K` to open the query filter bar. Queries compare a field against a value, so you can narrow an array of objects down to the items you care about.

:::tip
This is a different feature from the [JSONPath filter](/response/json-explorer#jsonpath-filter) on `Ctrl+/`. The query filter uses field comparisons such as `age > 30`; the JSONPath filter uses path expressions such as `$.data[*].name`. Both remain available.
:::

## Operators

| Operator | Matches |
|----------|---------|
| `=` | Equal |
| `!=` | Not equal |
| `>` | Greater than |
| `<` | Less than |
| `>=` | Greater than or equal |
| `<=` | Less than or equal |
| `~` | Regular expression match |
| `contains` | Substring match |
| `startsWith` | Starts with |
| `endsWith` | Ends with |

String comparisons with `contains` are case-insensitive.

## Combinators

Combine conditions with `AND`, `OR`, and `NOT`, and group them with parentheses:

```
status = "active" AND (role = "admin" OR role = "owner")
NOT status = "archived"
```

Field paths use dot notation to reach nested values, for example `address.city`.

## Examples

```
name contains "john"
address.city contains "york"
email startsWith "admin"
url endsWith ".json"
age > 30
status = "active"
name ~ "^The"
url ~ "\.json$"
status ~ "^(Ended|Canceled)$"
name ~ "^[A-M]" AND type = "Scripted"
email != null
```

## Query reference panel

The filter bar has a help button that opens a **Query Reference** panel listing every operator and combinator alongside worked examples, so you do not have to leave the explorer to check syntax.

## Navigating matches

Matching nodes are highlighted in both the tree and the table view, with the current match highlighted more strongly. Use the next and previous controls in the filter bar to step through matches; the explorer expands collapsed ancestors and scrolls each match into view.
