# Token Cost Estimate (USD)

Replaces the composer's **Token usage** statistics control so its panel also shows
what the session cost, in US dollars, split by billed bucket.

```
Token usage                                     578,432,493 tok
───────────────────────────────────────────────────────────────
Cache hit                                                  99%
Uncached input                         3,826,941 tok      $0.57
Cached input                         572,616,832 tok      $1.72
Output                                 1,988,720 tok      $1.19
───────────────────────────────────────────────────────────────
Estimated cost                                             $3.48
Priced at deepseek-flash off-peak rates
```

The pill beside the composer keeps the shipped label (`578M tok · 99%`); the USD
estimate lives in the panel it opens.

## Where the numbers come from

| Figure | Source |
|---|---|
| Token buckets | the `tokenUsage` session projection — provider-reported usage over the complete durable log |
| Priced model | the `modelSelection` projection (`next`, else `lastUsed`) |
| Cost | tokens × rate ÷ 1M, per bucket, in `USD` |

Rates are DeepSeek's published prices, USD per 1M tokens. The bundle ships both
tiers and prices everything at **off-peak** (`TIER` in `client.js`):

| Model | Cache hit | Cache miss | Output |
|---|---|---|---|
| `deepseek-flash` (and the retired `deepseek-v4-flash*` aliases) — off-peak | 0.003 | 0.15 | 0.60 |
| `deepseek-flash` — peak | 0.006 | 0.30 | 1.20 |
| `deepseek-v4-pro` — off-peak | 0.022 | 0.66 | 1.98 |
| `deepseek-v4-pro` — peak | 0.044 | 1.32 | 3.96 |

Off-peak covers every hour outside 01:00–04:00 and 06:00–10:00 UTC on weekdays,
including whole weekends and Chinese public holidays. Cache writes are priced at
the cache-miss rate: DeepSeek caches automatically, so an uncached write is
billed as a miss.

To price at peak instead, set `const TIER = 'peak'` in `client.js`.

## What the estimate is and is not

- **One tier for the whole log.** The panel prices every token at the off-peak
  rate and says so in its caption; it does not read the clock per attempt, so the
  figure never jumps when a window boundary passes. A session that ran inside a
  peak window actually costs double the figure shown.
- **Session totals, not per-attempt billing.** The whole-log aggregate is priced
  with one rate row; a session that switched models mid-way is priced at its
  current model's rates.
- **The rows add up.** The total is the sum of the rounded per-bucket rows, so the
  visible arithmetic is exact even though each row is rounded.

## How it plugs in

`conversation.composer.dock` is a documented replacement point: registering the
shipped id `usage` at the shipped order `1` with a lower `priority` replaces that
cell. This bundle does exactly that, renders the same pill and the same token
rows (matching the host's markup and `--dsw-alias-*` theme tokens), and adds the
cost column and total row.

One consequence of replacing the cell: the host's *Performance & usage → Compact*
preference is a hook owned by the shipped registration, which an external plugin
cannot read. The pill therefore stays interactive in both modes, and Compact no
longer reduces it to a cache-hit-only reading.

## Files

| File | Role |
|---|---|
| `index.js` | Host half (no-op; composes the bundle) |
| `client.js` | All rendering, pricing, and locale dictionaries |
| `cordis.patch.yml` | Inserts the `usd-usage` row |
| `locale/en.json`, `locale/zh.json` | Plugin inventory title and description |
| `icon.svg` | Inventory artwork |
| `LICENSE` | GNU General Public License v3.0 or later |

## License

Copyright (C) 2026 azadix

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later
version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE. See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with
this program. If not, see <https://www.gnu.org/licenses/>.
