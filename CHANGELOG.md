## Changelog

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
