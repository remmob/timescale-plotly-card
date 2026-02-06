# Timescale Plotly Card

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/custom-components/hacs)

 > **Note:**  <span style="font-size: 2em">⚠️</span> This card is under heavy development. Features and options may change frequently.


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

## Requirements

> **Note:** The Timescale database Reader integration supports any TimescaleDB database. It has been tested with databases using the `ltss` table (from the [LTSS integration](https://github.com/freol35241/ltss)) and with [Scribe](https://github.com/jonathan-gatard/scribe). You do not need a special Home Assistant database; any compatible TimescaleDB schema will work. 
This means you can show data from other sources (e.g., IoT devices, sensors) stored in TimescaleDB.
See the Timescale Database Reader [README](https://github.com/remmob/timescale_database_reader) for details and example queries.

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
| `sensor_id` | string | **Required**. Entity ID from TimescaleDB |

### Time Selection

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `show_time_selector` | boolean | `true` | Show time range buttons |
| `default_range` | string | `24h` | Initial range: `1h`, `2h`, `3h`, `6h`, `12h`, `24h`, `custom` |
| `auto_refresh` | number | `300` | Auto-refresh interval in seconds (0 = disabled) |

### Data Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `downsample` | number | auto | Downsample interval in seconds. Auto: ~80 points |
| `y_margin` | number | `5` | Y-axis margin above/below data values (bottom margin is 0 when min is between 0 and `y_margin`) |
| `height` | number | `400` | Chart height in pixels |
| `nan_as_zero` | boolean | `false` | Treat NaN values as 0 in the series |

### Tooltip & Status Text

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `tooltip_label_text` | string | friendly name | Label used in tooltip and status text |

### Chart Styling

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `line_color` | string | `rgb(75,192,192)` | Line color |
| `line_width` | number | `2` | Line thickness |
| `fill_color` | string | `rgba(75,192,192,0.2)` | Fill color under line |
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
| `yaxis_title` | string | auto | Y-axis title |
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
| `fill_color` | string | No | rgba(75,192,192,0.2) | Fill color (RGBA) |
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
```

## Support

For issues and feature requests, please use the [GitHub issue tracker](https://github.com/remmob/timescale-plotly-card/issues).

---
©2026 Bommer Software | Author: Mischa Bommer

> **Note:** This integration is a work in progress. Features and functionality may change or be incomplete.


