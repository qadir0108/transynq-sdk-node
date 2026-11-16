# Dates, money and enums (type mapping)

| OpenAPI | Meaning | Node.js / TypeScript |
|---|---|---|
| `string` | text | `string` |
| `string` / `uuid` | identifier | `Uuid` (a `string`) |
| `string` / `date` (C# `DateOnly`) | calendar day `yyyy-MM-dd`, never a midnight instant | `DateOnly` (a branded `string`; build one with `dateOnly('2026-10-02')`) |
| `string` / `date-time` | instant, always UTC on the wire (`2026-10-02T03:04:05Z`) | `Instant` (an ISO-8601 UTC `string`) |
| `integer` / `int32`, `int64` | whole number (the API also accepts it as a string) | `number` |
| `number` | money, rates, quantities: `decimal(18,2)` in the API (the spec cannot tell decimals from doubles, so every number is a decimal) | `Decimal` = `number | string`: answers are parsed losslessly, a number with more than 15 significant digits stays its exact text (Node >= 21); requests may send strings, which the API accepts |
| `boolean` | flag | `boolean` |
| `array`, `additionalProperties` | list, map | `T[]`, `Record<string, T>` |
| untyped object, `JsonElement` | free-form JSON (grid rows, long-operation results) | `JsonValue` / `JsonObject` |
| `binary` (`IFormFile`) | uploaded file | `FileUpload` |

Models are TypeScript interfaces only (zero runtime cost). A property not in the schema's `required` list is optional (`?`); a nullable one is `T | null`. Unknown JSON properties are kept on the object but are not typed. Codes such as `status` or `kind` are `string` (the contract declares no enums), so a new code never breaks your code; well-known long-operation states are in `LongOperationStatus`.

## Rules worth knowing

- **Calendar days are not instants.** A `date` member (delivery day, public holiday) is `yyyy-MM-dd`. Never send a midnight
  instant for it.
- **Instants are UTC.** The SDK always writes them in UTC with `Z`; the company's time zone (`MeResponse.timeZone`) is for display only.
- **Money is decimal.** The API stores `decimal(18,2)` values and rounds them in its domain; the SDK never converts them through
  binary floating point.
- **Codes are open.** `status`, `kind`, `reasonType` and similar members are strings. New values may appear in later API versions;
  handle unknown values instead of failing.
- **Forward compatible.** Properties the SDK does not know yet are ignored when reading.
