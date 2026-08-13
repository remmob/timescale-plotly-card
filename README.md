# Timescale Plotly Card

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/custom-components/hacs)

> ⚠️ This card is under development. Options may change between releases.

A custom Lovelace card for Home Assistant that charts historical data from a TimescaleDB database using Plotly. It reads through the [Timescale Database Reader](https://github.com/remmob/timescale_database_reader) integration, which fronts databases filled by [LTSS](https://github.com/freol35241/ltss) or [Scribe](https://github.com/jonathan-gatard/scribe).

## Features

- Interactive Plotly charts: zoom, pan, hover, download
- Line and bar charts, stacked or grouped, vertical or horizontal
- Time selector buttons, custom date range picker
- **Energy calendar mode**: today / week / month / year / multi-year, aligned to calendar boundaries
- Cross-card sync: one selector drives several charts
- Multiple series per card, each with its own entity, database, table, axis and styling
- Totals row per series with a grand total
- Automatic downsampling (~80 points per view by default)
- Auto-refresh
- Every colour, padding and radius is configurable

---

## Requirements

| | |
|---|---|
| **Reader integration** | [Timescale Database Reader](https://github.com/remmob/timescale_database_reader), installed and configured |
| **Database** | TimescaleDB 2.13+ with the minute tables from that repo's SQL in place |
| **Internet access** | the browser loads Plotly from `cdn.plot.ly` at render time |

**Set up the reader and its `sensor_minute` table first** — that is the difference between charts that render instantly and charts that time out.

If the machines viewing your dashboard have no internet access, host Plotly yourself and point the card at it:

```yaml
plotly_url: /local/plotly-2.27.0.min.js
```

---

## Installation

### HACS (recommended)

1. HACS → ⋮ → Custom repositories (older HACS versions: HACS → Frontend → ⋮)
2. URL: `https://github.com/remmob/timescale-plotly-card`, category: Dashboard (called Lovelace in older HACS versions)
3. Install, then hard-refresh the browser (Ctrl+Shift+R)

### Manual

1. Copy `timescale-plotly-card.js` to `config/www/community/timescale-plotly-card/`
2. Settings → Dashboards → Resources → add `/hacsfiles/timescale-plotly-card/timescale-plotly-card.js` as a JavaScript Module
3. Hard-refresh the browser

### After every update

**Hard-refresh the browser (Ctrl+Shift+R).** This applies to HACS updates too, not just manual ones. HACS replaces the file on disk, but the resource URL registered under Settings → Dashboards → Resources keeps whatever query string it already had — so the browser happily serves the version it cached under that unchanged URL, and you keep looking at the old card wondering why nothing changed.

To stop having to think about it, put a version query on the resource URL and bump it whenever you update:

```
/hacsfiles/timescale-plotly-card/timescale-plotly-card.js?v=20260813-01
```

Settings → Dashboards → Resources → click the resource → change the `?v=` value → save. The changed URL is a different URL as far as the browser is concerned, so the new file is fetched without any cache clearing.

If a change still does not show up, open the browser console: the card logs its version on load, which tells you immediately whether you are running the file you think you are.

---

## Quick start

### A line chart

```yaml
type: custom:timescale-plotly-card
title: Living room temperature
sensor_id: sensor.temperature_woonkamer
database: statistics
table: sensor_minute
default_range: 12h
downsample: 300
unit: °C
line_color: rgb(75,192,192)
fill_color: rgba(75,192,192,0.2)
```

### An energy bar chart

```yaml
type: custom:timescale-plotly-card
title: Electricity use
energy_mode: true
database: statistics
table: sensor_minute
default_range: today
bar_mode: stack
entities:
  - sensor_id: sensor.energy_hourly     # today  -> hourly meter
    daily: sensor.energy_daily          # week/month
    monthly: sensor.energy_monthly      # year
    yearly: sensor.energy_yearly        # years
    name: Total
    line_color: rgb(255,99,71)
```

---

## How energy mode picks its entity

In energy mode the selected range decides which of a series' entities is queried:

| Range | Entity used | Buckets |
|-------|-------------|---------|
| `today` | `sensor_id` | one per hour (`energy_bucket`) |
| `week`, `month` | `daily`, else `sensor_id` | one per day |
| `year` | `monthly`, else `yearly`, else `sensor_id` | one per month |
| `years` | `yearly`, else `monthly` | one per year |

If a series only sets `sensor_id` and its name ends in `_hourly`, the card will look for a matching `_daily` / `_monthly` entity and use it automatically when that entity exists in Home Assistant.

These are meant to be `utility_meter` entities with `cycle: hourly` / `daily` / `monthly` / `yearly` on the same source.

---

## Configuration reference

### Required

| Option | Type | Description |
|--------|------|-------------|
| `sensor_id` | string | Entity ID to chart. Required unless `entities` is used |
| `entities` | list | List of series objects. Required unless `sensor_id` is used |

### Data source

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `database` | string | first connection | Which reader connection to use, matched on database name or friendly name |
| `entry_id` | string | unset | Config entry ID of the reader connection. Takes precedence over `database` |
| `table` | string | connection default | Table or view to read, e.g. `sensor_minute` |
| `downsample` | number | auto (~80 points) | Bucket size in seconds |
| `downsample_method` | `avg` \| `last` | see note | Aggregation inside a bucket |
| `query_timeout_ms` | number | `20000` | Per-query timeout. `0` disables it |
| `max_query_span_seconds` | number | `31536000` | Long ranges are split into chunks of at most this length |

> `downsample_method` defaults to `last` for prefilled minute/aggregate tables and for cumulative energy sources, otherwise `avg`. Use `last` for anything counter-like: `avg` smears a counter reset across the bucket.

### Time selection (normal mode)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `show_time_selector` | boolean | `true` | Show the range buttons |
| `default_range` | string | `24h` | Initial range |
| `time_ranges` | list | `[1h,2h,3h,6h,12h,24h,custom]` | Which buttons to show. Any `<number>h` works, e.g. `48h` |
| `show_custom_button` | boolean | `true` | Show the Custom range button |
| `auto_refresh` | number | `300` | Refresh interval in seconds (`0` disables) |

### Energy calendar mode

Enable with `energy_mode: true` (or `time_mode: energy_calendar`). Ranges snap to calendar boundaries and the chart defaults to bars.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `energy_mode` | boolean | `false` | Enable energy calendar mode |
| `time_mode` | string | unset | `energy_calendar`, same effect |
| `energy_time_ranges` | list | `[today,month,year,week,years,custom]` | Which controls to show |
| `energy_bucket` | string | `1h` | Bucket size for `today` (`15m`, `1h`, `1d`) |
| `energy_year` | number | current | Initially selected year |
| `energy_month` | number | current | Initially selected month |
| `energy_day` | number | current | Initially selected day |
| `energy_week` | number | current | Initially selected ISO week |
| `energy_week_start` | number | `1` | `0`=Sunday … `6`=Saturday |
| `energy_years_count` | number | `8` | Number of years in the `years` range |
| `energy_years_offset` | number | `0` | Shift the `years` window back |
| `energy_downsample` | number | auto | Override the query bucket |
| `energy_source_type` | `delta` \| `cumulative` | auto | How to read the values. Auto: `cumulative` when `state_class` is `total_increasing` |
| `energy_cumulative_mode` | `last` \| `diff` | `last` | `last` takes the meter's end value per bucket (right for resetting `utility_meter`s), `diff` sums the increments |
| `energy_handle_reset` | boolean | `true` | Treat a decrease as a counter reset in `diff` mode |
| `energy_aggregate` | `sum` \| `last` \| `first` \| `avg` \| `min` \| `max` | auto | How several readings inside one bucket are combined. Overrides the inference above |
| `hide_zero_values` | boolean | `true` | Hide zero-value bar labels |

> **Charting something that is not additive?** Set `energy_aggregate: last`.
>
> Without it the card infers the mode from `state_class`: `total_increasing` means a counter (take the bucket's end value), anything else is treated as a delta and **summed**. That is right for energy, and wrong for a ratio. A COP or EER template sensor carries no `state_class`, so it falls into the delta branch. On the `today` range each bucket holds a single reading, so summing it changes nothing and the chart looks fine — but the `years` range queries raw rows, and a year of minute readings summed turns an EER of 5 into 2752.
>
> `last` takes the value at the end of the period, which is exactly what a running period ratio such as `sensor.yearly_eer_cooling` means. `avg` is the alternative if you want the mean over the bucket instead.

In energy mode `year` / `month` / `week` become dropdowns rather than plain buttons; `year` runs from 2020 to the current year and grows by itself.

### Cross-card sync

Without `sync_group` nothing changes. With it, one card can drive the range of others on the same view.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `sync_group` | string | unset | Group name |
| `sync_mode` | string | `both` | `master`, `follower`, `both`, `off` |
| `sync_role` | string | — | Alias of `sync_mode` |

Typical setup: the top card is `master` with `show_time_selector: true`, the rest are `follower` with `show_time_selector: false`.

### Series (`entities`)

Every option below is per series and falls back to the card-level value.

| Option | Type | Description |
|--------|------|-------------|
| `sensor_id` | string | **Required.** Entity ID |
| `entity` | string | Alias of `sensor_id` |
| `daily` / `monthly` / `yearly` | string | Entity used for the wider energy ranges |
| `name` | string | Name in legend and tooltip |
| `database` / `table` / `entry_id` | string | Data source override for this series |
| `downsample_method` | string | Aggregation override |
| `type` / `chart_type` | string | `line` or `bar` |
| `yaxis` | string | `left` or `right` |
| `unit` | string | Unit override |
| `tooltip_label_text` | string | Tooltip label |
| `line_color` / `color` | string | Line or bar colour |
| `fill_color` | string | Fill under the line |
| `fill` | boolean | Enable the fill |
| `line_width` | number | Line thickness |
| `line_shape` | string | `linear`, `spline`, `hv`, `vh`, `hvh`, `vhv` |
| `show_total_box` | boolean | Include this series in the totals row (default `true`) |
| `bar_value_text_color` / `bar_value_font_color` | string | Bar label colour |
| `binary_labels` | list | Two or more labels to render a binary/state series on a labelled axis |
| `state_map` | map | Translate text states to numbers, e.g. `{off: 0, on: 1}` |
| `energy_source_type` / `energy_source` | string | Per-series `delta` / `cumulative` |
| `energy_aggregate` | string | Per-series `sum` / `last` / `first` / `avg` / `min` / `max` |
| `energy_cumulative_mode`, `energy_handle_reset` | | Per-series energy overrides |
| `nan_as_zero`, `gap_drop_to_zero`, `gap_drop_min_points`, `connect_gaps`, `extend_edge_gaps` | | Per-series gap handling |
| `hide_zero_values` | boolean | Per-series zero-label suppression |
| `query_timeout_ms`, `max_query_span_seconds` | number | Per-series query limits |

### Chart appearance

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `chart_type` | string | `line` (`bar` in energy mode) | Default type for all series |
| `line_color` / `color` | string | palette | Default line colour |
| `line_width` | number | `2` | Line thickness |
| `line_shape` | string | `linear` | Line shape |
| `fill` | boolean | `true` | Fill under the line |
| `fill_color` / `fillcolor` | string | `rgba(75,192,192,0.2)` | Fill colour |
| `unit` | string | entity unit | Unit shown on the axis and in tooltips |
| `height` | number | `400` | Chart height in pixels |
| `y_margin` | number | `5` | Head- and footroom on the Y axis, **in data units**. The bottom clamps to 0 when the minimum sits between 0 and `y_margin` |
| `binary_labels` | list | unset | Render as a labelled state axis |
| `state_map` | map | unset | Map text states to numbers |

> `y_margin` is absolute, not a percentage. The default of `5` is meant for temperatures; on a kWh chart with values under 1 it leaves the bars squashed at the bottom. Use something like `0.1` there.

### Bars and totals

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `bar_mode` / `barmode` | string | `group` (`stack` in energy mode) | `stack`, `group`, `overlay`, `relative` |
| `bar_orientation` | string | `v` | `h` for horizontal bars |
| `bar_gap` | number | `0.15` (`0.05` energy) | Gap between bar slots |
| `bar_group_gap` | number | `0.08` | Gap within a group (only for `bar_mode: group`) |
| `show_bar_values` | boolean | `true` | Value labels on the bars |
| `bar_value_position` | string | `inside` | `inside` or `outside` |
| `bar_value_decimals` | number | `2` | Decimals in bar labels |
| `bar_value_min_width_px` | number | `28` | Below this width the label rotates |
| `bar_value_font_size` | number | `11` | Bar label size |
| `bar_value_text_color` / `bar_value_font_color` | string | `font_color` | Bar label colour |
| `show_grand_total` | boolean | `true` | Show the trailing `= total` box |
| `totals_decimals` | number | `bar_value_decimals` | Decimals in the totals boxes |
| `series_total_box_width` | string | `108px` | Width of each totals box |

> The totals row shows one box per visible **bar** series, then `= grand total`. `show_grand_total: false` removes only the last box. To hide the row completely, set `show_total_box: false` on every series.

### Gaps and missing data

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `nan_as_zero` | boolean | `false` | Treat NaN as 0 |
| `gap_drop_to_zero` | boolean | `false` | With `nan_as_zero`, draw vertical drops to 0 across gaps |
| `gap_drop_min_points` | number | `2` | Consecutive missing points before dropping to 0 |
| `connect_gaps` | boolean | `false` | Bridge gaps to keep one continuous line |
| `extend_edge_gaps` | boolean | `false` | Extend the first and last known value to the chart edges |

### Axes and layout

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `xaxis_title` | string | `Time` | X-axis title |
| `yaxis_title` | string | auto from unit | Left Y-axis title (`NaN` hides it) |
| `yaxis_title_left` / `yaxis_title_right` | string | auto | Per-axis override |
| `yaxis_title_position` | string | `top` | `top` renders titles above the scales, `axis` alongside them |
| `axis_title_offset_y` | string | `-18px` | Vertical offset of the top titles |
| `axis_title_offset_y_left` / `_right` | string | `axis_title_offset_y` | Per-side vertical offset |
| `axis_title_offset_left` / `axis_title_offset_right` | string | `0px` | Horizontal offset of the top titles |
| `grid_color` | string | `rgba(128,128,128,0.2)` | Grid line colour |
| `xaxis_tick_padding` / `yaxis_tick_padding` | number | `6` | Space between grid and tick labels |
| `margin_top` / `margin_right` / `margin_bottom` / `margin_left` | number | `50` / `60` / `40` / `50` | Plot margins |
| `paper_bg_color` / `paper_bgcolor` | string | `rgba(0,0,0,0)` | Background outside the plot |
| `plot_bg_color` / `plot_bgcolor` | string | `rgba(0,0,0,0)` | Background of the plot area |
| `font_color` | string | `var(--primary-text-color)` | Chart text colour |

### Data table and chart visibility

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `show_chart` | boolean | `true` | Render the chart. Set `false` for a table-only card |
| `show_table` | boolean | `false` | Render the raw query result as a table |
| `table_columns` | list | auto | Which columns to show, in order |
| `table_limit` | number | `200` | Maximum rows, newest first |

### Download

Applies to the modebar's download button.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `download_format` | string | `png` | `png`, `svg`, `jpeg`, `webp` |
| `download_filename` | string | card title | Filename without extension |
| `download_width` / `download_height` | number | `700` / `500` | Export size in pixels |
| `download_scale` | number | `2` | Resolution multiplier |
| `download_theme` | string | chart theme | `light` or `dark`, so exports stay readable on a dark dashboard |

### Status text and tooltip

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `show_status_text` | boolean | `true` | Show the status line under the chart |
| `status_text_color` | string | secondary text | Status text colour |
| `status_text_size` | string | `12px` | Status text size |
| `status_text_padding` | string | `8px 16px` | Status text padding |
| `status_text_weight` | string | `normal` | Status text weight |
| `tooltip_label_text` | string | friendly name | Label in tooltip and status text |
| `tooltip_bg_color` / `tooltip_bg` | string | `rgba(0,0,0,0.9)` | Tooltip background |
| `tooltip_text_color` / `tooltip_text` | string | `#fff` | Tooltip text colour |
| `tooltip_border_color` / `tooltip_border` | string | `rgba(255,255,255,0.2)` | Tooltip border |
| `tooltip_z_index` | number | `9998` | Tooltip stacking order |
| `hover_line_color` | string | `rgba(120,120,120,0.8)` | Colour of the crosshair line |

### Selector and button styling

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `selector_background_color` | string | card bg | Selector bar background |
| `button_background_color` | string | primary bg | Button background |
| `button_border_color` | string | divider | Button border |
| `button_text_color` | string | primary text | Button text |
| `button_radius` | string | `4px` | Button radius |
| `button_hover_color` | string | secondary bg | Hover background |
| `button_hover_text_color` | string | `button_text_color` | Hover text |
| `button_active_color` | string | primary colour | Active background and border |
| `button_active_text_color` | string | `white` | Active text |
| `select_background_color` | string | `button_background_color` | Background of the energy dropdowns |
| `select_border_color` | string | `button_border_color` | Dropdown border |
| `select_text_color` | string | `button_text_color` | Dropdown text |
| `select_active_background_color` | string | `button_active_color` | Active dropdown background |
| `select_active_border_color` | string | `button_active_color` | Active dropdown border |
| `select_active_text_color` | string | `button_active_text_color` | Active dropdown text |
| `select_option_background_color` | string | `select_background_color` | Option background |
| `select_option_text_color` | string | `select_text_color` | Option text |
| `select_label_color` | string | `button_text_color` | Label next to a dropdown |

### Custom range and date inputs

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `custom_range_background_color` | string | card bg | Custom range bar background |
| `custom_range_border_color` | string | divider | Top border |
| `custom_range_text_color` | string | primary text | Label colour |
| `custom_range_label_size` | string | `13px` | Label size |
| `date_input_background_color` | string | primary bg | Input background |
| `date_input_border_color` | string | divider | Input border |
| `date_input_text_color` | string | primary text | Input text |
| `date_input_padding` | string | `4px 8px` | Input padding |
| `date_input_radius` | string | `4px` | Input radius |
| `date_input_size` | string | `13px` | Input font size |
| `date_input_accent_color` | string | primary colour | Accent colour |
| `date_input_scheme` | string | `dark` | Browser popup scheme |
| `date_input_focus_color` | string | `rgba(3,169,244,0.4)` | Focus ring |
| `date_input_caret_color` | string | input text | Caret colour |
| `date_input_field_background_color` | string | `transparent` | Inner field background |
| `date_picker_icon_filter` | string | `invert(0.9)` | CSS filter on the picker icon |
| `date_picker_icon_opacity` | string | `0.8` | Picker icon opacity |
| `apply_button_padding` | string | `6px 16px` | Apply button padding |
| `apply_button_background_color` | string | primary colour | Apply background |
| `apply_button_border_color` | string | `transparent` | Apply border |
| `apply_button_text_color` | string | `white` | Apply text |
| `apply_button_radius` | string | `4px` | Apply radius |
| `apply_button_size` | string | `13px` | Apply font size |
| `apply_button_hover_color` | string | primary colour | Apply hover background |
| `apply_button_hover_filter` | string | `brightness(1.05)` | Apply hover filter |

### Modebar

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `show_modebar` | boolean | `true` | Show the Plotly toolbar |
| `modebar_bg_color` / `modebar_bgcolor` / `modebar_bg` | string | `rgba(255,255,255,0.9)` | Toolbar background |
| `modebar_radius` | string | `4px` | Toolbar radius |
| `modebar_icon_color` | string | primary text | Icon colour |
| `modebar_icon_hover_color` | string | primary colour | Icon hover colour |
| `modebar_icon_active_color` | string | primary colour | Icon active colour |

The toolbar offers download, box zoom, zoom in, zoom out and reset axes.

### Advanced

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `plotly_url` | string | `https://cdn.plot.ly/plotly-2.27.0.min.js` | Where Plotly is loaded from. Point it at a local copy for installations without internet access |
| `show_debug_overlay` / `debug_overlay` | boolean | `false` | Overlay showing each loading step, the resolved entities and the query parameters |
| `show_version_banner` | boolean | `false` | Show the card version in the header |

### Short aliases

Older configs may use these. The `_color` form always wins.

`button_color` → `button_background_color` · `button_text` → `button_text_color` · `button_border` → `button_border_color` · `button_active` → `button_active_color` · `button_active_text` → `button_active_text_color` · `button_hover_text` → `button_hover_text_color` · `selector_background` → `selector_background_color` · `choice_background_color` → `select_background_color` · `custom_range_background` / `_border` / `_text` · `date_input_background` / `_border` / `_text` / `_accent` / `_caret` / `_focus` / `_field_background` · `apply_button_background` / `_border` / `_text` / `_hover` · `tooltip_bg` / `_text` / `_border` · `modebar_icon_hover` / `_active` · `paper_bgcolor`, `plot_bgcolor`, `fillcolor`, `barmode`

---

## Examples

### Two series, one on the right axis

```yaml
type: custom:timescale-plotly-card
title: Climate living room
database: statistics
table: sensor_minute
default_range: 12h
entities:
  - sensor_id: sensor.temperature_woonkamer
    name: Temperature
    unit: °C
    line_color: rgb(255,99,132)
  - sensor_id: sensor.humidity_woonkamer
    name: Humidity
    unit: '%'
    yaxis: right
    line_color: rgb(54,162,235)
```

### A binary sensor as a state chart

```yaml
type: custom:timescale-plotly-card
title: Pump
sensor_id: binary_sensor.transportpomp_running
database: statistics
table: sensor_minute
default_range: 24h
downsample_method: last
binary_labels: [off, on]
state_map:
  'off': 0
  'on': 1
line_shape: hv
```

### Synced energy dashboard

Three charts driven by one selector. The first carries the buttons and the totals row, the other two follow.

```yaml
type: custom:vertical-stack-in-card
cards:
  - type: custom:timescale-plotly-card
    title: Electricity use
    energy_mode: true
    database: statistics
    table: sensor_minute
    default_range: today
    energy_time_ranges: [today, week, month, year, years, custom]
    downsample_method: last
    bar_mode: stack
    sync_group: heatpump_stats_sync
    sync_mode: master
    show_time_selector: true
    show_grand_total: true
    y_margin: 0.1
    height: 300
    entities:
      - sensor_id: sensor.heatpump_electrical_heating_hourly
        daily: sensor.heatpump_electrical_heating_daily
        monthly: sensor.heatpump_electrical_heating_monthly
        yearly: sensor.heatpump_electrical_heating_yearly
        name: Heating
        line_color: rgb(255,99,71)
      - sensor_id: sensor.heatpump_electrical_cooling_hourly
        daily: sensor.heatpump_electrical_cooling_daily
        monthly: sensor.heatpump_electrical_cooling_monthly
        yearly: sensor.heatpump_electrical_cooling_yearly
        name: Cooling
        line_color: rgb(30,144,255)

  - type: custom:timescale-plotly-card
    title: COP / EER
    energy_mode: true
    database: statistics
    table: sensor_minute
    default_range: today
    bar_mode: group
    sync_group: heatpump_stats_sync
    sync_mode: follower
    show_time_selector: false
    show_grand_total: false
    entities:
      - sensor_id: sensor.hourly_cop_heating
        daily: sensor.daily_cop_heating
        monthly: sensor.monthly_cop_heating
        yearly: sensor.scop_heating
        name: COP heating
        line_color: rgb(255,99,71)
        show_total_box: false
```

> Ratios such as COP and EER are not additive, so switch the totals off on those cards: `show_grand_total: false` plus `show_total_box: false` per series.

---

## Troubleshooting

### The card does not load, or an update changed nothing
Hard-refresh (Ctrl+Shift+R) and check the browser console — the card logs its version on load, so you can see straight away which file you are actually running. Verify the resource is registered under Settings → Dashboards → Resources.

If the version in the console is still the old one after a HACS update, it is the resource URL: HACS replaced the file but the URL did not change, so the browser serves its cached copy. Bump the `?v=` on the resource URL. See [After every update](#after-every-update).

### No data at all
1. Does `sensor_id` match an entity that the database actually records?
2. Does the range contain data? Newly added entities have no history before the moment they were added.
3. Check the Home Assistant log for `[WEBSOCKET]` errors from the reader.
4. Verify `database` matches a configured reader connection — if it does not, the card silently falls back to the first one.

### Every bar is zero while the database has values
Almost always a `state` / `value` mix-up. In Scribe's minute tables the text `state` of a numeric sensor is the placeholder `'0'` and only `value` carries the number. The card reads the numeric column first; if you are querying the reader yourself, do the same. This was a genuine card bug up to 1.1.1, fixed in 2.0.0.

### Bars are squashed against the bottom
`y_margin` is in data units, not a percentage. Lower it for small-valued series.

### Counter bars look too low, and a value shows up one bucket late
The prefilled minute table lags the continuous aggregate by a minute or two, so a `utility_meter` reset at `:00` lands a couple of minutes later. Every hourly bucket then samples the meter slightly too early. See "Keeping the minute table in step with reality" in the [reader README](https://github.com/remmob/timescale_database_reader).

### A ratio explodes on the year or years range
The card is summing it. Set `energy_aggregate: last` on that card or series — see [Energy calendar mode](#energy-calendar-mode). The give-away is that `today` looks right while the wider ranges do not: short buckets hold one reading each, so the sum equals it.

### An hourly ratio shows an absurd value
Dividing two counters that both reset on the clock hour goes wrong when a cycle straddles the boundary: the tail of a run lands in the next period with almost no input energy against it. Guard the template that computes the ratio with a minimum energy per period and a plausible upper bound — this is not something the card can fix.

### Queries time out
You are probably querying a LOCF view such as `sensor_minute_scribe`. Switch to `table: sensor_minute`.

---

## Support

Issues and feature requests: [GitHub issue tracker](https://github.com/remmob/timescale-plotly-card/issues).

## Credits

Built with [Plotly.js](https://plotly.com/javascript/) for [Home Assistant](https://www.home-assistant.io/), on top of [TimescaleDB](https://www.timescale.com/).

---
©2026 Bommer Software | Author: Mischa Bommer
