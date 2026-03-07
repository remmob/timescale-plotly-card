# Timescale Plotly Card

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/custom-components/hacs)

 > **Note:**  <span style="font-size: 2em">⚠️</span> This card is under development. Features and options may change frequently.


A custom Lovelace card for Home Assistant that displays Timescale database historical data using interactive Plotly charts.

## Features

- 📊 Interactive Plotly charts with zoom, pan, hover, and download
- ⏱️ Time selector buttons (1u, 2u, 3u, 6u, 12u, 24u, Custom)
- 📅 Custom date range picker
- ⚡ Automatic smart downsampling (default: ~80 points per view)
- 🎨 Fully customizable CSS styling
- 🔄 Auto-refresh support (default: 300 seconds, configurable)
- 💾 Direct TimescaleDB queries via WebSocket
- 🎯 Crosshair and hover tooltips
- 📈 Auto-scaling Y-axis with configurable margins

<!-- BEGIN:ENERGY-SELECTOR-HIGHLIGHT -->
## ⚡ Quick Highlight: Energy Selector Changes (remove block if needed)

This block is intentionally marked so it can be removed easily later.

### What changed
- In energy mode, `week`, `month`, and `year` are selection controls.
- `year` shows `2020` → current year (auto-adds new year automatically).
- `month` and `week` follow the selected year.
- `custom` is controlled per card by one property: `show_custom_button`.

### New/updated options
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `energy_time_ranges` | list | `[today, week, month, year, custom]` | Time controls used in energy mode |
| `show_custom_button` | boolean | `true` | Show/hide Custom (works per card, also in energy mode) |
| `select_background_color` | string | button bg | Background of year/month/week select controls |
| `select_border_color` | string | button border | Border color of select controls |
| `select_text_color` | string | button text | Text color of select controls |
| `select_active_background_color` | string | active button bg | Active select background |
| `select_active_border_color` | string | active button border | Active select border |
| `select_active_text_color` | string | active button text | Active select text |
| `select_option_background_color` | string | select bg | Dropdown option background |
| `select_option_text_color` | string | select text | Dropdown option text |
| `select_label_color` | string | button text | Color of selector labels (e.g. Jaar/Maand/Week) |
| `show_bar_values` | boolean | `true` | Show value labels on energy bar charts (0-values stay hidden by default) |
| `bar_value_position` | string | `inside` | Position of bar value labels: `inside` or `outside` |
| `bar_value_decimals` | number | `2` | Number of decimals in bar value labels |
| `bar_value_min_width_px` | number | `28` | Minimum bar width for horizontal label; otherwise vertical |
| `bar_value_font_size` | number | `11` | Bar value label font size |
| `bar_value_text_color` | string | `bar_value_font_color` | Preferred bar value label text color alias |
| `bar_value_font_color` | string | `font_color` | Bar value label text color |
| `totals_decimals` | number | `bar_value_decimals` | Decimals used in totals boxes |
| `series_total_box_width` | string | `108px` | Fixed width of each totals box |

### Example (energy)
```yaml
type: custom:timescale-plotly-card
title: Energie
energy_mode: true
time_mode: energy_calendar
default_range: today
energy_time_ranges: [today, week, month, year]
show_custom_button: false

show_bar_values: true
bar_value_position: inside
bar_value_text_color: var(--primary-text-color)
totals_decimals: 2
series_total_box_width: 108px

select_background_color: var(--primary-background-color)
select_text_color: var(--primary-text-color)

entities:
   - sensor_id: sensor.energy_hourly
      daily: sensor.energy_daily
      monthly: sensor.energy_monthly
```
<!-- END:ENERGY-SELECTOR-HIGHLIGHT -->

## Requirements

