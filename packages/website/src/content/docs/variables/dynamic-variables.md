---
title: Dynamic variables
description: Reference for Nouto's built-in dynamic variables that generate UUIDs, timestamps, random and fake data, hashes, and encoded values when you send a request.
sidebar:
  order: 2
---

Dynamic variables are built-in placeholders that Nouto replaces with a generated value each time you send a request. They need no environment setup. Type `{{$` in the URL bar, a key-value table, or the body editor to browse them in autocomplete.

For environment variables, response values, and cookies, see [Variable substitution](/variables/variable-substitution).

## Syntax

A dynamic variable starts with `$`, followed by a namespace, a dot, and a method name. Arguments follow the name, separated by commas:

```text
{{$uuid.v4}}
{{$random.int, 1, 100}}
{{$hash.sha256, my-value}}
```

Nouto trims spaces around each argument and reads arguments as literal text. This has three consequences:

- An argument can't contain a comma, because commas separate arguments.
- An argument can't contain `}`, because `}}` ends the placeholder. For example, `{{$json.minify, {"a": 1}}}` doesn't resolve.
- A `{{variable}}` inside the arguments isn't resolved first. For example, `{{$encode.base64, {{USERNAME}}}}` doesn't encode the value of `USERNAME`. To send Base64-encoded credentials, use the [Basic auth](/authentication/basic) type instead.

If Nouto can't produce a value, for example because the method name is misspelled or a required argument is missing, it sends the placeholder unchanged.

## UUID

| Variable | Output |
|----------|--------|
| `{{$uuid.v4}}` | Random UUID version 4, for example `550e8400-e29b-41d4-a716-446655440000` |
| `{{$uuid.v7}}` | UUID version 7. The first 48 bits hold the current time in milliseconds, so values sort by creation time. |

## Timestamps

| Variable | Output |
|----------|--------|
| `{{$timestamp.unix}}` | Current time in seconds since the Unix epoch, for example `1706886400` |
| `{{$timestamp.millis}}` | Current time in milliseconds since the Unix epoch, for example `1706886400000` |
| `{{$timestamp.iso}}` | Current time in ISO 8601 format, in UTC, for example `2024-02-02T12:00:00.000Z` |
| `{{$timestamp.offset, amount, unit}}` | Unix seconds offset from now. `{{$timestamp.offset, 30, m}}` is 30 minutes from now, and `{{$timestamp.offset, -1, d}}` is one day ago. |
| `{{$timestamp.format, format}}` | Current local time in a custom format, for example `{{$timestamp.format, YYYY-MM-DD}}` gives `2024-02-02` |

The `offset` units are `s` (seconds), `m` (minutes), `h` (hours), and `d` (days). The unit defaults to `s`.

The `format` tokens are `YYYY` (year), `MM` (month), `DD` (day), `HH` (hour, 24-hour clock), `mm` (minute), and `ss` (second). Without a format argument, Nouto uses `YYYY-MM-DDTHH:mm:ss`. The output uses your computer's time zone.

## Random values

| Variable | Output |
|----------|--------|
| `{{$random.int}}` | Whole number from 0 to 1000 |
| `{{$random.int, min, max}}` | Whole number from `min` to `max`, inclusive |
| `{{$random.number, min, max}}` | Number between `min` and `max`. If either bound has a decimal part, the result has two decimal places, for example `{{$random.number, 0.5, 9.5}}` gives `4.73`. Otherwise the result is a whole number. Defaults to 0 and 1000. |
| `{{$random.string}}` | 16 random letters and digits, for example `aB3kR9mPqX2wNv7L` |
| `{{$random.string, length}}` | Random letters and digits of the given length, from 1 to 256 |
| `{{$random.bool}}` | `true` or `false` |
| `{{$random.enum, a, b, c}}` | One of the listed values, for example `{{$random.enum, dev, staging, prod}}` |
| `{{$random.name}}` | First and last name, for example `Jennifer Garcia` |
| `{{$random.email}}` | Email address at `example.com`, `example.org`, or `test.com`, for example `jennifer.garcia482@example.com` |

## Hashes and HMAC

Hash variables take the input text as the first argument and return a lowercase hex string:

| Variable | Algorithm |
|----------|-----------|
| `{{$hash.md5, input}}` | MD5 |
| `{{$hash.sha1, input}}` | SHA-1 |
| `{{$hash.sha256, input}}` | SHA-256 |
| `{{$hash.sha512, input}}` | SHA-512 |

HMAC variables take the input text and a key, and also return a lowercase hex string:

| Variable | Algorithm |
|----------|-----------|
| `{{$hmac.md5, input, key}}` | HMAC-MD5 |
| `{{$hmac.sha1, input, key}}` | HMAC-SHA1 |
| `{{$hmac.sha256, input, key}}` | HMAC-SHA256 |
| `{{$hmac.sha512, input, key}}` | HMAC-SHA512 |

