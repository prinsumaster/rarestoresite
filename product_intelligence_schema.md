# Product Intelligence Schema (v6.0)

## Hybrid Architecture
SyncOS utilizes a hybrid schema. High-cardinality and frequently queried attributes are stored in strict relational tables. Deeply nested, unstructured, or volatile data is serialized into JSON columns to preserve extraction fidelity without schema migrations.

## Relational Entities
### `products`
Extends base schema with `sku`, `style_code`, `upc`, `material`, `dimensions`, `weight`, `country`, `manufacturer`.

### `product_specifications`
Key-value pairs extracted from Semantic DOM tables.
- `spec_key`
- `spec_value`
- `source` (e.g., HTML Table)

### `product_seo`
- `meta_title`
- `meta_description`
- `json_ld` (Raw serialized JSON-LD)
- `canonical_url`

### `product_media_v6`
Stores de-duplicated, highest-resolution assets.
- `type` (Image, Video, 360)
- `width`, `height`, `mime_type`

## JSON Payloads
### `rich_data` (Merge Engine Output)
Injected into `data.js` transparently. Contains cross-pollinated `specifications`, `seo`, and `product_attributes` merged from the best suppliers.