> **Note:** The Timescale database Reader integration supports any TimescaleDB database. using the `ltss` table (from the [LTSS integration](https://github.com/freol35241/ltss)) and with [Scribe](https://github.com/jonathan-gatard/scribe). 
See also the Timescale Database Reader [README](https://github.com/remmob/timescale_database_reader) 

## Installation

### HACS (Recommended)

1. Add this repository as a custom repository in HACS:
   - Go to HACS → Frontend
   - Click ⋮ → Custom repositories
   - Add URL: `https://github.com/remmob/timescale-plotly-card`
   - Category: Lovelace
2. Click Install
3. Refresh browser (Ctrl+Shift+R)

### Manual

1. Copy `timescale-plotly-card.js` to `config/www/community/timescale-plotly-card/`
2. Add resource in Home Assistant:
   - Settings → Dashboards → Resources
   - Add `/hacsfiles/timescale-plotly-card/timescale-plotly-card.js` as JavaScript Module
3. Refresh browser (Ctrl+Shift+R)

## Basic Configuration

```yaml
type: custom:timescale-plotly-card
sensor_id: sensor.temperature_woonkamer
title: Temperatuur Woonkamer

# Time selection
show_time_selector: true
default_range: 24h
auto_refresh: 300

# Data
downsample: 300
y_margin: 5
height: 400

# Chart styling
line_color: rgb(75, 192, 192)
line_width: 2
fill_color: rgba(75, 192, 192, 0.2)
unit: °C

# Axes
xaxis_title: Tijd
yaxis_title: Temperatuur
grid_color: rgba(128,128,128,0.2)

# Modebar
show_modebar: true
modebar_bg_color: rgba(255,255,255,0.9)
modebar_radius: 4px
```

## Modebar Icons

The toolbar in the top-right corner provides:
- 📷 **Download**: Save chart as PNG image
- 🔍 **Zoom**: Box select to zoom in
- ➕ **Zoom In**: Zoom in to center
- ➖ **Zoom Out**: Zoom out from center
- 🏠 **Reset**: Reset axes to original view

## Troubleshooting

### Card doesn't load
1. Clear browser cache (Ctrl+Shift+R)
2. Check browser console for errors
3. Verify resource is registered in HA

### No data shown
1. Check `sensor_id` matches entity in TimescaleDatabase
2. Verify time range has data
3. Check Home Assistant logs for websocket errors

## Credits

- Built with [Plotly.js](https://plotly.com/javascript/)
- Integrates with [TimescaleDB](https://www.timescale.com/)
- For [Home Assistant](https://www.home-assistant.io/)

### Required Options

| Option | Type | Description |
|--------|------|-------------|
| `sensor_id` | string | **Required** when `entities` is not used. Entity ID from TimescaleDB |
| `entities` | list | **Required** when `sensor_id` is not used. List of series objects |

### Time Selection

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `show_time_selector` | boolean | `true` | Show time range buttons |
| `default_range` | string | `24h` | Initial range: `1h`, `2h`, `3h`, `6h`, `12h`, `24h`, `custom` |
| `time_ranges` | list | `[1h,2h,3h,6h,12h,24h,custom]` | Which buttons to show (e.g. `48h`, `72h`). <br>**Tip:** You can add any hour interval you want, such as `4h`, `5h`, `10h`, etc. The card supports all valid numbers followed by `h`  |
| `show_custom_button` | boolean | `true` | Show or hide the Custom range button (optional if `custom` is omitted from `time_ranges`) |
| `auto_refresh` | number | `300` | Auto-refresh interval in seconds (0 = disabled) |

### Cross-Card Sync (Optional)

If you do not use sync, do nothing. Without `sync_group`, behavior stays exactly the same as before.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `sync_group` | string | unset | Group name used to sync time/range state between cards |
| `sync_mode` | string | `both` | Sync role: `master`, `follower`, `both`, `off` |
| `sync_role` | string | `both` | Alias of `sync_mode` |

Example master/follower setup:

```yaml
type: custom:timescale-plotly-card
title: Energie master
sync_group: energie_sync
sync_mode: master
show_time_selector: true
```

```yaml
type: custom:timescale-plotly-card
title: Energie follower
sync_group: energie_sync
sync_mode: follower
show_time_selector: false
```

### Energy Calendar Mode

Energy calendar mode can be enabled with either `energy_mode: true` or `time_mode: energy_calendar`.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `time_mode` | string | unset | Set to `energy_calendar` to enable energy calendar behavior |
| `energy_mode` | boolean | `false` | Alternative way to enable energy calendar mode |
| `energy_time_ranges` | list | `[today,month,year,week,years,custom]` | Selector options in energy mode |
| `energy_year` | number | current year | Initial selected year |
| `energy_month` | number | current month | Initial selected month |
| `energy_day` | number | current day | Initial selected day |
| `energy_week` | number | current ISO week | Initial selected week |
| `energy_bucket` | string | `1h` | Bucket size for `today`/fixed views (`m`, `h`, `d`, for example `15m`, `1h`, `1d`) |
| `energy_week_start` | number | `1` | Start of week (`0`=Sunday, `1`=Monday, ... `6`=Saturday) |
| `energy_years_count` | number | `8` | Number of years in `years` range |
| `energy_years_offset` | number | `0` | Offset for `years` range window |
| `energy_downsample` | number | auto | Query downsample override in energy mode |
| `energy_source_type` | string | auto | `delta` or `cumulative` interpretation for energy values |
| `energy_cumulative_mode` | string | `last` | Cumulative handling mode |
| `energy_handle_reset` | boolean | `true` | Handle counter reset behavior in cumulative sources |

### Data Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `downsample` | number | auto | Downsample interval in seconds. Auto: ~80 points |
| `table` | string | integration default table | Override table/view name used by Timescale Database Reader |
| `downsample_method` | string | `avg` | Downsample aggregation: `avg` or `last` |
| `y_margin` | number | `5` | Y-axis margin above/below data values (bottom margin is 0 when min is between 0 and `y_margin`) |
| `height` | number | `400` | Chart height in pixels |
| `nan_as_zero` | boolean | `false` | Treat NaN values as 0 in the series |
| `gap_drop_to_zero` | boolean | `false` | When `nan_as_zero` is true, draw vertical drops to 0 over gaps (keeps linear tops) |
| `gap_drop_min_points` | number | `2` | Minimum consecutive missing points before dropping to 0 |
| `connect_gaps` | boolean | `false` | Connect gaps to keep a continuous line (ignored if `gap_drop_to_zero` is true) |
| `extend_edge_gaps` | boolean | `false` | Extend first/last known value to chart edges so lines can start/end without edge gaps |
| `chart_type` | string | `line` | Chart type: `line` or `bar` |
| `show_bar_values` | boolean | `true` | Show value labels on bar charts (0-values stay hidden by default) |
| `bar_value_position` | string | `inside` | Label position for bar values: `inside` or `outside` |
| `bar_value_decimals` | number | `2` | Number of decimals shown in bar labels |
| `bar_value_min_width_px` | number | `28` | Minimum bar width for horizontal label (else vertical) |
| `bar_value_font_size` | number | `11` | Bar label font size |
| `bar_value_text_color` | string | `bar_value_font_color` | Preferred bar label text color alias |
| `bar_value_font_color` | string | `font_color` | Bar label text color |
| `totals_decimals` | number | `bar_value_decimals` | Decimals used in totals boxes |


<br/><br/>
This works without extra options; the chart will show all minute data as bars.

`nan_as_zero`, `gap_drop_to_zero`, `gap_drop_min_points`, `connect_gaps`, and `extend_edge_gaps` can also be set per series in `entities`. If not set on a series, the global card-level value is used.

Tip: for prefilled minute tables/views (for example `sensor_minute_ltss`), use `downsample_method: last` to preserve edge transitions (such as return to 0) inside each downsample bucket.

### Tooltip & Status Text

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `tooltip_label_text` | string | friendly name | Label used in tooltip and status text |

### Multiple Entities (Series)

You can show multiple entities in a single chart using `entities`. Each series can have its own color and label.

```yaml
type: custom:timescale-plotly-card
title: Klimaat woonkamer
entities:
   - sensor_id: sensor.temperature_woonkamer
      name: Temperatuur
      line_color: rgb(255, 99, 132)
      fill_color: rgba(255, 99, 132, 0.2)
   - sensor_id: sensor.humidity_woonkamer
      name: Luchtvochtigheid
      line_color: rgb(54, 162, 235)
      fill_color: rgba(54, 162, 235, 0.2)
```

#### Entity options

| Option | Type | Description |
|--------|------|-------------|
| `sensor_id` | string | **Required**. Entity ID for this series |
| `table` | string | Optional table/view override for this series |
| `downsample_method` | string | Optional aggregation override: `avg` or `last` |
| `name` | string | Series name in legend and tooltip |
| `line_color` | string | Line color for this series |
| `fill_color` | string | Fill color for this series |
| `fill` | boolean | Enable/disable fill for this series |
| `line_width` | number | Line thickness for this series |
| `line_shape` | string | Line shape (`linear`, `spline`, `hv`, `vh`, `hvh`, `vhv`) |
| `unit` | string | Unit override for this series |
| `tooltip_label_text` | string | Tooltip label override for this series |
| `yaxis` | string | `left` or `right` (use `right` for separate scale) |
| `type` | string | `line` or `bar` for this series |
| `show_total_box` | boolean | Show/hide this series in totals boxes row (default: `true`) |
| `nan_as_zero` | boolean | Override NaN-to-zero handling for this series (falls back to global setting) |
| `gap_drop_to_zero` | boolean | Override gap drop-to-zero behavior for this series (falls back to global setting) |
| `gap_drop_min_points` | number | Override minimum consecutive missing points before dropping to 0 (falls back to global setting) |
| `connect_gaps` | boolean | Override gap connection behavior for this series (falls back to global setting) |
| `extend_edge_gaps` | boolean | Override edge-gap extension for this series (falls back to global setting) |

Example per-series override:

```yaml
type: custom:timescale-plotly-card
nan_as_zero: true
gap_drop_to_zero: true
extend_edge_gaps: true
entities:
   - sensor_id: sensor.temperature_woonkamer
      name: Temperatuur woonkamer
      nan_as_zero: false
      gap_drop_to_zero: false
      gap_drop_min_points: 6
      connect_gaps: true
      extend_edge_gaps: true
   - sensor_id: sensor.amber_4h_average_ambient_temperature
      name: Buiten temp 4h gemiddelde
```

### Chart Styling

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `line_color` | string | `rgb(75,192,192)` | Line color |
| `line_width` | number | `2` | Line thickness |
| `fill_color` | string | `rgba(75,192,192,0.2)` | Fill color under line |
| `fill` | boolean | `true` | Enable area fill under line |
| `unit` | string | `''` | Y-axis unit label |

### Layout Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `margin_top` | number | `50` | Top margin |
| `margin_right` | number | `60` | Right margin |
| `margin_bottom` | number | `40` | Bottom margin |
| `margin_left` | number | `50` | Left margin |

### Axis Styling

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `xaxis_title` | string | `Time` | X-axis title |
| `yaxis_title` | string | auto | Left Y-axis title (set to `NaN` to hide) |
| `yaxis_title_left` | string | auto | Left Y-axis title override (set to `NaN` to hide) |
| `yaxis_title_right` | string | auto | Right Y-axis title override (set to `NaN` to hide) |
| `yaxis_title_position` | string | `axis` | `axis` (default) or `top` to show titles above scales |
| `axis_title_offset_y` | string | `-18px` | Vertical offset for top titles |
| `axis_title_offset_left` | string | `0px` | Horizontal offset for left top title |
| `axis_title_offset_right` | string | `0px` | Horizontal offset for right top title |
| `grid_color` | string | rgba | Grid line color |
| `xaxis_tick_padding` | number | `6` | Space between grid and bottom tick labels |
| `yaxis_tick_padding` | number | `6` | Space between grid and left tick labels |

### Selector & Button Styling

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `selector_background_color` | string | card bg | Time selector bar background |
| `button_background_color` | string | primary bg | Time button background |
| `button_border_color` | string | divider | Time button border |
| `button_text_color` | string | primary text | Time button text color |
| `button_radius` | string | `4px` | Time button border radius |
| `button_hover_color` | string | secondary bg | Hover background color |
| `button_hover_text_color` | string | button_text_color | Hover text color |
| `button_active_color` | string | primary color | Active button background/border |
| `button_active_text_color` | string | `white` | Active button text color |
| `select_background_color` | string | button_background_color | Background for energy select controls |
| `select_border_color` | string | button_border_color | Border for energy select controls |
| `select_text_color` | string | button_text_color | Text color for energy select controls |
| `select_active_background_color` | string | button_active_color | Active background for energy select controls |
| `select_active_border_color` | string | button_active_color | Active border for energy select controls |
| `select_active_text_color` | string | button_active_text_color | Active text for energy select controls |
| `select_option_background_color` | string | select_background_color | Dropdown option background |
| `select_option_text_color` | string | select_text_color | Dropdown option text color |
| `select_label_color` | string | button_text_color | Selector label color |
| `series_total_box_width` | string | `108px` | Fixed width of each totals box |

### Custom Range Styling

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `custom_range_background_color` | string | card bg | Custom range bar background |
| `custom_range_border_color` | string | divider | Custom range top border |
| `custom_range_text_color` | string | primary text | Label text color |
| `custom_range_label_size` | string | `13px` | Label font size |

### Date Input Styling

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `date_input_background_color` | string | primary bg | Input background |
| `date_input_border_color` | string | divider | Input border |
| `date_input_text_color` | string | primary text | Input text color |
| `date_input_padding` | string | `4px 8px` | Input padding |
| `date_input_radius` | string | `4px` | Input border radius |
| `date_input_size` | string | `13px` | Input font size |
| `date_input_accent_color` | string | primary color | Accent color (icons/selection) |
| `date_input_scheme` | string | `dark` | Browser popup scheme `dark`/`light` |
| `date_input_focus_color` | string | rgba | Focus ring color |
| `date_input_caret_color` | string | input text | Caret color |
| `date_input_field_background_color` | string | `transparent` | Inner field background |
| `date_picker_icon_filter` | string | `invert(0.9)` | Picker icon filter |
| `date_picker_icon_opacity` | string | `0.8` | Picker icon opacity |

### Apply Button Styling

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apply_button_padding` | string | `6px 16px` | Apply button padding |
| `apply_button_background_color` | string | primary color | Apply background |
| `apply_button_border_color` | string | `transparent` | Apply border |
| `apply_button_text_color` | string | `white` | Apply text color |
| `apply_button_radius` | string | `4px` | Apply border radius |
| `apply_button_size` | string | `13px` | Apply font size |
| `apply_button_hover_color` | string | primary color | Apply hover background |
| `apply_button_hover_filter` | string | `brightness(1.05)` | Apply hover filter |

### Status Text Styling

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `show_status_text` | boolean | `true` | Show or hide the status text line |
| `status_text_color` | string | secondary text | Status text color |
| `status_text_size` | string | `12px` | Status text size |
| `status_text_padding` | string | `8px 16px` | Status text padding |
| `status_text_weight` | string | `normal` | Status text weight |

### Modebar Icon Styling

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `modebar_icon_color` | string | primary text | Modebar icon color |
| `modebar_icon_hover_color` | string | primary color | Modebar icon hover color |
| `modebar_icon_active_color` | string | primary color | Modebar icon active color |

### Axis Styling

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `xaxis_title` | string | `Tijd` | X-axis title |
| `yaxis_title` | string | unit | Y-axis title |
| `grid_color` | string | `rgba(128,128,128,0.2)` | Grid line color |

### Background Colors

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `paper_bg_color` | string | `rgba(0,0,0,0)` | Outer background |
| `plot_bg_color` | string | `rgba(0,0,0,0)` | Chart area background |
| `font_color` | string | `var(--primary-text-color)` | Text color |
| `hover_bg_color` | string | `rgba(0,0,0,0.8)` | Hover tooltip background |

### Button Styling

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `selector_background_color` | string | `var(--card-background-color)` | Time selector background |
| `button_background_color` | string | `var(--primary-background-color)` | Button background |
| `button_border_color` | string | `var(--divider-color)` | Button border color |
| `button_text_color` | string | `var(--primary-text-color)` | Button text color |
| `button_active_color` | string | `var(--primary-color)` | Active button color |
| `button_radius` | string | `4px` | Button border radius |
| `select_background_color` | string | `button_background_color` | Energy select background |
| `select_border_color` | string | `button_border_color` | Energy select border |
| `select_text_color` | string | `button_text_color` | Energy select text color |
| `select_active_background_color` | string | `button_active_color` | Active energy select background |
| `select_active_border_color` | string | `button_active_color` | Active energy select border |
| `select_active_text_color` | string | `button_active_text_color` | Active energy select text |
| `select_option_background_color` | string | `select_background_color` | Energy dropdown option background |
| `select_option_text_color` | string | `select_text_color` | Energy dropdown option text color |
| `select_label_color` | string | `button_text_color` | Energy selector label color |
| `series_total_box_width` | string | `108px` | Fixed width of each totals box |

### Modebar Styling

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `show_modebar` | boolean | `true` | Show Plotly modebar |
| `modebar_bg_color` | string | `rgba(255,255,255,0.9)` | Modebar background (aliases: `modebar_bgcolor`, `modebar_bg`) |
| `modebar_radius` | string | `4px` | Modebar border radius |

## Complete Example

```yaml
type: custom:timescale-plotly-card
sensor_id: sensor.temperature_woonkamer
title: Temperatuur Woonkamer
name: Temperatuur
days: 7
downsample: 3600  # seconds
height: 400
line_color: rgb(75, 192, 192)
fill_color: rgba(75, 192, 192, 0.2)
unit: °C
```

### Options

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `sensor_id` | string | **Yes** | - | Entity ID in TimescaleDB |
| `title` | string | No | TimescaleDB Data | Card title |
| `name` | string | No | sensor_id | Series name in legend |
| `days` | number | No | 7 | Number of days to show |
| `downsample` | number | No | 3600 | Aggregation interval in seconds |
| `height` | number | No | 400 | Chart height in pixels |
| `line_color` | string | No | rgb(75,192,192) | Line color (RGB) |
| `fill_color` | string | No | rgba(75, 192, 192, 0.2) | Fill color (RGBA) |
| `unit` | string | No | '' | Y-axis unit label |

## Examples

### Temperature (7 days)
```yaml
type: custom:timescale-plotly-card
sensor_id: sensor.temperature_woonkamer
title: Temperatuur
days: 7
downsample: 3600
unit: °C
line_color: rgb(255, 99, 132)
database: ltss
fill: false
axis_title_offset_y: 100px
axis_title_offset_left: 20px
axis_title_offset_right: 40px
```

### Humidity (3 days, 10-min aggregation)
```yaml
type: custom:timescale-plotly-card
sensor_id: sensor.humidity_bathroom
title: Luchtvochtigheid
days: 3
downsample: 600
unit: '%'
line_color: rgb(54, 162, 235)
database: scribe
fill: false
axis_title_offset_y: 100px
axis_title_offset_left: 20px
axis_title_offset_right: 40px
```

### Power (14 days, hourly)
```yaml
type: custom:timescale-plotly-card
sensor_id: sensor.power_consumption
title: Energieverbruik
days: 14
downsample: 3600
unit: kW
line_color: rgb(75, 192, 75)
database: scribe
fill: false
axis_title_offset_y: 100px
axis_title_offset_left: 20px
axis_title_offset_right: 40px
```

> **Note:** This Card is a work in progress. Features and functionality may change or be incomplete.

## Database Selection

This card supports database selection at both card and series level. This is useful if you have multiple TimescaleDB databases (e.g., LTSS and Scribe).

### Card Level

You can set the database for the entire card:

```yaml
 type: custom:timescale-plotly-card
 database: ltss  # or scribe
 sensor_id: sensor.temperature_woonkamer
```

### Series Level

You can select a different database for each series:

```yaml
 type: custom:timescale-plotly-card
 title: Living Room Climate
 entities:
   - sensor_id: sensor.temperature_woonkamer
     name: Temperature
     database: ltss
   - sensor_id: sensor.amber_4h_average_ambient_temperature
     name: Outdoor temp 4h average
     database: scribe
```

If both card and series have a database set, the series setting takes precedence.

### Options

| Option   | Type   | Level      | Description |
|----------|--------|-----------|-------------|
| database | string | card/series| Database name as configured in Timescale Database Reader |

> **Important:** For Scribe, set the table option to `states`. For LTSS, set the table option to `ltss`. The correct table must be specified for each database in your card or series configuration:

```yaml
 type: custom:timescale-plotly-card
 database: scribe
 table: states
 sensor_id: sensor.amber_4h_average_ambient_temperature
```

```yaml
 type: custom:timescale-plotly-card
 database: ltss
 table: ltss
 sensor_id: sensor.temperature_woonkamer
```

If you use multiple databases in one card, set the `table` option for each series as needed.

## Support

For issues and feature requests, please use the [GitHub issue tracker](https://github.com/remmob/timescale-plotly-card/issues).

---
©2026 Bommer Software | Author: Mischa Bommer