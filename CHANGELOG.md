## Changelog

### 2.1.1 (2026-08-13)

**Fixed**

- The navigation listener was never removed. It is registered on
  `location-changed` but `disconnectedCallback` removed it from `popstate`, so
  every mount left another live handler behind. Each one calls `loadData()` on
  every navigation, so a view that is navigated into repeatedly — a shared graph
  template driven by `?entity=` — fired one extra query per past visit and got
  progressively slower for the lifetime of the page.

### 2.1.0 (2026-08-13)

**Added**

- `energy_aggregate` (card level and per series): `sum`, `last`, `first`, `avg`,
  `min` or `max`. Controls how several readings inside one energy bucket are
  combined, overriding the mode inferred from `state_class`.

**Fixed**

- Series that are not additive were summed on the wider energy ranges. The mode
  is inferred from `state_class`, and anything that is not `total_increasing`
  falls into the delta branch, which adds the readings up. A COP or EER template
  sensor carries no `state_class`, so on the `years` range — which queries raw
  rows rather than downsampled buckets — a year of minute readings was summed
  into a single bar, turning an EER of 5 into 2752. The `today` range hid the
  problem because each bucket holds a single reading.

  Set `energy_aggregate: last` on such a series. The inference is unchanged for
  everything else, so existing configurations keep their current behaviour.

### 2.0.0 (2026-08-13)

**Energy calendar mode**

A new charting mode aligned to calendar boundaries instead of rolling hours,
built for `utility_meter` style counters.

- `energy_mode: true` (or `time_mode: energy_calendar`) switches the selector to
  today / week / month / year / years, with year, month and week as dropdowns
- Per series, `daily`, `monthly` and `yearly` name the entity to use for the
  wider ranges; a `_hourly` entity resolves its `_daily` / `_monthly` sibling
  automatically when one exists
- `energy_source_type`, `energy_cumulative_mode` and `energy_handle_reset`
  control how counters are read, inferred from `state_class` by default
- Bar charts by default in this mode, with `bar_mode`, `bar_orientation`,
  `bar_gap` and `bar_group_gap`
- Totals row per series with a grand total: `show_grand_total`,
  `show_total_box`, `totals_decimals`, `series_total_box_width`

**Cross-card sync**

- `sync_group` with `sync_mode: master` / `follower` / `both` / `off` lets one
  selector drive several charts

**Other additions**

- `state_map` and `binary_labels` for text and binary entities
- `show_table`, `table_columns` and `table_limit` to render the raw result
- `show_chart: false` for a table-only card
- Download options: `download_format`, `download_theme`, `download_width`,
  `download_height`, `download_scale`, `download_filename`
- `query_timeout_ms` and `max_query_span_seconds`; long ranges are chunked
- `plotly_url` to load Plotly from somewhere other than the CDN
- `show_debug_overlay` showing each loading step and the resolved query

**Fixed**

- Energy mode read the text `state` column before the numeric one. In a
  prefilled minute table the text state of a numeric sensor is the placeholder
  `'0'`, so every bucket resolved to zero and all bars rendered flat. It now
  prefers the numeric column, matching the non-energy code path, and falls back
  to `state` only when a `state_map` has to translate it.

**Documentation**

- README rewritten as a complete reference: every option the card reads is
  documented, options that no longer exist (`days`, `refresh_interval`,
  `show_toolbar`, `hover_bg_color`) removed, duplicated sections merged, and
  aliases collected in one place

### 1.0.0 (2026-01-28)

**Initial Release**

Features:
- Interactive Plotly charts with zoom, pan, and hover tooltips
- Direct TimescaleDB queries via websocket API
- Configurable time ranges (1-365 days)
- Automatic downsampling for performance
- Customizable colors, line width, and fill
- Auto-refresh support
- Dark mode compatible
- Multiple sensors per card support
- Y-axis unit labels
- Responsive design

Configuration options:
- `sensor_id`: Entity ID to query from TimescaleDB
- `title`: Card title
- `name`: Series name in legend
- `days`: Number of days to display (1-365)
- `downsample`: Aggregation interval in seconds
- `height`: Chart height in pixels
- `color`: Line color (RGB format)
- `fillcolor`: Fill area color (RGBA format)
- `unit`: Y-axis unit label
- `line_width`: Line thickness
- `fill`: Enable/disable area fill
- `refresh_interval`: Auto-refresh in seconds
- `show_toolbar`: Show/hide Plotly toolbar