Both arguments are literal text, so you can't pass the request body or an environment variable as the input or key. See [Syntax](#syntax).

## Encoding and decoding

| Variable | Output |
|----------|--------|
| `{{$encode.base64, input}}` | Base64 |
| `{{$encode.base64url, input}}` | URL-safe Base64 without `=` padding |
| `{{$encode.url, input}}` | Percent-encoded text, for example `hello world` becomes `hello%20world` |
| `{{$encode.html, input}}` | HTML entities for `&`, `<`, `>`, `"`, `'`, and characters outside ASCII |
| `{{$decode.base64, input}}` | Decoded Base64 or URL-safe Base64 |
| `{{$decode.url, input}}` | Decoded percent-encoding |

## Regex and JSON

| Variable | Output |
|----------|--------|
| `{{$regex.match, input, pattern, flags}}` | First match of `pattern` in `input`, or an empty string if nothing matches. `flags` is optional, for example `i`. |
| `{{$regex.replace, input, pattern, replacement, flags}}` | `input` with matches of `pattern` replaced. Pass `g` as `flags` to replace every match. |
| `{{$json.escape, input}}` | `input` escaped for use inside a JSON string, without surrounding quotes |
| `{{$json.minify, input}}` | `input` parsed as JSON and printed without whitespace |

Patterns follow JavaScript regular expression syntax. Because arguments can't contain `,` or `}`, quantifiers such as `\d{3}` don't work in a pattern. The same rule means `$json.minify` can't receive a JSON object.

## Fake data

