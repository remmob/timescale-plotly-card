## Changelog

### 2.2.0 (2026-08-28)

**Fixed**

- The navigation listener leak that 2.1.1 tried to remove and 2.1.2 reverted. The listener is
  registered on `location-changed` but the cleanup removed `popstate`, so nothing was ever released
  and every remount added another handler, each calling `loadData()` on every navigation.

  Both halves are now correct. The handler is built once and reused, so `addEventListener` on
  reattach is a no-op and the element holds at most one listener; the cleanup removes the event it
  actually registered. Because `location-changed` fires while the element is detached, the card also
  catches up on reattach: `navReloadKey()` resolves the entity the drawn graph belongs to, and a
  reload only happens when the URL now names a different one. A shared graph template that changes
  only its `?entity=` query string keeps working — the behaviour 2.1.2 protected — without the leak
  that came with it.

**Added**

- `number_locale`. Numbers in bar labels, totals boxes, stack totals and tooltips now follow the
  locale of whoever is looking at the card instead of always printing a dot as the decimal mark. A
  dot is a thousands separator to most of Europe, so `0.25` euro read as twenty-five. Leave the
  option out and the browser's own locale is used; set it (`nl-NL`, `en-GB`) to force one.

  Two side effects worth knowing about. Trailing zeros are no longer trimmed — `0.25` used to
  collapse to `0.2` in some places, and with a locale the trimming regex would eat part of a
  thousands group. And numbers above 999 now carry a grouping separator.

- `show_stack_total` (default `false`), with `stack_total_decimals`, `stack_total_font_size` and
  `stack_total_text_color`. Draws the total of a stacked bar just above it. The per-segment labels
  say how big each part is, which leaves the question the chart is usually about — what does this
  bucket come to — unanswered. Only applies when `bar_mode` resolves to `stack`; horizontal bars put
  the label to the right of the stack instead.

- Stacked bars are now measured by the height of the stack when the y-axis range is calculated.
  The range was pooled from the individual series values, so a stack reaching 0.25 with no single
  component above 0.10 had its top cut off as soon as `y_margin` was small enough to matter.
  Positive and negative bars are added up per bucket, the way Plotly draws them.

- `totals_aggregate` (`sum` by default, `avg` optional). The totals boxes add the bars up, which is
  right for energy but meaningless for a price per kWh or a temperature: adding up twenty-four
  hourly tariffs produces a number nobody can use. With `avg` every box shows the average over the
  buckets that hold a value.

  Buckets without a value are skipped instead of counted as zero, so a day in progress is not
  dragged down by the hours still to come. The trailing box keeps summing the boxes before it, so
  the components of a stacked chart still add up to the average total.

- `table_summarize` (`max` or `min`, off by default). The data table renders the raw query result,
  which is grouped by the bucket the selected range produces — a week yields daily buckets, so every
  series shows up seven times. With this option the table keeps one row per series: the one with the
  highest or lowest value in the range.

  The whole row is kept, so extra columns from the view (a formatted timestamp, a duration) belong
  to that same peak. Rows are listed in `entities` order rather than by time, since with one row per
  series that is the meaningful ordering.

- `hide_empty_series` (default `false`). In `bar_mode: group` Plotly divides every slot over all
  traces it receives, including the ones without content, which makes the remaining bars
  unnecessarily narrow. With this option on, such a series is hidden and no longer takes up a slot.

  A series counts as empty when it has no rows, or when every value in the range is zero. That
  second case is the one that matters in practice: a utility meter for a mode that did not run still
  reports a value every minute, it just reads `0`, so the internal `hasData` flag is `true`.

  The legend and the totals boxes are untouched: those follow the card's own legend state, so an
  empty series still shows up with its `0` box. That distinction matters — otherwise you cannot tell
  whether a series ran and produced nothing, or is not being logged at all.

### 2.1.2 (2026-08-13)

**Reverted**

- 2.1.1 removed the navigation listener on disconnect. That listener is what
  reloads a shared graph template when only the `?entity=` query string changes,
  and removing it left such a view showing the previously selected entity. The
  2.1.0 behaviour is restored.

  The underlying issue 2.1.1 tried to solve is real — the listener is registered
  on `location-changed` but was removed from `popstate`, so handlers accumulate
  across remounts and each one calls `loadData()` on every navigation. Fixing it
  needs the reload path reworked so it does not depend on a listener surviving
  disconnect. Until then the leak is the lesser problem: a view that works and
  gets slower beats a view that shows the wrong entity.

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
