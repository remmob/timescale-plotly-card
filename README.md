# Timescale Plotly Card
[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/custom-components/hacs)

A custom Lovelace card for Home Assistant that displays TimescaleDB historical data using interactive Plotly charts.

## Features

- 📊 Interactive Plotly charts with zoom, pan, hover, and download
- ⏱️ Time selector buttons (1u, 2u, 3u, 6u, 12u, 24u, Custom)
- 📅 Custom date range picker
- ⚡ Automatic smart downsampling (default: ~80 points per view)
- 🎨 Fully customizable CSS styling
- 🔄 Auto-refresh support (default: 300 seconds)
- 💾 Direct TimescaleDB queries via WebSocket
- 🎯 Crosshair and hover tooltips
- 📈 Auto-scaling Y-axis with configurable margins

## Requirements


> **Note:** The Timescale database Reader integration supports any TimescaleDB database. It has been tested with databases using the `ltss` table (from the [LTSS integration](https://github.com/freol35241/ltss)) and with [Scribe](https://github.com/jonathan-gatard/scribe). You do not need a special Home Assistant database; any compatible TimescaleDB schema will work. See the Timescale Database Reader [README](https://github.com/remmob/timescale_database_reader) for details and example queries.
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
# TimescaleDB Plotly Card - v1.0.0
# Complete configuration with all options

type: custom:timescale-plotly-card
sensor_id: sensor.temperature_woonkamer
title: Temperature Living Room

# Time selection
show_time_selector: true # Show time selector buttons (default: true)
default_range: 12h # Start range: 1h, 2h, 3h, 6h, 12h, 24h, custom (default: 24h)

# Data options
downsample: 300 # Default: 300 seconds (5 minutes)
height: 400 # Chart height in pixels
y_margin: 2 # Y-axis margin above and below values (default: 5)

# Chart styling
line_color: rgb(75, 192, 192) # Line color
line_width: 2 # Line thickness
fill_color: rgba(75, 192, 192, 0.2) # Fill color
unit: °C # Y-axis unit (leave commented to auto-detect)

# Layout options
margin_top: 40 # Top margin
margin_right: 10 # Right margin
margin_bottom: 40 # Bottom margin
margin_left: 50 # Left margin

# Axis styling
xaxis_title: Time # X-axis title
yaxis_title: Temperature # Y-axis title (leave commented to auto-detect)
grid_color: rgba(128,128,128,0.2) # Grid line color

# Background colors
paper_bgcolor: rgba(0,0,0,0) # Outer chart background
plot_bgcolor: rgba(0,0,0,0) # Inner chart background
font_color: var(--primary-text-color) # Text color

# Button styling
selector_background: var(--card-background-color) # Selector background
button_background: var(--primary-background-color) # Button background
button_border: var(--divider-color) # Button border
button_text: var(--primary-text-color) # Button text
button_active: var(--primary-color) # Active button color
button_radius: 4px # Button border radius

# Modebar (toolbar) styling
show_modebar: true # Show Plotly modebar (default: true)
modebar_bg: rgba(255,255,255,0.9) # Modebar background color
modebar_radius: 4px # Modebar border radius

# Tooltip & hover line styling
tooltip_bg: rgba(248, 11, 248, 0.9) # Tooltip background
tooltip_text: "#ffffff" # Tooltip text color
tooltip_border: rgba(255,255,255,0.2) # Tooltip border color
hover_line_color: rgba(120,120,120,0.8) # Vertical hover line color

# Download options
download_theme: dark # Download theme: 'light' or 'dark' (default: dark/transparent)
download_format: svg # Download format: png, svg, jpeg, webp
download_filename: timescale_chart # Download filename
download_width: 1200 # Download width in pixels
download_height: 600 # Download height in pixels
download_scale: 2 # Download scale (higher = better quality)

# Auto-refresh
auto_refresh: 300 # Auto-refresh interval in seconds (0 = disabled)

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
| `y_margin` | number | `5` | Y-axis margin above/below data values |
| `height` | number | `400` | Chart height in pixels |

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
| `xaxis_title` | string | `Tijd` | X-axis title |
| `yaxis_title` | string | unit | Y-axis title |
| `grid_color` | string | `rgba(128,128,128,0.2)` | Grid line color |

### Background Colors

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `paper_bgcolor` | string | `rgba(0,0,0,0)` | Outer background |
| `plot_bgcolor` | string | `rgba(0,0,0,0)` | Chart area background |
| `font_color` | string | `var(--primary-text-color)` | Text color |
| `hover_bg` | string | `rgba(0,0,0,0.8)` | Hover tooltip background |

### Button Styling

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `selector_background` | string | `var(--card-background-color)` | Time selector background |
| `button_background` | string | `var(--primary-background-color)` | Button background |
| `button_border` | string | `var(--divider-color)` | Button border color |
| `button_text` | string | `var(--primary-text-color)` | Button text color |
| `button_active` | string | `var(--primary-color)` | Active button color |
| `button_radius` | string | `4px` | Button border radius |

### Modebar Styling

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `show_modebar` | boolean | `true` | Show Plotly modebar |
| `modebar_bg` | string | `rgba(255,255,255,0.9)` | Modebar background |
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
color: rgb(75, 192, 192)
fillcolor: rgba(75, 192, 192, 0.2)
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
| `color` | string | No | rgb(75,192,192) | Line color (RGB) |
| `fillcolor` | string | No | rgba(75,192,192,0.2) | Fill color (RGBA) |
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
color: rgb(255, 99, 132)
```

### Humidity (3 days, 10-min aggregation)
```yaml
type: custom:timescale-plotly-card
sensor_id: sensor.humidity_bathroom
title: Luchtvochtigheid
days: 3
downsample: 600
unit: '%'
color: rgb(54, 162, 235)
```

### Power (14 days, hourly)
```yaml
type: custom:timescale-plotly-card
sensor_id: sensor.power_consumption
title: Energieverbruik
days: 14
downsample: 3600
unit: kW
color: rgb(75, 192, 75)
```

## Support

For issues and feature requests, please use the [GitHub issue tracker](https://github.com/your-username/timescale-plotly-card/issues).

---
©2026 Bommer Software | Author: Mischa Bommer

> **Note:** This integration is a work in progress. Features and functionality may change or be incomplete.