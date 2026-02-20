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
 * @author Mischa Bommer
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
     * @throws {Error} If sensor_id and entities are missing
     */
    setConfig(config) {
        const hasEntities = Array.isArray(config.entities) && config.entities.length > 0;
        if (!config.sensor_id && !hasEntities) {
            throw new Error('sensor_id or entities is required');
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
        const defaultRanges = ['1h', '2h', '3h', '6h', '12h', '24h', 'custom'];
        const configuredRanges = Array.isArray(this._config.time_ranges) && this._config.time_ranges.length
            ? this._config.time_ranges
            : defaultRanges;
        const ranges = configuredRanges
            .map(r => String(r).toLowerCase())
            .filter(r => r && r !== 'nan');
        if (this._config.show_custom_button === false) {
            const idx = ranges.indexOf('custom');
            if (idx >= 0) ranges.splice(idx, 1);
        }
        if (!ranges.includes(this._selectedRange)) {
            ranges.push(this._selectedRange);
        }
        const showCustom = ranges.includes('custom');
        const timeButtonsHTML = ranges.map(range => {
            const label = range === 'custom' ? 'Custom' : range;
            return `<button class="time-btn ${this._selectedRange === range ? 'active' : ''}" data-range="${range}">${label}</button>`;
        }).join('');

        const timeSelectorHTML = showTimeSelector ? `
                    <div class="time-selector">
                        ${timeButtonsHTML}
                    </div>
                    <div class="custom-range ${(this._selectedRange === 'custom' && showCustom) ? 'visible' : ''}">
                        <label>Start: <input type="datetime-local" id="start-date" /></label>
                        <label>End: <input type="datetime-local" id="end-date" /></label>
                        <button id="apply-custom">Apply</button>
                    </div>
                ` : '';

        const root = this.shadowRoot || this.attachShadow({ mode: 'open' });
        root.innerHTML = `
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
                background: ${this._config.date_input_background_color || this._config.date_input_background || 'var(--primary-background-color, #2b2b2b)'};
                border: 1px solid ${this._config.date_input_border_color || this._config.date_input_border || 'var(--divider-color, #3b3b3b)'};
                color: ${this._config.date_input_text_color || this._config.date_input_text || 'var(--primary-text-color, #e1e1e1)'};
                padding: ${this._config.date_input_padding || '4px 8px'};
                border-radius: ${this._config.date_input_radius || '4px'};
                    margin-left: 6px;
                font-size: ${this._config.date_input_size || '13px'};
                accent-color: ${this._config.date_input_accent_color || this._config.date_input_accent || 'var(--primary-color, #03a9f4)'};
                color-scheme: ${this._config.date_input_scheme || 'dark'};
                caret-color: ${this._config.date_input_caret_color || this._config.date_input_caret || this._config.date_input_text_color || this._config.date_input_text || 'var(--primary-text-color, #e1e1e1)'};
        }
                .custom-range input:focus {
                    outline: none;
                    box-shadow: 0 0 0 2px ${this._config.date_input_focus_color || this._config.date_input_focus || 'rgba(3,169,244,0.4)'};
                }
                .custom-range input::-webkit-calendar-picker-indicator {
                    filter: ${this._config.date_picker_icon_filter || 'invert(0.9)'};
                    opacity: ${this._config.date_picker_icon_opacity || '0.8'};
                }
                .custom-range input::-webkit-datetime-edit {
                    color: ${this._config.date_input_text_color || this._config.date_input_text || 'var(--primary-text-color, #e1e1e1)'};
                }
                .custom-range input::-webkit-datetime-edit-fields-wrapper {
                    background: ${this._config.date_input_field_background_color || this._config.date_input_field_background || 'transparent'};
                }
                .custom-range input::-webkit-datetime-edit-text,
                .custom-range input::-webkit-datetime-edit-month-field,
                .custom-range input::-webkit-datetime-edit-day-field,
                .custom-range input::-webkit-datetime-edit-year-field,
                .custom-range input::-webkit-datetime-edit-hour-field,
                .custom-range input::-webkit-datetime-edit-minute-field,
                .custom-range input::-webkit-datetime-edit-ampm-field {
                    color: ${this._config.date_input_text_color || this._config.date_input_text || 'var(--primary-text-color, #e1e1e1)'};
                }
        #apply-custom {
                    padding: ${this._config.apply_button_padding || '6px 16px'};
                    background: ${this._config.apply_button_background_color || this._config.apply_button_background || 'var(--primary-color, #03a9f4)'};
                    border: 1px solid ${this._config.apply_button_border_color || this._config.apply_button_border || 'transparent'};
                    color: ${this._config.apply_button_text_color || this._config.apply_button_text || 'white'};
                    border-radius: ${this._config.apply_button_radius || '4px'};
                    cursor: pointer;
                    font-size: ${this._config.apply_button_size || '13px'};
                    transition: all 0.2s;
        }
                #apply-custom:hover {
                    background: ${this._config.apply_button_hover_color || this._config.apply_button_hover || 'var(--primary-color, #03a9f4)'};
                    filter: ${this._config.apply_button_hover_filter || 'brightness(1.05)'};
                }
                #status {
                    color: ${this._config.status_text_color || 'var(--secondary-text-color, #9b9b9b)'};
                    font-size: ${this._config.status_text_size || '12px'};
                    padding: ${this._config.status_text_padding || '8px 16px'};
                    font-weight: ${this._config.status_text_weight || 'normal'};
                }
                #axis-titles {
                    display: none;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0 16px 0 16px;
                    color: ${this._config.font_color || 'var(--primary-text-color, #e1e1e1)'};
                    font-size: 12px;
                    font-weight: 600;
                }
                #axis-titles.visible {
                    display: flex;
                }
                #axis-title-left,
                #axis-title-right {
                    position: relative;
                    top: ${this._config.axis_title_offset_y || '-18px'};
                }
                #axis-title-left {
                    left: ${this._config.axis_title_offset_left || '0px'};
                }
                #axis-title-right {
                    right: ${this._config.axis_title_offset_right || '0px'};
                }
                #legend {
                    display: none;
                    gap: 12px;
                    flex-wrap: wrap;
                    padding: 0 16px 6px 16px;
                    color: ${this._config.font_color || 'var(--primary-text-color, #e1e1e1)'};
                    font-size: 12px;
                }
                #legend.visible {
                    display: flex;
                }
                .legend-item {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    white-space: nowrap;
                    cursor: pointer;
                    user-select: none;
                }
                .legend-item.inactive {
                    opacity: 0.4;
                }
                .legend-swatch {
                    width: 12px;
                    height: 3px;
                    border-radius: 2px;
                    background: currentColor;
                }
                #chart {
                    width: 100%;
                    max-width: 100%;
                    height: ${this._config.height || 400}px;
                    position: relative;
                    overflow: visible;
                }
                /* Plotly modebar styling - toolbar with chart controls */
                        #chart .modebar-container {
                    position: absolute !important;
                                        top: -12px !important;
                    right: 10px !important;
                    left: auto !important;
                    display: block !important;
                    background: transparent !important;
                    width: auto !important;
                    padding: 0 !important;
                    box-shadow: none !important;
                    z-index: 10000 !important;
                }
                        #chart .modebar {
                    position: relative !important;
                    display: flex !important;
                    flex-direction: row !important;
                    gap: 8px !important;
                    background: ${this._config.modebar_bg_color || this._config.modebar_bgcolor || this._config.modebar_bg || 'rgba(255,255,255,0.9)'} !important;
                    background-color: ${this._config.modebar_bg_color || this._config.modebar_bgcolor || this._config.modebar_bg || 'rgba(255,255,255,0.9)'} !important;
                    border-radius: ${this._config.modebar_radius || '4px'} !important;
                    padding: 6px !important;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.2) !important;
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
                    background: ${this._config.tooltip_bg_color || this._config.tooltip_bg || 'rgba(0,0,0,0.9)'};
                    color: ${this._config.tooltip_text_color || this._config.tooltip_text || '#fff'};
                    font-size: 12px;
                    border: 1px solid ${this._config.tooltip_border_color || this._config.tooltip_border || 'rgba(255,255,255,0.2)'};
                    pointer-events: none;
                    z-index: 10001;
                    white-space: nowrap;
                }
                .hover-overlay {
                    position: absolute;
                    inset: 0;
                    background: transparent;
                    z-index: 10005;
                    pointer-events: auto;
                }
                .hover-line {
                    position: absolute;
                    top: 0;
                    bottom: 0;
                    width: 0;
                    border-left: 1px dotted ${this._config.hover_line_color || 'rgba(120,120,120,0.8)'};
                    display: none;
                    z-index: 10006;
                    pointer-events: none;
                }
      </style>
      <ha-card>
        <div class="card-header">${this._config.title || 'TimescaleDB'}</div>
        <div class="card-content timescale-content">
          ${timeSelectorHTML}
          <div id="status">Loading data...</div>
                    <div id="axis-titles"><span id="axis-title-left"></span><span id="axis-title-right"></span></div>
                    <div id="legend"></div>
                    <div id="chart"></div>
        </div>
      </ha-card>
    `;
        this.attachEventListeners();
        this.loadData();
    }

    attachEventListeners() {
        const root = this.shadowRoot || this;
        const buttons = root.querySelectorAll('.time-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const range = e.target.getAttribute('data-range');
                this._selectedRange = range;
                buttons.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');

                const customRange = root.querySelector('.custom-range');
                if (range === 'custom') {
                    customRange.classList.add('visible');
                } else {
                    customRange.classList.remove('visible');
                    this.loadData();
                }
            });
        });

        const applyBtn = root.querySelector('#apply-custom');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                const startInput = root.querySelector('#start-date');
                const endInput = root.querySelector('#end-date');
                if (startInput.value && endInput.value) {
                    this._customStart = new Date(startInput.value);
                    this._customEnd = new Date(endInput.value);
                    this.loadData();
                }
            });
        }
    }

    async loadData() {
        const root = this.shadowRoot || this;
        const chartEl = root.querySelector('#chart');
        const statusEl = root.querySelector('#status');
        const legendEl = root.querySelector('#legend');
        const axisTitlesEl = root.querySelector('#axis-titles');
        const axisTitleLeftEl = root.querySelector('#axis-title-left');
        const axisTitleRightEl = root.querySelector('#axis-title-right');
        if (!chartEl || !this._hass) return;

        try {
            const showStatusText = this._config.show_status_text !== false;
            if (statusEl) {
                statusEl.style.display = showStatusText ? '' : 'none';
            }
            if (!window.Plotly) {
                if (showStatusText) {
                    statusEl.textContent = 'Loading Plotly...';
                }
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

            if (showStatusText) {
                statusEl.textContent = 'Fetching data...';
            }

            const seriesConfigs = Array.isArray(this._config.entities) && this._config.entities.length
                ? this._config.entities
                : [{ sensor_id: this._config.sensor_id }];

            const invalidSeries = seriesConfigs.find(series => !series?.sensor_id);
            if (invalidSeries) {
                throw new Error('Each entry in entities must include sensor_id');
            }

            const responses = await Promise.all(seriesConfigs.map(series => {
                const msg = {
                    type: 'timescale/query',
                    sensor_id: series.sensor_id,
                    start: startTime.toISOString(),
                    end: endTime.toISOString(),
                    downsample: downsample
                };
                if (series.entry_id || this._config.entry_id) {
                    msg.entry_id = series.entry_id || this._config.entry_id;
                }
                if (series.database || this._config.database) {
                    msg.database = series.database || this._config.database;
                }
                return this._hass.connection.sendMessagePromise(msg);
            }));

            const totalPoints = responses.reduce((sum, resp) => sum + (Array.isArray(resp) ? resp.length : 0), 0);
            if (totalPoints === 0) {
                if (showStatusText) {
                    statusEl.textContent = 'No data found';
                }
                return;
            }

            const defaultTreatNaNAsZero = this._config.nan_as_zero === true;
            const defaultGapDropToZero = this._config.gap_drop_to_zero === true;
            const defaultConnectGaps = this._config.connect_gaps === true;
            const defaultExtendEdgeGaps = this._config.extend_edge_gaps === true;
            const downsampleMs = Math.max(1, Number(downsample) * 1000);

            const allTimes = responses
                .flatMap(resp => (Array.isArray(resp) ? resp : []))
                .map(d => new Date(d.bucket || d.time || 0).getTime())
                .filter(t => Number.isFinite(t));
            const offset = allTimes.length ? (Math.min(...allTimes) % downsampleMs) : (startTime.getTime() % downsampleMs);

            const alignTime = (t) => Math.round((t - offset) / downsampleMs) * downsampleMs + offset;

            const startMs = alignTime(startTime.getTime());
            const endMs = alignTime(endTime.getTime());
            const xBase = [];
            for (let t = startMs; t <= endMs; t += downsampleMs) {
                xBase.push(new Date(t));
            }

            const defaultColors = [
                'rgb(75,192,192)',
                'rgb(255,99,132)',
                'rgb(54,162,235)',
                'rgb(255,159,64)',
                'rgb(153,102,255)',
                'rgb(201,203,207)'
            ];

            const buildSeries = (seriesConfig, response, index) => {
                const treatNaNAsZero = seriesConfig.nan_as_zero === true || (seriesConfig.nan_as_zero !== false && defaultTreatNaNAsZero);
                const gapDropToZero = seriesConfig.gap_drop_to_zero === true || (seriesConfig.gap_drop_to_zero !== false && defaultGapDropToZero);
                const gapDropMinPoints = Math.max(1, Number(seriesConfig.gap_drop_min_points ?? this._config.gap_drop_min_points ?? 2));
                const connectGaps = seriesConfig.connect_gaps === true || (seriesConfig.connect_gaps !== false && defaultConnectGaps);
                const extendEdgeGaps = seriesConfig.extend_edge_gaps === true || (seriesConfig.extend_edge_gaps !== false && defaultExtendEdgeGaps);
                const sensorId = seriesConfig.sensor_id;
                const stateObj = this._hass?.states?.[sensorId];
                const unitFromState = stateObj?.attributes?.unit_of_measurement || '';
                const unitValue = seriesConfig.unit ?? this._config.unit ?? unitFromState;
                const unitSuffix = unitValue ? ` ${unitValue}` : '';

                const sensorIdShort = sensorId ? sensorId.split('.').pop() : undefined;
                const friendlyName = stateObj?.attributes?.friendly_name;
                const seriesName = seriesConfig.name || friendlyName || sensorIdShort || sensorId || `Series ${index + 1}`;
                const valueLabel = seriesConfig.tooltip_label_text ?? this._config.tooltip_label_text;
                const labelText = valueLabel || seriesName || 'Value';
                const formatValue = (val) => (Number.isFinite(val) ? Number(val).toFixed(2) : '—');

                const dataByTime = new Map();
                (response || []).forEach(d => {
                    const t = new Date(d.bucket || d.time || 0).getTime();
                    if (!Number.isFinite(t)) return;
                    const key = alignTime(t);
                    const raw = parseFloat(d.avg_state || d.state);
                    dataByTime.set(key, Number.isFinite(raw) ? raw : null);
                });

                const yBase = xBase.map(time => {
                    const raw = dataByTime.get(time.getTime());
                    return Number.isFinite(raw) ? raw : null;
                });

                const ySource = (() => {
                    if (!extendEdgeGaps || yBase.length === 0) return yBase;
                    const values = [...yBase];
                    const firstFinite = values.findIndex(v => Number.isFinite(v));
                    if (firstFinite === -1) return values;
                    const firstValue = values[firstFinite];
                    for (let i = 0; i < firstFinite; i += 1) {
                        values[i] = firstValue;
                    }
                    let lastFinite = values.length - 1;
                    while (lastFinite >= 0 && !Number.isFinite(values[lastFinite])) lastFinite -= 1;
                    if (lastFinite >= 0) {
                        const lastValue = values[lastFinite];
                        for (let i = lastFinite + 1; i < values.length; i += 1) {
                            values[i] = lastValue;
                        }
                    }
                    return values;
                })();

                let x = xBase;
                let y = ySource;
                let plotText = [];

                if (treatNaNAsZero && gapDropToZero) {
                    const plotX = [];
                    const plotY = [];
                    const plotTextLocal = [];

                    const pushPoint = (time, value) => {
                        plotX.push(time);
                        plotY.push(value);
                        const formatted = new Date(time).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                        plotTextLocal.push(`${formatted}<br>${labelText}: ${formatValue(value)}${unitSuffix}`);
                    };

                    let lastFinite = null;
                    let i = 0;
                    while (i < xBase.length) {
                        const time = xBase[i];
                        const val = ySource[i];

                        if (Number.isFinite(val)) {
                            pushPoint(time, val);
                            lastFinite = val;
                            i += 1;
                            continue;
                        }

                        let j = i;
                        while (j < xBase.length && !Number.isFinite(ySource[j])) j += 1;
                        const gapLen = j - i;

                        if (gapLen < gapDropMinPoints) {
                            const fillVal = Number.isFinite(lastFinite) ? lastFinite : 0;
                            for (let k = i; k < j; k += 1) {
                                pushPoint(xBase[k], fillVal);
                            }
                            i = j;
                            continue;
                        }

                        const dropTime = xBase[i];
                        if (Number.isFinite(lastFinite)) {
                            pushPoint(dropTime, lastFinite);
                            pushPoint(dropTime, 0);
                        } else {
                            pushPoint(dropTime, 0);
                        }

                        pushPoint(xBase[j - 1], 0);

                        if (j < xBase.length && Number.isFinite(ySource[j])) {
                            pushPoint(xBase[j], 0);
                            pushPoint(xBase[j], ySource[j]);
                            lastFinite = ySource[j];
                            i = j + 1;
                        } else {
                            i = j;
                        }
                    }

                    x = plotX;
                    y = plotY;
                    plotText = plotTextLocal;
                } else {
                    if (treatNaNAsZero) {
                        y = ySource.map(v => (Number.isFinite(v) ? v : 0));
                    }
                    plotText = x.map((time, i) => {
                        const formatted = new Date(time).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                        return `${formatted}<br>${labelText}: ${formatValue(y[i])}${unitSuffix}`;
                    });
                }

                const lineColor = seriesConfig.line_color || seriesConfig.color || this._config.line_color || this._config.color || defaultColors[index % defaultColors.length];
                const fillEnabled = seriesConfig.fill !== false && this._config.fill !== false;
                const fillColor = seriesConfig.fill_color || this._config.fill_color || this._config.fillcolor || 'rgba(75,192,192,0.2)';
                const lineWidth = seriesConfig.line_width || this._config.line_width || 2;
                const lineShape = seriesConfig.line_shape || this._config.line_shape || 'linear';
                const chartType = seriesConfig.type || seriesConfig.chart_type || this._config.chart_type || 'line';
                const axisSideRaw = (seriesConfig.yaxis || seriesConfig.axis || 'left');
                const axisSide = String(axisSideRaw).toLowerCase() === 'right' ? 'right' : 'left';

                return {
                    x,
                    y,
                    plotText,
                    lineColor,
                    fillColor,
                    lineWidth,
                    lineShape,
                    name: seriesName,
                    labelText,
                    unitValue,
                    fillEnabled,
                    axisSide,
                    chartType,
                    gapDropToZero,
                    connectGaps
                };
            };

            const seriesData = seriesConfigs.map((seriesConfig, index) => buildSeries(seriesConfig, responses[index], index));

            // Calculate automatic Y-axis range with margin
            const leftSeries = seriesData.filter(series => series.axisSide !== 'right');
            const rightSeries = seriesData.filter(series => series.axisSide === 'right');
            const leftYAll = leftSeries.flatMap(series => series.y || []);
            const rightYAll = rightSeries.flatMap(series => series.y || []);
            const allY = seriesData.flatMap(series => series.y || []);
            const finiteY = allY.filter(v => Number.isFinite(v));
            if (finiteY.length === 0) {
                if (showStatusText) {
                    statusEl.textContent = 'No valid data';
                }
                return;
            }
            const margin = Number.isFinite(Number(this._config.y_margin)) ? Number(this._config.y_margin) : 5;  // Default 5 units margin
            const getRange = (values) => {
                const finite = values.filter(v => Number.isFinite(v));
                if (finite.length === 0) return null;
                const minValue = Math.min(...finite);
                const maxValue = Math.max(...finite);
                const yMin = (minValue >= 0 && minValue <= margin) ? 0 : (minValue - margin);
                const yMax = maxValue + margin;
                return { yMin, yMax };
            };

            const leftRange = getRange(leftYAll.length ? leftYAll : allY);
            const rightRange = getRange(rightYAll);

            let defaultStatus = '';
            if (showStatusText) {
                statusEl.textContent = `${totalPoints} points (${downsample}s interval)`;
                defaultStatus = statusEl.textContent;
            }

            // Wait for DOM ready and calculate correct width
            await new Promise(resolve => setTimeout(resolve, 50));
            const parentWidth = chartEl.parentElement?.offsetWidth || chartEl.offsetWidth || 800;
            const chartWidth = Math.max(300, parentWidth - 20);  // 10px padding both sides

            const downloadFormat = String(this._config.download_format || 'png').toLowerCase();

            const showLegend = seriesData.length > 1;
            const isMultiSeries = seriesData.length > 1;
            const normalizeTitle = (value) => {
                if (value === null || value === undefined) return '';
                const text = String(value).trim();
                if (!text) return '';
                if (text.toLowerCase() === 'nan') return '';
                return text;
            };
            const axisTitlePosition = String(this._config.yaxis_title_position || 'top').toLowerCase();
            const leftAxisTitle = normalizeTitle(this._config.yaxis_title_left)
                || normalizeTitle(this._config.yaxis_title)
                || (leftSeries.length === 1 ? normalizeTitle(leftSeries[0]?.unitValue || leftSeries[0]?.name || '') : '');
            const rightAxisTitle = normalizeTitle(this._config.yaxis_title_right)
                || (rightSeries.length === 1 ? normalizeTitle(rightSeries[0]?.unitValue || rightSeries[0]?.name || '') : '');

            if (axisTitlesEl && axisTitleLeftEl && axisTitleRightEl) {
                const showTopTitles = axisTitlePosition === 'top' && (leftAxisTitle || rightAxisTitle);
                axisTitlesEl.classList.toggle('visible', showTopTitles);
                axisTitleLeftEl.textContent = leftAxisTitle || '';
                axisTitleRightEl.textContent = rightAxisTitle || '';
            }

            if (!Array.isArray(this._legendVisibility) || this._legendVisibility.length !== seriesData.length) {
                this._legendVisibility = seriesData.map((_, idx) => this._legendVisibility?.[idx] ?? true);
            }

            const traces = seriesData.map((series, index) => {
                const chartType = String(series.chartType || 'line').toLowerCase();
                const isBar = chartType === 'bar';
                return {
                    x: series.x,
                    y: series.y,
                    type: isBar ? 'bar' : 'scatter',
                    mode: isBar ? undefined : 'lines+markers',
                    line: isBar ? undefined : {
                        color: series.lineColor,
                        width: series.lineWidth,
                        shape: series.lineShape
                    },
                    marker: isBar ? {
                        color: series.lineColor
                    } : {
                        size: 6,
                        opacity: 0.01,
                        color: series.lineColor
                    },
                    fill: isBar ? 'none' : (series.fillEnabled ? 'tozeroy' : 'none'),
                    fillcolor: isBar ? 'rgba(0,0,0,0)' : (series.fillEnabled ? series.fillColor : 'rgba(0,0,0,0)'),
                    text: series.plotText,
                    hoverinfo: 'text',
                    hoveron: isBar ? 'points' : 'points',
                    connectgaps: isBar ? false : (series.gapDropToZero ? false : series.connectGaps),
                    name: series.name,
                    showlegend: showLegend,
                    yaxis: series.axisSide === 'right' ? 'y2' : 'y',
                    visible: this._legendVisibility[index] ? true : false,
                    meta: {
                        labelText: series.labelText,
                        unitValue: series.unitValue
                    }
                };
            });

            const x = seriesData[0]?.x || xBase;
            const y = seriesData[0]?.y || [];
            const labelText = seriesData[0]?.labelText || 'Value';
            const unitSuffixValue = seriesData[0]?.unitValue || '';

            const baseMarginTop = this._config.margin_top || 60;
            const needsTopTitles = axisTitlePosition === 'top' && (leftAxisTitle || rightAxisTitle);
            const marginTop = needsTopTitles ? Math.max(baseMarginTop, 80) : baseMarginTop;
            const baseMarginRight = this._config.margin_right || 60;
            const marginRight = rightRange ? Math.max(baseMarginRight, 50) : baseMarginRight;

            const annotations = [];

            const layout = {
                width: chartWidth,
                height: this._config.height || 400,
                margin: {
                    t: marginTop,
                    r: marginRight,
                    b: this._config.margin_bottom || 40,
                    l: this._config.margin_left || 50
                },
                autosize: false,
                xaxis: {
                    title: { text: this._config.xaxis_title || 'Time' },
                    gridcolor: this._config.grid_color || 'rgba(128,128,128,0.2)',
                    ticklabelpadding: this._config.xaxis_tick_padding || 6,
                    ticklabelstandoff: this._config.xaxis_tick_padding || 6,
                    automargin: true
                },
                yaxis: {
                    title: {
                        text: axisTitlePosition === 'top' ? '' : (leftAxisTitle || ''),
                        font: { color: this._config.font_color || 'var(--primary-text-color, #e1e1e1)' },
                        standoff: 8
                    },
                    range: leftRange ? [leftRange.yMin, leftRange.yMax] : undefined,
                    gridcolor: this._config.grid_color || 'rgba(128,128,128,0.2)',
                    ticklabelpadding: this._config.yaxis_tick_padding || 6,
                    ticklabelstandoff: this._config.yaxis_tick_padding || 6,
                    automargin: true
                },
                annotations: annotations,
                paper_bgcolor: this._config.paper_bgcolor || 'rgba(0,0,0,0)',
                plot_bgcolor: this._config.plot_bgcolor || 'rgba(0,0,0,0)',
                font: {
                    color: this._config.font_color || 'var(--primary-text-color, #e1e1e1)'
                },
                hovermode: isMultiSeries ? 'x unified' : 'closest',
                hoverlabel: {
                    bgcolor: 'rgba(0,0,0,0.9)',
                    font: { color: 'white', size: 14 },
                    bordercolor: this._config.line_color || 'rgb(75,192,192)'
                },
                showlegend: false
            };

            if (rightRange) {
                layout.yaxis2 = {
                    title: {
                        text: axisTitlePosition === 'top' ? '' : (rightAxisTitle || ''),
                        font: { color: this._config.font_color || 'var(--primary-text-color, #e1e1e1)' },
                        standoff: 8
                    },
                    range: [rightRange.yMin, rightRange.yMax],
                    overlaying: 'y',
                    side: 'right',
                    gridcolor: 'rgba(0,0,0,0)',
                    ticklabelpadding: this._config.yaxis_tick_padding || 6,
                    ticklabelstandoff: this._config.yaxis_tick_padding || 6,
                    automargin: true
                };
            }

            await Plotly.newPlot(chartEl, traces, layout, {
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

            const applyModebarStyles = () => {
                const modebar = chartEl.querySelector('.modebar');
                const modebarContainer = chartEl.querySelector('.modebar-container');
                const modebarBg = this._config.modebar_bg_color || this._config.modebar_bgcolor || this._config.modebar_bg || 'rgba(255,255,255,0.9)';

                if (modebarContainer) {
                    modebarContainer.style.position = 'absolute';
                    modebarContainer.style.top = '-12px';
                    modebarContainer.style.right = '10px';
                    modebarContainer.style.left = 'auto';
                    modebarContainer.style.background = 'transparent';
                    modebarContainer.style.width = 'fit-content';
                    modebarContainer.style.padding = '0';
                    modebarContainer.style.boxShadow = 'none';
                    modebarContainer.style.zIndex = '10001';
                }

                if (modebar) {
                    modebar.style.position = 'relative';
                    modebar.style.background = modebarBg;
                    modebar.style.backgroundColor = modebarBg;
                    modebar.style.borderRadius = this._config.modebar_radius || '4px';
                    modebar.style.padding = '6px';
                    modebar.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
                }
            };

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

            const clampTooltipPosition = (xPos, yPos, containerRect) => {
                const margin = 8;
                const tooltipWidth = tooltip.offsetWidth || 220;
                const tooltipHeight = tooltip.offsetHeight || 80;
                const maxX = Math.max(0, containerRect.width - tooltipWidth - margin);
                const maxY = Math.max(0, containerRect.height - tooltipHeight - margin);
                const clampedX = Math.min(Math.max(xPos, margin), maxX);
                const clampedY = Math.min(Math.max(yPos, margin), maxY);
                return { x: clampedX, y: clampedY };
            };

            chartEl.on('plotly_hover', (eventData) => {
                const points = eventData?.points || [];
                if (!points.length) return;

                const firstPoint = points[0];
                const date = new Date(firstPoint.x || 0);
                const formatted = date.toLocaleString('nl-NL', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });

                const hoverTime = new Date(firstPoint.x || 0).getTime();
                const lines = isMultiSeries
                    ? seriesData.map((series) => {
                        const pointValueRaw = getTooltipValueAtTime(series, hoverTime);
                        const pointValue = Number.isFinite(pointValueRaw) ? Number(pointValueRaw).toFixed(2) : '—';
                        const unitLabel = series.labelText || series.name || labelText;
                        const unitSuffix = series.unitValue ? ` ${series.unitValue}` : '';
                        return `${unitLabel}: <b>${pointValue}${unitSuffix}</b>`;
                    })
                    : (() => {
                        const pointValueRaw = getTooltipValueAtTime(seriesData[0], hoverTime);
                        const pointValue = Number.isFinite(pointValueRaw) ? Number(pointValueRaw).toFixed(2) : '—';
                        const unitSuffix = unitSuffixValue ? ` ${unitSuffixValue}` : '';
                        return [`${labelText}: <b>${pointValue}${unitSuffix}</b>`];
                    })();

                tooltip.innerHTML = `<b>${formatted}</b><br>${lines.join('<br>')}`;
                tooltip.style.display = 'block';

                const rect = chartEl.getBoundingClientRect();
                const clientX = eventData.event?.clientX ?? rect.left;
                const clientY = eventData.event?.clientY ?? rect.top;
                let xPos = clientX - rect.left + 10;
                let yPos = clientY - rect.top - 10;
                const lineX = clientX - rect.left;

                const clamped = clampTooltipPosition(xPos, yPos, rect);
                xPos = clamped.x;
                yPos = clamped.y;

                tooltip.style.left = `${xPos}px`;
                tooltip.style.top = `${yPos}px`;

                hoverLine.style.display = 'block';
                hoverLine.style.left = `${lineX}px`;

                if (showStatusText) {
                    statusEl.textContent = `${formatted} • ${lines.join(' • ').replace(/<[^>]*>/g, '')}`;
                }
            });

            chartEl.on('plotly_unhover', () => {
                tooltip.style.display = 'none';
                hoverLine.style.display = 'none';
                if (showStatusText) {
                    statusEl.textContent = defaultStatus;
                }
            });

            // Fallback: custom hover using mouse position (no Plotly hover events)
            if (this._mouseMoveHandler) {
                overlay.removeEventListener('mousemove', this._mouseMoveHandler);
            }
            if (this._mouseLeaveHandler) {
                overlay.removeEventListener('mouseleave', this._mouseLeaveHandler);
            }

            const getTimeSafe = (val) => {
                if (val instanceof Date) return val.getTime();
                const t = new Date(val).getTime();
                return Number.isFinite(t) ? t : 0;
            };

            const findNearestIndex = (targetTime, arrayX = x) => {
                if (!arrayX || arrayX.length === 0) return 0;
                let lo = 0;
                let hi = arrayX.length - 1;
                while (hi - lo > 1) {
                    const mid = Math.floor((lo + hi) / 2);
                    if (getTimeSafe(arrayX[mid]) < targetTime) lo = mid;
                    else hi = mid;
                }
                const loDiff = Math.abs(getTimeSafe(arrayX[lo]) - targetTime);
                const hiDiff = Math.abs(getTimeSafe(arrayX[hi]) - targetTime);
                return loDiff <= hiDiff ? lo : hi;
            };

            const getTooltipValueAtTime = (series, targetTime) => {
                if (!series?.x?.length || !series?.y?.length || !Number.isFinite(targetTime)) return null;

                const idx = findNearestIndex(targetTime, series.x);
                const direct = series.y?.[idx];
                if (Number.isFinite(direct)) return Number(direct);

                if (!series.connectGaps || series.gapDropToZero) return null;

                let prev = idx;
                while (prev >= 0 && !Number.isFinite(series.y?.[prev])) prev -= 1;
                let next = idx;
                while (next < series.y.length && !Number.isFinite(series.y?.[next])) next += 1;

                const hasPrev = prev >= 0 && Number.isFinite(series.y?.[prev]);
                const hasNext = next < series.y.length && Number.isFinite(series.y?.[next]);

                if (hasPrev && hasNext) {
                    const t0 = getTimeSafe(series.x[prev]);
                    const t1 = getTimeSafe(series.x[next]);
                    const v0 = Number(series.y[prev]);
                    const v1 = Number(series.y[next]);
                    if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 === t0) return v0;
                    const ratio = (targetTime - t0) / (t1 - t0);
                    return v0 + ratio * (v1 - v0);
                }

                if (hasPrev) return Number(series.y[prev]);
                if (hasNext) return Number(series.y[next]);
                return null;
            };

            this._mouseMoveHandler = (evt) => {
                const layout = chartEl._fullLayout;
                if (!layout || !layout.xaxis || !x || x.length === 0) return;

                const rect = overlay.getBoundingClientRect();
                const px = evt.clientX - rect.left;
                const py = evt.clientY - rect.top;

                const size = layout._size;
                const xRange = layout.xaxis.range;
                if (!size || !Array.isArray(xRange) || xRange.length < 2) return;
                if (xRange[0] == null || xRange[1] == null) return;

                const xStart = new Date(xRange[0]).getTime();
                const xEnd = new Date(xRange[1]).getTime();
                const clampedX = Math.min(Math.max(px - size.l, 0), size.w);
                const frac = size.w > 0 ? clampedX / size.w : 0;
                const targetTime = xStart + frac * (xEnd - xStart);

                const baseIndex = findNearestIndex(targetTime, x);
                const baseTime = x[baseIndex] || 0;
                const date = new Date(baseTime);
                const formatted = date.toLocaleString('nl-NL', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });

                let tooltipLines = [];
                let statusParts = [];

                if (isMultiSeries) {
                    seriesData.forEach(series => {
                        const value = getTooltipValueAtTime(series, targetTime);
                        const unitSuffix = series.unitValue ? ` ${series.unitValue}` : '';
                        const label = series.labelText || series.name || labelText;
                        const displayVal = Number.isFinite(value) ? Number(value).toFixed(2) : '—';
                        tooltipLines.push(`${label}: <b>${displayVal}${unitSuffix}</b>`);
                        statusParts.push(`${label}: ${displayVal}${unitSuffix}`);
                    });
                } else {
                    const nearestValueRaw = getTooltipValueAtTime(seriesData[0], targetTime);
                    const nearestValue = Number.isFinite(nearestValueRaw) ? Number(nearestValueRaw).toFixed(2) : '—';
                    const unitSuffix = unitSuffixValue ? ` ${unitSuffixValue}` : '';
                    tooltipLines.push(`${labelText}: <b>${nearestValue}${unitSuffix}</b>`);
                    statusParts.push(`${labelText}: ${nearestValue}${unitSuffix}`);
                }

                tooltip.innerHTML = `<b>${formatted}</b><br>${tooltipLines.join('<br>')}`;
                tooltip.style.display = 'block';

                let xPos = px + 10;
                let yPos = py - 10;
                const clamped = clampTooltipPosition(xPos, yPos, rect);
                xPos = clamped.x;
                yPos = clamped.y;

                tooltip.style.left = `${xPos}px`;
                tooltip.style.top = `${yPos}px`;

                hoverLine.style.display = 'block';
                hoverLine.style.left = `${px}px`;

                if (showStatusText) {
                    statusEl.textContent = `${formatted} • ${statusParts.join(' • ')}`;
                }
            };

            this._mouseLeaveHandler = () => {
                tooltip.style.display = 'none';
                hoverLine.style.display = 'none';
                if (showStatusText) {
                    statusEl.textContent = defaultStatus;
                }
            };

            overlay.style.pointerEvents = 'auto';
            overlay.addEventListener('mousemove', this._mouseMoveHandler);
            overlay.addEventListener('mouseleave', this._mouseLeaveHandler);

            applyModebarStyles();
            chartEl.on('plotly_afterplot', applyModebarStyles);
            chartEl.on('plotly_relayout', applyModebarStyles);

            if (legendEl) {
                if (showLegend) {
                    legendEl.classList.add('visible');
                    legendEl.innerHTML = seriesData.map((series, index) => {
                        const safeName = series.name || 'Series';
                        const color = series.lineColor || 'currentColor';
                        const inactiveClass = this._legendVisibility?.[index] ? '' : ' inactive';
                        return `<span class="legend-item${inactiveClass}" data-index="${index}" style="color: ${color}"><span class="legend-swatch"></span>${safeName}</span>`;
                    }).join('');

                    legendEl.querySelectorAll('.legend-item').forEach(item => {
                        item.addEventListener('click', () => {
                            const idx = Number(item.getAttribute('data-index'));
                            if (!Number.isFinite(idx)) return;
                            const current = this._legendVisibility?.[idx] !== false;
                            const next = !current;
                            const visibleCount = this._legendVisibility.filter(Boolean).length;
                            if (!next && visibleCount <= 1) {
                                return;
                            }
                            this._legendVisibility[idx] = next;
                            item.classList.toggle('inactive', !next);
                            if (window.Plotly && chartEl) {
                                Plotly.restyle(chartEl, { visible: next ? true : false }, [idx]);
                            }
                        });
                    });
                } else {
                    legendEl.classList.remove('visible');
                    legendEl.innerHTML = '';
                }
            }

        } catch (error) {
            if (statusEl && this._config.show_status_text !== false) {
                statusEl.textContent = 'Error: ' + error.message;
            }
            console.error('[TIMESCALE-PLOTLY-CARD]', error);
        }
    }

    loadPlotly() {
        return new Promise((resolve, reject) => {
            if (window.Plotly) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            const defaultUrl = 'https://cdn.plot.ly/plotly-2.27.0.min.js';
            script.src = this._config.plotly_url || defaultUrl;
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
    description: 'Plotly grafiek met Timescale database data'
});
