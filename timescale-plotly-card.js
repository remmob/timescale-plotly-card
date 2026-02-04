/**
 * TimescaleDB Plotly Card for Home Assistant
 * 
 * Custom Lovelace card that displays historical sensor data from TimescaleDB
 * using interactive Plotly.js charts.
 * 
 * Features:
 * - Time range selector buttons (1h, 2h, 3h, 6h, 12h, 24h, custom)
 * - Auto-refresh with configurable interval
 * - Automatic smart downsampling
 * - Auto-scaling Y-axis with margins
 * - Crosshair and hover tooltips
 * - Fully customizable CSS styling
 * - Interactive Plotly toolbar (zoom, pan, download)
 * 
 * @version 2.0.0
 * @author Your Name
 * @license MIT
 */

console.info('%c TIMESCALE-PLOTLY-CARD %c 2.0.0 ', 'color: white; background: #03a9f4; font-weight: bold;', 'color: #03a9f4; background: white; font-weight: bold;');

/**
 * TimescalePlotlyCard Web Component
 * 
 * Lifecycle:
 * 1. setConfig() - Validates and stores configuration
 * 2. set hass() - Receives Home Assistant instance, triggers render
 * 3. connectedCallback() - Element added to DOM, starts auto-refresh
 * 4. render() - Creates HTML structure and attaches event listeners
 * 5. loadData() - Queries TimescaleDB via WebSocket and renders chart
 * 6. disconnectedCallback() - Cleanup when removed from DOM
 */
class TimescalePlotlyCard extends HTMLElement {
    /**
     * Set and validate card configuration
     * 
     * @param {Object} config - Card configuration from YAML
     * @throws {Error} If sensor_id is missing
     */
    setConfig(config) {
        if (!config.sensor_id) {
            throw new Error('sensor_id is required');
        }
        this._config = config;
        this._selectedRange = config.default_range || '24h';
        this._customStart = null;
        this._customEnd = null;
        this._refreshInterval = null;
    }

    /**
     * Called when element is added to DOM
     * Starts auto-refresh timer if configured
     */
    connectedCallback() {
        // Start auto-refresh when element is added to DOM
        const refreshSeconds = this._config.auto_refresh || 300;  // Default 5 minutes
        if (refreshSeconds > 0) {
            this._refreshInterval = setInterval(() => {
                if (this._selectedRange !== 'custom') {
                    this.loadData();
                }
            }, refreshSeconds * 1000);
        }
    }

    /**
     * Called when element is removed from DOM
     * Stops auto-refresh timer to prevent memory leaks
     */
    disconnectedCallback() {
        // Cleanup auto-refresh when element is removed
        if (this._refreshInterval) {
            clearInterval(this._refreshInterval);
            this._refreshInterval = null;
        }
    }

    set hass(hass) {
        this._hass = hass;
        if (!this._initialized) {
            this._initialized = true;
            this.render();
        }
    }