The `$faker` namespace generates realistic test data with the [Faker](https://fakerjs.dev/) library. Every value is new on each send. The tables below list every `$faker` method. Methods with arguments show their defaults.

### Person

| Variable | Example output |
|----------|----------------|
| `{{$faker.firstName}}` | `Martin` |
| `{{$faker.lastName}}` | `Lind-Kuvalis` |
| `{{$faker.fullName}}` | `Katie Schneider` |
| `{{$faker.jobTitle}}` | `Senior Response Agent` |
| `{{$faker.gender}}` | `Female` |
| `{{$faker.prefix}}` | `Ms.` |
| `{{$faker.suffix}}` | `DVM` |

### Internet

| Variable | Example output |
|----------|----------------|
| `{{$faker.email}}` | `Danyka75@gmail.com` |
| `{{$faker.username}}` | `Jacky.Bednar45` |
| `{{$faker.url}}` | `https://limited-tributary.name/` |
| `{{$faker.domainName}}` | `key-sand.net` |
| `{{$faker.ip}}` | `52.112.253.111` |
| `{{$faker.ipv6}}` | `a8a8:ca6c:697e:8af9:d3a9:9db9:02fb:fff1` |
| `{{$faker.mac}}` | `49:3f:fd:7d:24:7b` |
| `{{$faker.password, length}}` | `R5u2yF7d1KrY0Q2s` (length defaults to 16) |
| `{{$faker.userAgent}}` | `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ...` |

### Location

| Variable | Example output |
|----------|----------------|
| `{{$faker.city}}` | `Shaynachester` |
| `{{$faker.state}}` | `Arizona` |
| `{{$faker.country}}` | `Sierra Leone` |
| `{{$faker.countryCode}}` | `UY` |
| `{{$faker.street}}` | `Boyle Extension` |
| `{{$faker.streetAddress}}` | `347 Chestnut Street` |
| `{{$faker.zipCode}}` | `03845-7870` |
| `{{$faker.latitude}}` | `-2.9453` |
| `{{$faker.longitude}}` | `-28.7075` |
| `{{$faker.timeZone}}` | `America/Yakutat` |

### Phone and company

| Variable | Example output |
|----------|----------------|
| `{{$faker.phone}}` | `1-588-410-5542 x54927` |
| `{{$faker.company}}` | `Shields - Fay` |
| `{{$faker.catchPhrase}}` | `Persevering cohesive product` |
| `{{$faker.buzzPhrase}}` | `orchestrate compelling convergence` |

### Finance

| Variable | Example output |
|----------|----------------|
| `{{$faker.amount, min, max, decimals}}` | `993.88` (defaults to 0, 1000, and 2) |
| `{{$faker.currencyCode}}` | `TRY` |
| `{{$faker.currencyName}}` | `Kwanza` |
| `{{$faker.iban}}` | `LV57UZHEX486O08000615` |
| `{{$faker.creditCard}}` | `4208-9478-6802-2199` |
| `{{$faker.bitcoinAddress}}` | `15mqbwxjJacmncVQ7neshvVoDAK4KWBh` |

### Lorem text

| Variable | Example output |
|----------|----------------|
| `{{$faker.word}}` | `arx` |
| `{{$faker.words, count}}` | `aliqua ad turpis` (count defaults to 3) |
| `{{$faker.sentence}}` | `Spargo decretum terror vito compello solus defero.` |
| `{{$faker.paragraph}}` | Three Lorem sentences |
| `{{$faker.slug}}` | `adversus-conduco-officia` |

### Strings and identifiers

| Variable | Example output |
|----------|----------------|
| `{{$faker.uuid}}` | `2d948a4d-6ed1-4a4c-a87e-0850c8e95f10` |
| `{{$faker.nanoid}}` | `ZZc4f5csT_m9lfOf_F_kd` |
| `{{$faker.alpha, length}}` | `tsTrUHrd` (length defaults to 8) |
| `{{$faker.alphanumeric, length}}` | `fYp9iTaM` (length defaults to 8) |
| `{{$faker.numeric, length}}` | `19509375` (length defaults to 8) |
| `{{$faker.hexadecimal, length}}` | `0xFd9B9BCF` (length defaults to 8, not counting the `0x` prefix) |
| `{{$faker.boolean}}` | `true` |

### Dates

| Variable | Example output |
|----------|----------------|
| `{{$faker.past}}` | ISO 8601 date within the past year, for example `2026-09-25T03:47:13.911Z` |
| `{{$faker.future}}` | ISO 8601 date within the next year, for example `2026-11-13T08:40:29.486Z` |
| `{{$faker.recent}}` | ISO 8601 date within the past day, for example `2026-10-04T19:10:37.979Z` |
| `{{$faker.birthdate}}` | `1979-02-25` |
| `{{$faker.weekday}}` | `Monday` |
| `{{$faker.month}}` | `April` |

### Colors and images

| Variable | Example output |
|----------|----------------|
| `{{$faker.colorName}}` | `yellow` |
| `{{$faker.colorHex}}` | `#ac28ad` |
| `{{$faker.colorRgb}}` | `rgb(170, 205, 112)` |
| `{{$faker.imageUrl}}` | `https://picsum.photos/seed/Syeu3n/549/788` |
| `{{$faker.avatar}}` | `https://avatars.githubusercontent.com/u/47297999` |

### Hacker, database, and system

| Variable | Example output |
|----------|----------------|
| `{{$faker.hackerPhrase}}` | `I'll bypass the back-end SSL hard drive, that should transmitter the IB sensor!` |
| `{{$faker.hackerAbbr}}` | `THX` |
| `{{$faker.dbColumn}}` | `password` |
| `{{$faker.dbType}}` | `enum` |
| `{{$faker.dbEngine}}` | `MyISAM` |
| `{{$faker.fileName}}` | `till_brook_where.jsonld` |
| `{{$faker.fileExt}}` | `html` |
| `{{$faker.mimeType}}` | `application/epub+zip` |
| `{{$faker.semver}}` | `6.3.7` |

## Prompt for a value at send time

Use `{{$prompt.name}}` for a value you want to type each time you send, such as a one-time code. Replace `name` with a label of your choice. The label can't contain spaces, commas, or `}`.

```json
{
  "username": "{{username}}",
  "otp": "{{$prompt.otp}}"
}
```

When you send the request, Nouto scans the URL, query parameters, headers, body, GraphQL variables, and the username, password, token, and API key fields of the **Auth** tab. If it finds `$prompt` placeholders, it opens an **Enter values** dialog with one field per label. A label used several times gets one field.

- Click **Send** in the dialog to send the request with the values you entered.
- Click **Cancel** to stop. Nouto doesn't send the request.

Nouto uses the values for that one send and doesn't save them. The [Collection Runner](/testing/collection-runner) doesn't prompt, so it sends `{{$prompt.name}}` unchanged.

## Read a file at send time

Use `{{$file.read, path}}` to insert the text content of a file when you send the request. Use an absolute path:

```http
Authorization: Bearer {{$file.read, /home/user/.secrets/token.txt}}
```

The file is read as UTF-8 text, and its full content replaces the placeholder, including any trailing newline. If the file can't be read, for example because it doesn't exist, Nouto sends the placeholder unchanged.

:::note
`$file.read` resolves in the VS Code extension. In the desktop app and the Collection Runner, Nouto sends the placeholder unchanged.
:::

## Examples

These examples combine several dynamic variables in one request.

Generate test data for a user creation request:

```json
{
  "id": "{{$uuid.v4}}",
  "name": "{{$faker.fullName}}",
  "email": "{{$faker.email}}",
  "role": "{{$random.enum, admin, editor, viewer}}",
  "createdAt": "{{$timestamp.iso}}"
}
```

Send a token that expires in one hour:

```json
{
  "issued_at": {{$timestamp.unix}},
  "expires_at": {{$timestamp.offset, 1, h}}
}
```

Send a unique idempotency key with each request:

```http
Idempotency-Key: {{$uuid.v7}}
```