    render() {
        const showTimeSelector = this._config.show_time_selector !== false;
        const timeSelectorHTML = showTimeSelector ? `
          <div class="time-selector">
            <button class="time-btn ${this._selectedRange === '1h' ? 'active' : ''}" data-range="1h">1h</button>
            <button class="time-btn ${this._selectedRange === '2h' ? 'active' : ''}" data-range="2h">2h</button>
            <button class="time-btn ${this._selectedRange === '3h' ? 'active' : ''}" data-range="3h">3h</button>
            <button class="time-btn ${this._selectedRange === '6h' ? 'active' : ''}" data-range="6h">6h</button>
            <button class="time-btn ${this._selectedRange === '12h' ? 'active' : ''}" data-range="12h">12h</button>
            <button class="time-btn ${this._selectedRange === '24h' ? 'active' : ''}" data-range="24h">24h</button>
            <button class="time-btn ${this._selectedRange === 'custom' ? 'active' : ''}" data-range="custom">Custom</button>
          </div>
          <div class="custom-range ${this._selectedRange === 'custom' ? 'visible' : ''}">
            <label>Start: <input type="datetime-local" id="start-date" /></label>
            <label>End: <input type="datetime-local" id="end-date" /></label>
            <button id="apply-custom">Apply</button>
          </div>
        ` : '';

        this.innerHTML = `
      <style>
        ha-card {
          overflow: hidden;
        }
        .timescale-content {
          padding: 0;
          overflow: hidden;
        }
                .time-selector {
                    display: flex;
                    gap: 8px;
                    padding: 12px 16px;
                    flex-wrap: wrap;
                    background: ${this._config.selector_background_color || this._config.selector_background || 'var(--card-background-color, #1c1c1c)'};
                }
                .time-btn {
                    padding: 6px 12px;
                    background: ${this._config.button_background_color || this._config.button_color || 'var(--primary-background-color, #2b2b2b)'};
                    border: 1px solid ${this._config.button_border_color || this._config.button_border || 'var(--divider-color, #3b3b3b)'};
                    color: ${this._config.button_text_color || this._config.button_text || 'var(--primary-text-color, #e1e1e1)'};
                    border-radius: ${this._config.button_radius || '4px'};
                    cursor: pointer;
                    font-size: 13px;
                    transition: all 0.2s;
                }
                .time-btn:hover {
                    background: ${this._config.button_hover_color || 'var(--secondary-background-color, #3b3b3b)'};
                    color: ${this._config.button_hover_text_color || this._config.button_hover_text || this._config.button_text_color || this._config.button_text || 'var(--primary-text-color, #e1e1e1)'};
                }
                .time-btn.active {
                    background: ${this._config.button_active_color || this._config.button_active || 'var(--primary-color, #03a9f4)'};
                    border-color: ${this._config.button_active_color || this._config.button_active || 'var(--primary-color, #03a9f4)'};
                    color: ${this._config.button_active_text_color || this._config.button_active_text || 'white'};
                }
                .custom-range {
                    display: none;
                    padding: 12px 16px;
                    gap: 12px;
                    flex-wrap: wrap;
                    background: ${this._config.custom_range_background_color || this._config.custom_range_background || 'var(--card-background-color, #1c1c1c)'};
                    border-top: 1px solid ${this._config.custom_range_border_color || this._config.custom_range_border || 'var(--divider-color, #3b3b3b)'};
                }
        .custom-range.visible {
          display: flex;
        }
        .custom-range label {
                    color: ${this._config.custom_range_text || 'var(--primary-text-color, #e1e1e1)'};
                    font-size: ${this._config.custom_range_label_size || '13px'};
        }
        .custom-range input {
                    background: ${this._config.date_input_background || 'var(--primary-background-color, #2b2b2b)'};
                    border: 1px solid ${this._config.date_input_border || 'var(--divider-color, #3b3b3b)'};
                    color: ${this._config.date_input_text || 'var(--primary-text-color, #e1e1e1)'};
                    padding: ${this._config.date_input_padding || '4px 8px'};
                    border-radius: ${this._config.date_input_radius || '4px'};
                    margin-left: 6px;
                    font-size: ${this._config.date_input_size || '13px'};
                    accent-color: ${this._config.date_input_accent || 'var(--primary-color, #03a9f4)'};
                    color-scheme: ${this._config.date_input_scheme || 'dark'};
                    caret-color: ${this._config.date_input_caret || this._config.date_input_text || 'var(--primary-text-color, #e1e1e1)'};
        }
                .custom-range input:focus {
                    outline: none;
                    box-shadow: 0 0 0 2px ${this._config.date_input_focus || 'rgba(3,169,244,0.4)'};
                }
                .custom-range input::-webkit-calendar-picker-indicator {
                    filter: ${this._config.date_picker_icon_filter || 'invert(0.9)'};
                    opacity: ${this._config.date_picker_icon_opacity || '0.8'};
                }
                .custom-range input::-webkit-datetime-edit {
                    color: ${this._config.date_input_text || 'var(--primary-text-color, #e1e1e1)'};
                }
                .custom-range input::-webkit-datetime-edit-fields-wrapper {
                    background: ${this._config.date_input_field_background || 'transparent'};
                }
                .custom-range input::-webkit-datetime-edit-text,
                .custom-range input::-webkit-datetime-edit-month-field,
                .custom-range input::-webkit-datetime-edit-day-field,
                .custom-range input::-webkit-datetime-edit-year-field,
                .custom-range input::-webkit-datetime-edit-hour-field,
                .custom-range input::-webkit-datetime-edit-minute-field,
                .custom-range input::-webkit-datetime-edit-ampm-field {
                    color: ${this._config.date_input_text || 'var(--primary-text-color, #e1e1e1)'};
                }
        #apply-custom {
                    padding: ${this._config.apply_button_padding || '6px 16px'};
                    background: ${this._config.apply_button_background || 'var(--primary-color, #03a9f4)'};
                    border: 1px solid ${this._config.apply_button_border || 'transparent'};
                    color: ${this._config.apply_button_text || 'white'};
                    border-radius: ${this._config.apply_button_radius || '4px'};
                    cursor: pointer;
                    font-size: ${this._config.apply_button_size || '13px'};
                    transition: all 0.2s;
        }
                #apply-custom:hover {
                    background: ${this._config.apply_button_hover || 'var(--primary-color, #03a9f4)'};
                    filter: ${this._config.apply_button_hover_filter || 'brightness(1.05)'};
                }
                #status {
                    color: ${this._config.status_text_color || 'var(--secondary-text-color, #9b9b9b)'};
                    font-size: ${this._config.status_text_size || '12px'};
                    padding: ${this._config.status_text_padding || '8px 16px'};
                    font-weight: ${this._config.status_text_weight || 'normal'};
                }
                #chart {
                    width: 100%;
                    max-width: 100%;
                    height: ${this._config.height || 400}px;
                    position: relative;
                    overflow: visible;
                }
        /* Plotly modebar styling - toolbar with chart controls */
                #chart .modebar {
          position: absolute !important;
                    top: -12px !important;
          right: 10px !important;
          left: auto !important;
          display: flex !important;
          flex-direction: row !important;
          gap: 8px !important;
          background: ${this._config.modebar_bg || 'rgba(255,255,255,0.9)'} !important;
          border-radius: ${this._config.modebar_radius || '4px'} !important;
          padding: 6px !important;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2) !important;
          z-index: 10000 !important;
        }
        #chart .modebar-group {
          display: flex !important;
          flex-direction: row !important;
          gap: 6px !important;
        }
        #chart .modebar-btn {
          display: inline-block !important;
          margin: 0 2px !important;
        }
                #chart .modebar-btn path {
                    fill: ${this._config.modebar_icon_color || 'var(--primary-text-color, #3b3b3b)'} !important;
                }
                #chart .modebar-btn:hover path {
                    fill: ${this._config.modebar_icon_hover_color || this._config.modebar_icon_hover || this._config.modebar_icon_color || 'var(--primary-color, #03a9f4)'} !important;
                }
                #chart .modebar-btn.active path {
                    fill: ${this._config.modebar_icon_active_color || this._config.modebar_icon_active || this._config.modebar_icon_color || 'var(--primary-color, #03a9f4)'} !important;
                }
                .hoverlayer .hovertext {
                    background-color: rgba(0,0,0,0.9) !important;
                    color: white !important;
                }
                #chart .js-plotly-plot,
                #chart .plot-container,
                #chart .svg-container {
                    pointer-events: all !important;
                }
                .chart-tooltip {
                    position: absolute;
                    display: none;
                    padding: 6px 8px;
                    border-radius: 4px;
                    background: ${this._config.tooltip_bg || 'rgba(0,0,0,0.9)'};
                    color: ${this._config.tooltip_text || '#fff'};
                    font-size: 12px;
                    border: 1px solid ${this._config.tooltip_border || 'rgba(255,255,255,0.2)'};
                    pointer-events: none;
                    z-index: 10001;
                    white-space: nowrap;
                }
                .hover-overlay {
                    position: absolute;
                    inset: 0;
                    background: transparent;
                    z-index: 9999;
                    pointer-events: auto;
                }
                .hover-line {
                    position: absolute;
                    top: 0;
                    bottom: 0;
                    width: 0;
                    border-left: 1px dotted ${this._config.hover_line_color || 'rgba(120,120,120,0.8)'};
                    display: none;
                    z-index: 10000;
                    pointer-events: none;
                }
      </style>
      <ha-card>
        <div class="card-header">${this._config.title || 'TimescaleDB'}</div>
        <div class="card-content timescale-content">
          ${timeSelectorHTML}
          <div id="status">Loading data...</div>
                    <div id="chart"></div>
        </div>
      </ha-card>
    `;
        this.attachEventListeners();
        this.loadData();
    }

    attachEventListeners() {
        const buttons = this.querySelectorAll('.time-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const range = e.target.getAttribute('data-range');
                this._selectedRange = range;
                buttons.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');

                const customRange = this.querySelector('.custom-range');
                if (range === 'custom') {
                    customRange.classList.add('visible');
                } else {
                    customRange.classList.remove('visible');
                    this.loadData();
                }
            });
        });

        const applyBtn = this.querySelector('#apply-custom');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                const startInput = this.querySelector('#start-date');
                const endInput = this.querySelector('#end-date');
                if (startInput.value && endInput.value) {
                    this._customStart = new Date(startInput.value);
                    this._customEnd = new Date(endInput.value);
                    this.loadData();
                }
            });
        }
    }

    async loadData() {
        const chartEl = this.querySelector('#chart');
        const statusEl = this.querySelector('#status');
        if (!chartEl || !this._hass) return;

        try {
            if (!window.Plotly) {
                statusEl.textContent = 'Loading Plotly...';
                await this.loadPlotly();
            }

            // Calculate time range
            let endTime, startTime, downsample;

            if (this._selectedRange === 'custom' && this._customStart && this._customEnd) {
                startTime = this._customStart;
                endTime = this._customEnd;
                const diffMs = endTime - startTime;
                const diffHours = diffMs / (1000 * 60 * 60);
                downsample = this._config.downsample || (diffHours > 24 ? 3600 : (diffHours > 6 ? 900 : 300));
            } else {
                endTime = new Date();
                const hours = parseInt(this._selectedRange) || 24;
                startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);

                // Smart downsample: ensures minimum ~80 data points
                if (this._config.downsample) {
                    downsample = this._config.downsample;
                } else {
                    const totalSeconds = hours * 3600;
                    downsample = Math.max(60, Math.floor(totalSeconds / 80));  // ~80 points
                }
            }

            statusEl.textContent = 'Fetching data...';

            const response = await this._hass.connection.sendMessagePromise({
                type: 'timescale/query',
                sensor_id: this._config.sensor_id,
                start: startTime.toISOString(),
                end: endTime.toISOString(),
                downsample: downsample
            });

            if (!response || response.length === 0) {
                statusEl.textContent = 'No data found';
                return;
            }

            const x = response.map(d => new Date(d.bucket || d.time));
            const y = response.map(d => parseFloat(d.avg_state || d.state));

            const stateObj = this._hass?.states?.[this._config.sensor_id];
            const unitFromState = stateObj?.attributes?.unit_of_measurement || '';
            const unitSuffixValue = this._config.unit ?? unitFromState;
            const unitSuffix = unitSuffixValue ? ` ${unitSuffixValue}` : '';
            const labelText = this._config.yaxis_title || stateObj?.attributes?.friendly_name || 'Value';

            // Calculate automatic Y-axis range with margin
            const minValue = Math.min(...y);
            const maxValue = Math.max(...y);
            const margin = this._config.y_margin || 5;  // Default 5 units margin
            const yMin = minValue - margin;
            const yMax = maxValue + margin;

            statusEl.textContent = `${response.length} points (${downsample}s interval)`;
            const defaultStatus = statusEl.textContent;

            // Wait for DOM ready and calculate correct width
            await new Promise(resolve => setTimeout(resolve, 50));
            const parentWidth = chartEl.parentElement?.offsetWidth || chartEl.offsetWidth || 800;
            const chartWidth = Math.max(300, parentWidth - 20);  // 10px padding both sides

            const downloadFormat = String(this._config.download_format || 'png').toLowerCase();

            await Plotly.newPlot(chartEl, [{
                x: x,
                y: y,
                type: 'scatter',
                mode: 'lines+markers',
                line: {
                    color: this._config.line_color || this._config.color || 'rgb(75,192,192)',
                    width: this._config.line_width || 2
                },
                marker: {
                    size: 6,
                    opacity: 0.01,
                    color: this._config.line_color || this._config.color || 'rgb(75,192,192)'
                },
                fill: 'tozeroy',
                fillcolor: this._config.fill_color || this._config.fillcolor || 'rgba(75,192,192,0.2)',
                text: x.map((time, i) => {
                    const date = new Date(time);
                    const formatted = date.toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                    return `${formatted}<br>${labelText}: ${y[i].toFixed(2)}${unitSuffix}`;
                }),
                hoverinfo: 'text',
                name: ''
            }], {
                width: chartWidth,
                height: this._config.height || 400,
                margin: {
                    t: this._config.margin_top || 60,
                    r: this._config.margin_right || 60,
                    b: this._config.margin_bottom || 40,
                    l: this._config.margin_left || 50
                },
                autosize: false,
                xaxis: {
                    title: this._config.xaxis_title || 'Time',
                    gridcolor: this._config.grid_color || 'rgba(128,128,128,0.2)',
                    ticklabelpadding: this._config.xaxis_tick_padding || 6
                },
                yaxis: {
                    title: this._config.yaxis_title || unitFromState || this._config.unit || '',
                    range: [yMin, yMax],
                    gridcolor: this._config.grid_color || 'rgba(128,128,128,0.2)',
                    ticklabelpadding: this._config.yaxis_tick_padding || 6
                },
                paper_bgcolor: this._config.paper_bgcolor || 'rgba(0,0,0,0)',
                plot_bgcolor: this._config.plot_bgcolor || 'rgba(0,0,0,0)',
                font: {
                    color: this._config.font_color || 'var(--primary-text-color, #e1e1e1)'
                },
                hovermode: 'closest',
                hoverlabel: {
                    bgcolor: 'rgba(0,0,0,0.9)',
                    font: { color: 'white', size: 14 },
                    bordercolor: this._config.line_color || 'rgb(75,192,192)'
                },
                showlegend: false
            }, {
                responsive: false,
                displayModeBar: this._config.show_modebar !== false,
                displaylogo: false,
                modeBarButtonsToRemove: ['lasso2d', 'select2d', 'pan2d', 'autoScale2d', 'toggleSpikelines', 'hoverClosestCartesian', 'hoverCompareCartesian'],
                toImageButtonOptions: {
                    format: downloadFormat,
                    filename: this._config.download_filename || 'timescale_chart',
                    height: this._config.download_height || 500,
                    width: this._config.download_width || 700,
                    scale: this._config.download_scale || 2,
                    // Override background and font for download only
                    paper_bgcolor: this._config.download_theme === 'light' ? 'white' : (this._config.download_theme === 'dark' ? 'rgba(0,0,0,0)' : (this._config.paper_bgcolor || 'rgba(0,0,0,0)')),
                    plot_bgcolor: this._config.download_theme === 'light' ? '#f5f5f5' : (this._config.download_theme === 'dark' ? 'rgba(0,0,0,0)' : (this._config.plot_bgcolor || 'rgba(0,0,0,0)')),
                    font: { color: this._config.download_theme === 'light' ? '#333' : (this._config.download_theme === 'dark' ? 'var(--primary-text-color, #e1e1e1)' : (this._config.font_color || 'var(--primary-text-color, #e1e1e1)')) }
                }
            });

            // Custom tooltip using Plotly hover events
            let tooltip = chartEl.querySelector('.chart-tooltip');
            if (!tooltip) {
                tooltip = document.createElement('div');
                tooltip.className = 'chart-tooltip';
                chartEl.appendChild(tooltip);
            }

            let overlay = chartEl.querySelector('.hover-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.className = 'hover-overlay';
                chartEl.appendChild(overlay);
            }

            let hoverLine = chartEl.querySelector('.hover-line');
            if (!hoverLine) {
                hoverLine = document.createElement('div');
                hoverLine.className = 'hover-line';
                chartEl.appendChild(hoverLine);
            }

            if (typeof chartEl.removeAllListeners === 'function') {
                chartEl.removeAllListeners('plotly_hover');
                chartEl.removeAllListeners('plotly_unhover');
            }

            chartEl.on('plotly_hover', (eventData) => {
                const point = eventData.points && eventData.points[0];
                if (!point) return;

                const unitLabel = labelText;
                const unitSuffix = unitSuffixValue ? ` ${unitSuffixValue}` : '';
                const date = new Date(point.x);
                const formatted = date.toLocaleString('nl-NL', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });

                tooltip.innerHTML = `<b>${formatted}</b><br>${unitLabel}: <b>${Number(point.y).toFixed(2)}${unitSuffix}</b>`;
                tooltip.style.display = 'block';

                const rect = chartEl.getBoundingClientRect();
                const clientX = eventData.event?.clientX ?? rect.left;
                const clientY = eventData.event?.clientY ?? rect.top;
                let xPos = clientX - rect.left + 10;
                let yPos = clientY - rect.top - 10;
                const lineX = clientX - rect.left;

                const maxX = rect.width - 160;
                const maxY = rect.height - 40;
                if (xPos < 0) xPos = 0;
                if (yPos < 0) yPos = 0;
                if (xPos > maxX) xPos = maxX;
                if (yPos > maxY) yPos = maxY;

                tooltip.style.left = `${xPos}px`;
                tooltip.style.top = `${yPos}px`;

                hoverLine.style.display = 'block';
                hoverLine.style.left = `${lineX}px`;

                statusEl.textContent = `${formatted} • ${unitLabel}: ${Number(point.y).toFixed(2)}${unitSuffix}`;
            });

            chartEl.on('plotly_unhover', () => {
                tooltip.style.display = 'none';
                hoverLine.style.display = 'none';
                statusEl.textContent = defaultStatus;
            });

            // Fallback: custom hover using mouse position (no Plotly hover events)
            if (this._mouseMoveHandler) {
                overlay.removeEventListener('mousemove', this._mouseMoveHandler);
            }
            if (this._mouseLeaveHandler) {
                overlay.removeEventListener('mouseleave', this._mouseLeaveHandler);
            }

            const findNearestIndex = (targetTime) => {
                let lo = 0;
                let hi = x.length - 1;
                while (hi - lo > 1) {
                    const mid = Math.floor((lo + hi) / 2);
                    if (x[mid].getTime() < targetTime) lo = mid;
                    else hi = mid;
                }
                const loDiff = Math.abs(x[lo].getTime() - targetTime);
                const hiDiff = Math.abs(x[hi].getTime() - targetTime);
                return loDiff <= hiDiff ? lo : hi;
            };

            this._mouseMoveHandler = (evt) => {
                const layout = chartEl._fullLayout;
                if (!layout || !layout.xaxis) return;

                const rect = overlay.getBoundingClientRect();
                const px = evt.clientX - rect.left;
                const py = evt.clientY - rect.top;

                const size = layout._size;
                const xRange = layout.xaxis.range;
                if (!size || !xRange || xRange.length < 2) return;

                const xStart = new Date(xRange[0]).getTime();
                const xEnd = new Date(xRange[1]).getTime();
                const clampedX = Math.min(Math.max(px - size.l, 0), size.w);
                const frac = size.w > 0 ? clampedX / size.w : 0;
                const targetTime = xStart + frac * (xEnd - xStart);

                const nearestIndex = findNearestIndex(targetTime);

                const unitLabel = labelText;
                const unitSuffix = unitSuffixValue ? ` ${unitSuffixValue}` : '';
                const date = new Date(x[nearestIndex]);
                const formatted = date.toLocaleString('nl-NL', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });

                tooltip.innerHTML = `<b>${formatted}</b><br>${unitLabel}: <b>${Number(y[nearestIndex]).toFixed(2)}${unitSuffix}</b>`;
                tooltip.style.display = 'block';

                let xPos = px + 10;
                let yPos = py - 10;
                const maxX = rect.width - 160;
                const maxY = rect.height - 40;
                if (xPos < 0) xPos = 0;
                if (yPos < 0) yPos = 0;
                if (xPos > maxX) xPos = maxX;
                if (yPos > maxY) yPos = maxY;

                tooltip.style.left = `${xPos}px`;
                tooltip.style.top = `${yPos}px`;

                hoverLine.style.display = 'block';
                hoverLine.style.left = `${px}px`;

                statusEl.textContent = `${formatted} • ${unitLabel}: ${Number(y[nearestIndex]).toFixed(2)}${unitSuffix}`;
            };

            this._mouseLeaveHandler = () => {
                tooltip.style.display = 'none';
                hoverLine.style.display = 'none';
                statusEl.textContent = defaultStatus;
            };

            overlay.addEventListener('mousemove', this._mouseMoveHandler);
            overlay.addEventListener('mouseleave', this._mouseLeaveHandler);

            // Force modebar position after Plotly renders
            setTimeout(() => {
                const modebar = chartEl.querySelector('.modebar');
                if (modebar) {
                    modebar.style.position = 'absolute';
                    modebar.style.top = '-12px';
                    modebar.style.right = '10px';
                    modebar.style.zIndex = '10001';
                }
            }, 100);

        } catch (error) {
            statusEl.textContent = 'Error: ' + error.message;
            console.error('[TIMESCALE-PLOTLY-CARD]', error);
        }
    }

    loadPlotly() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.plot.ly/plotly-latest.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    getCardSize() {
        return 5;
    }
}

customElements.define('timescale-plotly-card', TimescalePlotlyCard);

window.customCards = window.customCards || [];
window.customCards.push({
    type: 'timescale-plotly-card',
    name: 'TimescaleDB Plotly Card',
    description: 'Plotly grafiek met TimescaleDB data'
});
