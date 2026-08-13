// --- Entity mapping helper ---
function resolveEntityForRange(entityConfig, range) {
    // entityConfig: string (sensor_id) of object met entity/daily/monthly
    if (typeof entityConfig === 'string') return entityConfig;
    if (!entityConfig) return undefined;
    // Ondersteun sensor_id als alias voor entity
    const main = entityConfig.entity || entityConfig.sensor_id;
    // Mapping: daily voor week/maand, monthly voor jaar, yearly voor years
    if ((range === 'week' || range === 'month') && entityConfig.daily) return entityConfig.daily;
    if (range === 'year' && (entityConfig.monthly || entityConfig.yearly)) return entityConfig.monthly || entityConfig.yearly;
    if (range === 'years' && (entityConfig.yearly || entityConfig.monthly)) return entityConfig.yearly || entityConfig.monthly;
    // Fallback: hoofd-entity
    return main;
}
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
 * 
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
const TSCARD_VERSION = '2026-03-01-39';
const TSCARD_SYNC_EVENT = 'timescale-plotly-card-sync';

function getTimescaleSyncStore() {
    if (!window.__timescalePlotlySyncState || typeof window.__timescalePlotlySyncState !== 'object') {
        window.__timescalePlotlySyncState = {};
    }
    return window.__timescalePlotlySyncState;
}

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
        const useEnergyMode = config?.energy_mode === true || String(config?.time_mode || '').toLowerCase() === 'energy_calendar';
        this._selectedRange = config.default_range || (useEnergyMode ? 'today' : '24h');
        const selectedRangeText = String(this._selectedRange || '').toLowerCase();
        if (useEnergyMode && selectedRangeText === 'day') {
            this._selectedRange = 'today';
        }
        const energyCustomDisabled = useEnergyMode && config.show_custom_button === false;
        if (energyCustomDisabled && String(this._selectedRange || '').toLowerCase() === 'custom') {
            this._selectedRange = 'today';
        }
        this._customStart = null;
        this._customEnd = null;
        this._refreshInterval = null;
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        const currentDay = now.getDate();
        const currentWeek = this.getIsoWeekNumber(now);
        this._selectedYear = Number.isInteger(Number(config.energy_year)) ? Number(config.energy_year) : currentYear;
        this._selectedMonth = Number.isInteger(Number(config.energy_month)) ? Number(config.energy_month) : currentMonth;
        this._selectedDay = Number.isInteger(Number(config.energy_day)) ? Number(config.energy_day) : currentDay;
        this._selectedWeek = Number.isInteger(Number(config.energy_week)) ? Number(config.energy_week) : currentWeek;
        if (!this._syncInstanceId) {
            this._syncInstanceId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        }
        this._syncRole = this.normalizeSyncRole(config?.sync_mode || config?.sync_role || 'both');

        // If a group state already exists, apply it immediately when this card is configured.
        this.applyStoredSyncState();
    }

    normalizeSyncRole(value) {
        const text = String(value || '').trim().toLowerCase();
        if (text === 'master' || text === 'leader' || text === 'publish' || text === 'send') return 'master';
        if (text === 'follower' || text === 'receive' || text === 'listen') return 'follower';
        if (text === 'off' || text === 'none' || text === 'disabled' || text === 'false') return 'off';
        return 'both';
    }

    getSyncGroup() {
        const text = String(this._config?.sync_group || '').trim();
        return text || null;
    }

    isSyncEnabled() {
        return !!this.getSyncGroup() && this._syncRole !== 'off';
    }

    canPublishSync() {
        return this._syncRole === 'master' || this._syncRole === 'both';
    }

    canReceiveSync() {
        return this._syncRole === 'follower' || this._syncRole === 'both';
    }

    buildSyncState() {
        return {
            selectedRange: this._selectedRange,
            customStart: this._customStart instanceof Date ? this._customStart.toISOString() : null,
            customEnd: this._customEnd instanceof Date ? this._customEnd.toISOString() : null,
            selectedYear: Number.isInteger(Number(this._selectedYear)) ? Number(this._selectedYear) : null,
            selectedMonth: Number.isInteger(Number(this._selectedMonth)) ? Number(this._selectedMonth) : null,
            selectedDay: Number.isInteger(Number(this._selectedDay)) ? Number(this._selectedDay) : null,
            selectedWeek: Number.isInteger(Number(this._selectedWeek)) ? Number(this._selectedWeek) : null
        };
    }

    publishSyncState(reason) {
        if (!this.isSyncEnabled() || !this.canPublishSync()) return;
        const group = this.getSyncGroup();
        const payload = {
            group,
            sourceId: this._syncInstanceId,
            reason: reason || 'update',
            state: this.buildSyncState(),
            timestamp: Date.now()
        };

        getTimescaleSyncStore()[group] = payload;
        window.dispatchEvent(new CustomEvent(TSCARD_SYNC_EVENT, { detail: payload }));
    }

    applySyncState(syncState) {
        if (!syncState || typeof syncState !== 'object') return;

        const parseSyncedDate = (value) => {
            if (!value) return null;
            const date = new Date(value);
            return Number.isFinite(date.getTime()) ? date : null;
        };

        let changed = false;
        const incomingRangeRaw = String(syncState.selectedRange || '').toLowerCase();
        const incomingRange = incomingRangeRaw === 'day' ? 'today' : incomingRangeRaw;
        if (incomingRange && incomingRange !== this._selectedRange) {
            this._selectedRange = incomingRange;
            changed = true;
        }

        if (Object.prototype.hasOwnProperty.call(syncState, 'customStart')) {
            const incomingCustomStart = parseSyncedDate(syncState.customStart);
            const currentCustomStartTime = this._customStart instanceof Date ? this._customStart.getTime() : null;
            const incomingCustomStartTime = incomingCustomStart instanceof Date ? incomingCustomStart.getTime() : null;
            if (currentCustomStartTime !== incomingCustomStartTime) {
                this._customStart = incomingCustomStart;
                changed = true;
            }
        }

        if (Object.prototype.hasOwnProperty.call(syncState, 'customEnd')) {
            const incomingCustomEnd = parseSyncedDate(syncState.customEnd);
            const currentCustomEndTime = this._customEnd instanceof Date ? this._customEnd.getTime() : null;
            const incomingCustomEndTime = incomingCustomEnd instanceof Date ? incomingCustomEnd.getTime() : null;
            if (currentCustomEndTime !== incomingCustomEndTime) {
                this._customEnd = incomingCustomEnd;
                changed = true;
            }
        }

        const applyIntegerField = (fieldName, incomingValue) => {
            if (!Number.isInteger(Number(incomingValue))) return;
            const normalized = Number(incomingValue);
            if (Number(this[fieldName]) !== normalized) {
                this[fieldName] = normalized;
                changed = true;
            }
        };

        applyIntegerField('_selectedYear', syncState.selectedYear);
        applyIntegerField('_selectedMonth', syncState.selectedMonth);
        applyIntegerField('_selectedDay', syncState.selectedDay);
        applyIntegerField('_selectedWeek', syncState.selectedWeek);

        if (changed) {
            this.render();
            this.loadData();
        }
    }

    applyStoredSyncState() {
        if (!this.isSyncEnabled() || !this.canReceiveSync()) return;
        const group = this.getSyncGroup();
        const store = getTimescaleSyncStore();
        const payload = store[group];
        if (!payload || !payload.state || payload.sourceId === this._syncInstanceId) return;
        this.applySyncState(payload.state);
    }

    registerSyncListener() {
        if (!this.isSyncEnabled() || !this.canReceiveSync() || this._syncListener) return;
        this._syncListener = (event) => {
            const detail = event?.detail;
            if (!detail || detail.group !== this.getSyncGroup()) return;
            if (detail.sourceId === this._syncInstanceId) return;
            this.applySyncState(detail.state);
        };
        window.addEventListener(TSCARD_SYNC_EVENT, this._syncListener);

        // Immediately adopt latest state from this browser session.
        this.applyStoredSyncState();
    }

    unregisterSyncListener() {
        if (!this._syncListener) return;
        window.removeEventListener(TSCARD_SYNC_EVENT, this._syncListener);
        this._syncListener = null;
    }

    getIsoWeekNumber(dateInput) {
        const date = new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate(), 0, 0, 0, 0);
        const day = date.getDay() || 7;
        date.setDate(date.getDate() + 4 - day);
        const yearStart = new Date(date.getFullYear(), 0, 1, 0, 0, 0, 0);
        return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    }

    getIsoWeekStart(year, week) {
        const jan4 = new Date(year, 0, 4, 0, 0, 0, 0);
        const jan4Day = jan4.getDay() || 7;
        const week1Monday = new Date(jan4);
        week1Monday.setDate(jan4.getDate() - (jan4Day - 1));
        const start = new Date(week1Monday);
        start.setDate(week1Monday.getDate() + ((week - 1) * 7));
        start.setHours(0, 0, 0, 0);
        return start;
    }

    /**
     * Called when element is added to DOM
     * Starts auto-refresh timer if configured
     */
    connectedCallback() {
        this.registerSyncListener();
        // Reload data and title when Lovelace navigates to this view with a different entity
        this._navHandler = () => {
            if (this._initialized && new URLSearchParams(window.location.search).get('entity')) {
                const root = this.shadowRoot || this;
                const titleEl = root.querySelector('.card-header');
                if (titleEl) titleEl.textContent = this.resolveTemplateValue(this._config.title);
                this.loadData();
            }
        };
        window.addEventListener('location-changed', this._navHandler);
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
        this.unregisterSyncListener();
        // Cleanup navigation listener
        if (this._navHandler) {
            window.removeEventListener('popstate', this._navHandler);
        }
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

    isJsTemplateString(value) {
        if (typeof value !== 'string') return false;
        const text = value.trim();
        return text.startsWith('[[[') && text.endsWith(']]]');
    }

    getQueryParamValue(paramName) {
        if (!paramName) return '';
        try {
            const browserUrl = window?.location?.href;
            if (browserUrl) {
                const value = new URL(browserUrl).searchParams.get(paramName);
                if (value !== null) return value;
            }
        } catch (_err) { }

        try {
            const hassUrl = this._hass?.connection?.url;
            if (hassUrl) {
                const parsed = hassUrl instanceof URL
                    ? hassUrl
                    : new URL(String(hassUrl), window?.location?.origin || 'http://localhost');
                const value = parsed.searchParams.get(paramName);
                if (value !== null) return value;
            }
        } catch (_err) { }

        return '';
    }

    getFriendlyNameForEntity(entityId) {
        if (!entityId || typeof entityId !== 'string') return '';
        const stateObj = this._hass?.states?.[entityId];
        const friendlyName = stateObj?.attributes?.friendly_name;
        if (friendlyName && String(friendlyName).trim()) return String(friendlyName);
        return entityId;
    }

    sanitizeFilename(text) {
        const value = String(text || '').trim();
        if (!value) return 'timescale_chart';
        return value
            .replace(/[\\/:*?"<>|]+/g, '_')
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '') || 'timescale_chart';
    }

    resolveDownloadFilename(value) {
        const resolved = this.resolveTemplateValue(value);
        return this.sanitizeFilename(resolved);
    }

    resolveEntityIdFromTemplateBody(templateBody) {
        const fallbackMatch = templateBody.match(/searchParams\.get\((['"`])([^'"`]+)\1\)\s*(?:\|\||\?\?)\s*(['"`])([^'"`]+)\3/);
        if (fallbackMatch) {
            const queryValue = this.getQueryParamValue(fallbackMatch[2]);
            return queryValue && queryValue.trim() ? queryValue : fallbackMatch[4];
        }

        const queryMatch = templateBody.match(/searchParams\.get\((['"`])([^'"`]+)\1\)/);
        if (queryMatch) {
            return this.getQueryParamValue(queryMatch[2]);
        }

        return '';
    }

    resolveTemplateValue(value) {
        if (!this.isJsTemplateString(value)) return value;
        if (!this._hass) return value;

        const text = value.trim();
        const templateBody = text.slice(3, -3).trim();

        // Safe parser: supports templates like
        // [[[ return hass?.connection?.url.searchParams.get("entity") ]]]
        const friendlyFromQueryMatch = templateBody.match(/states\?\.\[\s*[^\]]*searchParams\.get\((['"`])([^'"`]+)\1\)[^\]]*\]\?\.(?:attributes\?\.)?friendly_name/i);
        if (friendlyFromQueryMatch) {
            const entityId = this.resolveEntityIdFromTemplateBody(templateBody);
            return this.getFriendlyNameForEntity(entityId);
        }

        const entityId = this.resolveEntityIdFromTemplateBody(templateBody);
        if (entityId) {
            return entityId;
        }

        // Keep backward compatibility: unknown template syntax falls back to plain text.
        return value;
    }

    resolveEntityConfigTemplates(entityConfig) {
        if (typeof entityConfig === 'string') {
            return this.resolveTemplateValue(entityConfig);
        }
        if (!entityConfig || typeof entityConfig !== 'object') {
            return entityConfig;
        }

        const resolved = { ...entityConfig };
        ['sensor_id', 'entity', 'daily', 'monthly', 'yearly'].forEach((key) => {
            if (typeof resolved[key] === 'string') {
                resolved[key] = this.resolveTemplateValue(resolved[key]);
            }
        });
        return resolved;
    }

    isEnergyCalendarMode() {
        if (this._config?.energy_mode === true) return true;
        const mode = String(this._config?.time_mode || '').toLowerCase();
        return mode === 'energy_calendar';
    }

    parseDurationToMs(value, fallbackMs) {
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
            return value;
        }
        const text = String(value || '').trim().toLowerCase();
        const match = text.match(/^(\d+)(m|h|d)$/);
        if (!match) return fallbackMs;
        const amount = Number(match[1]);
        const unit = match[2];
        if (!Number.isFinite(amount) || amount <= 0) return fallbackMs;
        if (unit === 'm') return amount * 60 * 1000;
        if (unit === 'h') return amount * 60 * 60 * 1000;
        return amount * 24 * 60 * 60 * 1000;
    }

    resolveEnergyWindow(nowInput, selectedRangeInput) {
        const now = nowInput instanceof Date ? nowInput : new Date();
        const selectedRangeRaw = String(selectedRangeInput || 'today').toLowerCase();
        const selectedRange = selectedRangeRaw === 'day' ? 'today' : selectedRangeRaw;
        const quarterHourMs = 15 * 60 * 1000;
        const hourMs = 60 * 60 * 1000;
        const dayMs = 24 * 60 * 60 * 1000;
        const bucketMs = this.parseDurationToMs(this._config.energy_bucket || '1h', hourMs);
        const weekStartCfg = Number(this._config.energy_week_start);
        const weekStart = Number.isInteger(weekStartCfg) ? Math.min(6, Math.max(0, weekStartCfg)) : 1;
        const yearsCountCfg = Number(this._config.energy_years_count);
        const yearsCount = Number.isInteger(yearsCountCfg) ? Math.min(8, Math.max(1, yearsCountCfg)) : 8;
        const yearsOffsetCfg = Number(this._config.energy_years_offset);
        const yearsOffset = Number.isInteger(yearsOffsetCfg) ? Math.max(0, yearsOffsetCfg) : 0;

        const window = {
            selectedRange,
            bucketMode: 'fixed',
            bucketMs,
            queryDownsampleSeconds: Math.max(60, Math.floor(bucketMs / 1000)),
            futureAsNull: true
        };

        if (selectedRange === 'custom' && this._customStart && this._customEnd) {
            window.startTime = new Date(this._customStart);
            window.endTime = new Date(this._customEnd);
            window.queryStart = new Date(window.startTime);
            window.queryEnd = new Date(window.endTime);
            return window;
        }

        const yearFloor = 2020;
        const selectedYearRaw = Number(this._selectedYear);
        const selectedYear = Number.isInteger(selectedYearRaw) ? Math.max(yearFloor, Math.min(now.getFullYear(), selectedYearRaw)) : now.getFullYear();
        const selectedMonthRaw = Number(this._selectedMonth);
        const selectedMonth = Number.isInteger(selectedMonthRaw) ? Math.max(1, Math.min(12, selectedMonthRaw)) : (now.getMonth() + 1);
        const selectedWeekRaw = Number(this._selectedWeek);
        const selectedWeek = Number.isInteger(selectedWeekRaw) ? Math.max(1, Math.min(52, selectedWeekRaw)) : this.getIsoWeekNumber(now);
        const daysInSelectedMonth = new Date(selectedYear, selectedMonth, 0).getDate();
        const selectedDayRaw = Number(this._selectedDay);
        const currentDay = now.getDate();
        const dayMax = (selectedYear === now.getFullYear() && selectedMonth === (now.getMonth() + 1))
            ? currentDay
            : daysInSelectedMonth;
        const selectedDay = Number.isInteger(selectedDayRaw) ? Math.max(1, Math.min(dayMax, selectedDayRaw)) : dayMax;
        const nowWeek = this.getIsoWeekNumber(now);

        if (selectedRange === 'today') {
            const start = new Date(selectedYear, selectedMonth - 1, selectedDay, 0, 0, 0, 0);
            const end = new Date(start.getTime() + dayMs - 1);
            window.startTime = start;
            window.endTime = end;
            window.queryStart = new Date(start);
            const isToday = selectedYear === now.getFullYear()
                && selectedMonth === (now.getMonth() + 1)
                && selectedDay === now.getDate();
            window.queryEnd = new Date(isToday ? Math.min(end.getTime(), now.getTime()) : end.getTime());
            window.queryDownsampleSeconds = Math.max(60, Math.floor(bucketMs / 1000));
            return window;
        }

        if (selectedRange === 'week') {
            const start = this.getIsoWeekStart(selectedYear, selectedWeek);
            const end = new Date(start.getTime() + (7 * dayMs) - 1);
            window.startTime = start;
            window.endTime = end;
            window.queryStart = new Date(start);
            const isCurrentWeek = selectedYear === now.getFullYear() && selectedWeek === nowWeek;
            window.queryEnd = new Date(isCurrentWeek ? Math.min(end.getTime(), now.getTime()) : end.getTime());
            window.bucketMode = 'day';
            window.queryDownsampleSeconds = 24 * 60 * 60;
            return window;
        }

        if (selectedRange === 'month') {
            const start = new Date(selectedYear, selectedMonth - 1, 1, 0, 0, 0, 0);
            const end = new Date(selectedYear, selectedMonth, 1, 0, 0, 0, 0);
            end.setMilliseconds(-1);
            window.startTime = start;
            window.endTime = end;
            window.queryStart = new Date(start);
            const isCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === (now.getMonth() + 1);
            window.queryEnd = new Date(isCurrentMonth ? Math.min(end.getTime(), now.getTime()) : end.getTime());
            window.bucketMode = 'day';
            window.queryDownsampleSeconds = 24 * 60 * 60;
            return window;
        }

        if (selectedRange === '3mo' || selectedRange === '6mo') {
            const months = selectedRange === '6mo' ? 6 : 3;
            const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1, 0, 0, 0, 0);
            const end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
            end.setMilliseconds(-1);
            window.startTime = start;
            window.endTime = end;
            window.queryStart = new Date(start);
            window.queryEnd = new Date(Math.min(end.getTime(), now.getTime()));
            window.bucketMode = 'month';
            window.queryDownsampleSeconds = 24 * 60 * 60;
            return window;
        }

        if (selectedRange === 'year') {
            const start = new Date(selectedYear, 0, 1, 0, 0, 0, 0);
            const end = new Date(selectedYear + 1, 0, 1, 0, 0, 0, 0);
            end.setMilliseconds(-1);
            window.startTime = start;
            window.endTime = end;
            window.queryStart = new Date(start);
            const isCurrentYear = selectedYear === now.getFullYear();
            window.queryEnd = new Date(isCurrentYear ? Math.min(end.getTime(), now.getTime()) : end.getTime());
            window.bucketMode = 'month';
            window.queryDownsampleSeconds = 24 * 60 * 60;
            return window;
        }

        if (selectedRange === 'years') {
            const endYear = selectedYear;
            const startYear = endYear - 6;
            const start = new Date(startYear, 0, 1, 0, 0, 0, 0);
            const end = new Date(endYear + 1, 0, 1, 0, 0, 0, 0);
            end.setMilliseconds(-1);
            window.startTime = start;
            window.endTime = end;
            window.queryStart = new Date(start);
            const isCurrentYear = endYear === now.getFullYear();
            window.queryEnd = new Date(isCurrentYear ? Math.min(end.getTime(), now.getTime()) : end.getTime());
            window.bucketMode = 'year';
            window.queryDownsampleSeconds = 31 * 24 * 60 * 60;
            return window;
        }

        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start.getTime() + dayMs - 1);
        window.startTime = start;
        window.endTime = end;
        window.queryStart = new Date(start);
        window.queryEnd = new Date(Math.min(end.getTime(), now.getTime()));
        window.queryDownsampleSeconds = Math.max(60, Math.floor(bucketMs / 1000));
        return window;
    }

    render() {
        const showTimeSelector = this._config.show_time_selector !== false;
        const isEnergyMode = this.isEnergyCalendarMode();
        const customButtonDisabled = this._config.show_custom_button === false;
        const defaultRanges = isEnergyMode
            ? ['today', 'month', 'year', 'week', 'years', 'custom']
            : ['1h', '2h', '3h', '6h', '12h', '24h', 'custom'];
        const configuredRanges = isEnergyMode
            ? ((Array.isArray(this._config.energy_time_ranges) && this._config.energy_time_ranges.length)
                ? this._config.energy_time_ranges
                : defaultRanges)
            : ((Array.isArray(this._config.time_ranges) && this._config.time_ranges.length)
                ? this._config.time_ranges
                : defaultRanges);
        const ranges = configuredRanges
            .map(r => String(r).toLowerCase())
            .map(r => r === 'day' ? 'today' : r)
            .filter(r => r && r !== 'nan');
        if (customButtonDisabled) {
            const idx = ranges.indexOf('custom');
            if (idx >= 0) ranges.splice(idx, 1);
        }
        const selectedRangeNormalized = String(this._selectedRange || '').toLowerCase() === 'day' ? 'today' : String(this._selectedRange || '').toLowerCase();
        this._selectedRange = selectedRangeNormalized;
        if (!(customButtonDisabled && this._selectedRange === 'custom') && !ranges.includes(this._selectedRange)) {
            ranges.push(this._selectedRange);
        }
        const showCustom = ranges.includes('custom') && !customButtonDisabled;
        const rangeLabels = {
            today: 'Dag',
            week: 'Week',
            month: 'Maand',
            '3mo': '3M',
            '6mo': '6M',
            year: 'Jaar',
            years: 'Jaren',
            custom: 'Aangepast'
        };
        const timeButtonsHTML = ranges.map(range => {
            const label = isEnergyMode ? (rangeLabels[range] || range) : (range === 'custom' ? 'Custom' : range);
            return `<button class="time-btn ${this._selectedRange === range ? 'active' : ''}" data-range="${range}">${label}</button>`;
        }).join('');

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        const currentDay = now.getDate();
        const currentWeek = Math.min(52, this.getIsoWeekNumber(now));
        const yearStart = 2020;
        const yearValue = Number.isInteger(Number(this._selectedYear)) ? Math.max(yearStart, Math.min(currentYear, Number(this._selectedYear))) : currentYear;
        const monthMax = yearValue === currentYear ? currentMonth : 12;
        const monthValue = Number.isInteger(Number(this._selectedMonth)) ? Math.max(1, Math.min(monthMax, Number(this._selectedMonth))) : monthMax;
        const dayMax = (yearValue === currentYear && monthValue === currentMonth)
            ? currentDay
            : new Date(yearValue, monthValue, 0).getDate();
        const dayValue = Number.isInteger(Number(this._selectedDay)) ? Math.max(1, Math.min(dayMax, Number(this._selectedDay))) : dayMax;
        const weekMax = yearValue === currentYear ? currentWeek : 52;
        const weekValue = Number.isInteger(Number(this._selectedWeek)) ? Math.max(1, Math.min(weekMax, Number(this._selectedWeek))) : weekMax;

        const yearOptions = Array.from({ length: currentYear - yearStart + 1 }, (_, i) => currentYear - i)
            .map(y => `<option value="${y}" ${y === yearValue ? 'selected' : ''}>${y}</option>`)
            .join('');
        const monthOptions = Array.from({ length: monthMax }, (_, i) => i + 1)
            .map(m => `<option value="${m}" ${m === monthValue ? 'selected' : ''}>${String(m).padStart(2, '0')}</option>`)
            .join('');
        const dayOptions = Array.from({ length: dayMax }, (_, i) => i + 1)
            .map(d => `<option value="${d}" ${d === dayValue ? 'selected' : ''}>${String(d).padStart(2, '0')}</option>`)
            .join('');
        const weekOptions = Array.from({ length: weekMax }, (_, i) => i + 1)
            .map(w => `<option value="${w}" ${w === weekValue ? 'selected' : ''}>${w}</option>`)
            .join('');

        const timeControlsHTML = ranges.map(range => {
            const label = isEnergyMode ? (rangeLabels[range] || range) : (range === 'custom' ? 'Custom' : range);
            if (isEnergyMode && range === 'today') {
                return `<div class="time-control-group"><div class="time-control-label">Dag</div><select id="energy-day-select" class="time-select ${this._selectedRange === 'today' ? 'active' : ''}" title="Dag">${dayOptions}</select></div>`;
            }
            if (isEnergyMode && range === 'year') {
                return `<div class="time-control-group"><div class="time-control-label">Jaar</div><select id="energy-year-select" class="time-select ${this._selectedRange === 'year' ? 'active' : ''}" title="Jaar">${yearOptions}</select></div>`;
            }
            if (isEnergyMode && range === 'month') {
                return `<div class="time-control-group"><div class="time-control-label">Maand</div><select id="energy-month-select" class="time-select ${this._selectedRange === 'month' ? 'active' : ''}" title="Maand">${monthOptions}</select></div>`;
            }
            if (isEnergyMode && range === 'week') {
                return `<div class="time-control-group"><div class="time-control-label">Week</div><select id="energy-week-select" class="time-select ${this._selectedRange === 'week' ? 'active' : ''}" title="Week">${weekOptions}</select></div>`;
            }
            return `<div class="time-control-group time-control-button-group"><div class="time-control-label time-control-label-placeholder">&nbsp;</div><button class="time-btn ${this._selectedRange === range ? 'active' : ''}" data-range="${range}">${label}</button></div>`;
        }).join('');

        const customRangeHTML = showCustom ? `
                    <div class="time-selector">
                        ${timeControlsHTML}
                    </div>
                    <div class="custom-range ${(this._selectedRange === 'custom' && showCustom) ? 'visible' : ''}">
                        <label>Start: <input type="datetime-local" id="start-date" /></label>
                        <label>End: <input type="datetime-local" id="end-date" /></label>
                        <button id="apply-custom">Apply</button>
                    </div>
                ` : `
                    <div class="time-selector">
                        ${timeControlsHTML}
                    </div>
                `;
        const timeSelectorHTML = showTimeSelector ? customRangeHTML : '';

        const showVersionBanner = this._config.show_version_banner === true;
        const versionBannerHTML = showVersionBanner
            ? `<div style="background:#ffcc00;color:#222;font-weight:bold;padding:4px 8px;font-size:14px;text-align:center;border-bottom:2px solid #e6b800;">timescale-plotly-card.js versie: ${TSCARD_VERSION}</div>`
            : '';
        const debugTopOffset = showVersionBanner ? 40 : 8;

        const root = this.shadowRoot || this.attachShadow({ mode: 'open' });
        root.innerHTML = `
            ${versionBannerHTML}
            <div id="ts-debug-overlay" style="display:none;position:absolute;top:${debugTopOffset}px;right:10px;z-index:9999;background:rgba(0,0,0,0.85);color:#fff;padding:10px 16px;font-size:13px;border-radius:8px;max-width:400px;box-shadow:0 2px 8px #000;white-space:pre-wrap;"></div>
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
                    min-height: 34px;
                    box-sizing: border-box;
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
                .time-control-button-group .time-btn {
                    width: 100%;
                    height: 34px;
                }
                .time-select {
                    padding: 6px 12px;
                    background: ${this._config.select_background_color || this._config.choice_background_color || this._config.button_background_color || this._config.button_color || 'var(--primary-background-color, #2b2b2b)'};
                    border: 1px solid ${this._config.select_border_color || this._config.button_border_color || this._config.button_border || 'var(--divider-color, #3b3b3b)'};
                    color: ${this._config.select_text_color || this._config.button_text_color || this._config.button_text || 'var(--primary-text-color, #e1e1e1)'};
                    border-radius: ${this._config.button_radius || '4px'};
                    cursor: pointer;
                    font-size: 13px;
                    min-width: 88px;
                    min-height: 34px;
                    height: 34px;
                    box-sizing: border-box;
                }
                .time-select.active {
                    background: ${this._config.select_active_background_color || this._config.button_active_color || this._config.button_active || 'var(--primary-color, #03a9f4)'};
                    border-color: ${this._config.select_active_border_color || this._config.button_active_color || this._config.button_active || 'var(--primary-color, #03a9f4)'};
                    color: ${this._config.select_active_text_color || this._config.button_active_text_color || this._config.button_active_text || 'white'};
                }
                .time-select:focus {
                    outline: none;
                    border-color: ${this._config.button_active_color || this._config.button_active || 'var(--primary-color, #03a9f4)'};
                }
                .time-select option {
                    background: ${this._config.select_option_background_color || this._config.select_background_color || this._config.choice_background_color || this._config.button_background_color || this._config.button_color || 'var(--primary-background-color, #2b2b2b)'};
                    color: ${this._config.select_option_text_color || this._config.select_text_color || this._config.button_text_color || this._config.button_text || 'var(--primary-text-color, #e1e1e1)'};
                }
                .time-picker-row {
                    padding-top: 0;
                }
                .time-control-group {
                    display: inline-flex;
                    flex-direction: column;
                    gap: 4px;
                    justify-content: flex-end;
                }
                .time-control-label {
                    font-size: 11px;
                    line-height: 1;
                    color: ${this._config.select_label_color || this._config.button_text_color || this._config.button_text || 'var(--primary-text-color, #e1e1e1)'};
                    opacity: 0.8;
                    padding-left: 2px;
                }
                .time-control-label-placeholder {
                    visibility: hidden;
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
                .series-totals {
                    display: flex;
                    justify-content: flex-start;
                    align-items: center;
                    gap: 8px;
                    flex-wrap: wrap;
                    padding: 8px 16px 4px 16px;
                }
                .ts-data-table-container {
                    overflow-x: auto;
                    padding: 8px 16px;
                }
                .ts-data-table {
                    border-collapse: collapse;
                    width: 100%;
                    font-size: 13px;
                    color: var(--primary-text-color, #e1e1e1);
                }
                .ts-data-table th, .ts-data-table td {
                    padding: 6px 10px;
                    border: 1px solid rgba(128,128,128,0.3);
                    text-align: right;
                    white-space: nowrap;
                }
                .ts-data-table th {
                    background: rgba(255,255,255,0.05);
                    font-weight: 600;
                }
                .ts-data-table tr:nth-child(even) td {
                    background: rgba(255,255,255,0.03);
                }
                .ts-data-table td:first-child, .ts-data-table th:first-child {
                    text-align: left;
                }
                .series-total-box {
                    padding: 6px 12px;
                    background: ${this._config.button_background_color || this._config.button_color || 'var(--primary-background-color, #2b2b2b)'};
                    border: 1px solid ${this._config.button_border_color || this._config.button_border || 'var(--divider-color, #3b3b3b)'};
                    border-radius: ${this._config.button_radius || '4px'};
                    font-size: 13px;
                    font-weight: 600;
                    min-height: 34px;
                    width: ${this._config.series_total_box_width || '108px'};
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    box-sizing: border-box;
                    white-space: nowrap;
                }
                .series-total-op {
                    color: ${this._config.button_text_color || this._config.button_text || 'var(--primary-text-color, #e1e1e1)'};
                    font-size: 16px;
                    font-weight: 700;
                    line-height: 1;
                    padding: 0 2px;
                    user-select: none;
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
                }
                #axis-title-left {
                    top: ${this._config.axis_title_offset_y_left || this._config.axis_title_offset_y || '-18px'};
                    left: ${this._config.axis_title_offset_left || '0px'};
                }
                #axis-title-right {
                    top: ${this._config.axis_title_offset_y_right || this._config.axis_title_offset_y || '-18px'};
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
                    z-index: 10020 !important;
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
                    z-index: ${this._config.tooltip_z_index || '9998'};
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
        <div class="card-header">${this.resolveTemplateValue(this._config.title) || 'TimescaleDB'}</div>
        <div class="card-content timescale-content">
          ${timeSelectorHTML}
                    <div id="series-totals" class="series-totals" style="display:none;"></div>
                    <div id="data-table-container" class="ts-data-table-container" style="display:none;"></div>
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
        const syncTimeControlState = () => {
            root.querySelectorAll('.time-btn').forEach((btn) => {
                const range = String(btn.getAttribute('data-range') || '').toLowerCase();
                btn.classList.toggle('active', range === this._selectedRange);
            });
            const yearSelect = root.querySelector('#energy-year-select');
            const daySelect = root.querySelector('#energy-day-select');
            const monthSelect = root.querySelector('#energy-month-select');
            const weekSelect = root.querySelector('#energy-week-select');
            if (daySelect) daySelect.classList.toggle('active', this._selectedRange === 'today');
            if (yearSelect) yearSelect.classList.toggle('active', this._selectedRange === 'year');
            if (monthSelect) monthSelect.classList.toggle('active', this._selectedRange === 'month');
            if (weekSelect) weekSelect.classList.toggle('active', this._selectedRange === 'week');
        };
        const activateEnergyRange = (range) => {
            if (!this.isEnergyCalendarMode()) return;
            this._selectedRange = range;
            const customRange = root.querySelector('.custom-range');
            if (customRange) {
                customRange.classList.toggle('visible', range === 'custom');
            }
            syncTimeControlState();
            this.loadData();
            this.publishSyncState('energy-range');
        };
        const buttons = root.querySelectorAll('.time-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const range = e.currentTarget.getAttribute('data-range');
                this._selectedRange = range;
                buttons.forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');

                if (this.isEnergyCalendarMode()) {
                    activateEnergyRange(range);
                    return;
                }

                const customRange = root.querySelector('.custom-range');
                if (range === 'custom') {
                    if (customRange) customRange.classList.add('visible');
                } else {
                    if (customRange) customRange.classList.remove('visible');
                    this.loadData();
                    this.publishSyncState('range-button');
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
                    this.publishSyncState('custom-range');
                }
            });
        }

        const yearSelect = root.querySelector('#energy-year-select');
        if (yearSelect) {
            const activateYearRange = () => activateEnergyRange('year');
            yearSelect.addEventListener('focus', activateYearRange);
            yearSelect.addEventListener('click', activateYearRange);
            yearSelect.addEventListener('change', (e) => {
                const selected = Number(e.target.value);
                if (!Number.isInteger(selected)) return;
                this._selectedYear = selected;
                const now = new Date();
                const monthMax = selected === now.getFullYear() ? now.getMonth() + 1 : 12;
                const weekMax = selected === now.getFullYear() ? Math.min(52, this.getIsoWeekNumber(now)) : 52;
                this._selectedMonth = Math.max(1, Math.min(monthMax, Number(this._selectedMonth) || monthMax));
                const dayMax = (selected === now.getFullYear() && this._selectedMonth === (now.getMonth() + 1))
                    ? now.getDate()
                    : new Date(selected, this._selectedMonth, 0).getDate();
                this._selectedDay = Math.max(1, Math.min(dayMax, Number(this._selectedDay) || dayMax));
                const selectedDate = new Date(this._selectedYear, this._selectedMonth - 1, this._selectedDay, 0, 0, 0, 0);
                this._selectedWeek = Math.max(1, Math.min(weekMax, this.getIsoWeekNumber(selectedDate)));
                activateEnergyRange(this._selectedRange === 'years' ? 'years' : 'year');
                this.render();
            });
        }

        const daySelect = root.querySelector('#energy-day-select');
        if (daySelect) {
            const activateDayRange = () => activateEnergyRange('today');
            daySelect.addEventListener('focus', activateDayRange);
            daySelect.addEventListener('click', activateDayRange);
            daySelect.addEventListener('change', (e) => {
                const selected = Number(e.target.value);
                if (!Number.isInteger(selected)) return;
                this._selectedDay = selected;
                const selectedDate = new Date(this._selectedYear, this._selectedMonth - 1, this._selectedDay, 0, 0, 0, 0);
                this._selectedWeek = Math.min(52, this.getIsoWeekNumber(selectedDate));
                activateEnergyRange('today');
                this.render();
            });
        }

        const monthSelect = root.querySelector('#energy-month-select');
        if (monthSelect) {
            const activateMonthRange = () => activateEnergyRange('month');
            monthSelect.addEventListener('focus', activateMonthRange);
            monthSelect.addEventListener('click', activateMonthRange);
            monthSelect.addEventListener('change', (e) => {
                const selected = Number(e.target.value);
                if (!Number.isInteger(selected)) return;
                this._selectedMonth = selected;
                const now = new Date();
                const dayMax = (this._selectedYear === now.getFullYear() && this._selectedMonth === (now.getMonth() + 1))
                    ? now.getDate()
                    : new Date(this._selectedYear, this._selectedMonth, 0).getDate();
                this._selectedDay = Math.max(1, Math.min(dayMax, Number(this._selectedDay) || dayMax));
                const selectedDate = new Date(this._selectedYear, this._selectedMonth - 1, this._selectedDay, 0, 0, 0, 0);
                const monthWeek = Math.min(52, this.getIsoWeekNumber(selectedDate));
                this._selectedWeek = monthWeek;
                activateEnergyRange('month');
                this.render();
            });
        }

        const weekSelect = root.querySelector('#energy-week-select');
        if (weekSelect) {
            const activateWeekRange = () => activateEnergyRange('week');
            weekSelect.addEventListener('focus', activateWeekRange);
            weekSelect.addEventListener('click', activateWeekRange);
            weekSelect.addEventListener('change', (e) => {
                const selected = Number(e.target.value);
                if (!Number.isInteger(selected)) return;
                this._selectedWeek = selected;
                const weekStart = this.getIsoWeekStart(this._selectedYear, this._selectedWeek);
                this._selectedMonth = weekStart.getMonth() + 1;
                this._selectedYear = weekStart.getFullYear();
                this._selectedDay = weekStart.getDate();
                activateEnergyRange('week');
                this.render();
            });
        }

        syncTimeControlState();
    }

    async loadData() {
        // --- DEBUG OVERLAY ---
        const root = this.shadowRoot || this;
        const debugEl = root.querySelector('#ts-debug-overlay');
        const debugEnabled = this._config.show_debug_overlay === true || this._config.debug_overlay === true;
        function showDebug(info) {
            if (!debugEnabled || !debugEl) return;
            debugEl.style.display = 'block';
            debugEl.textContent = info;
        }
        function hideDebug() {
            if (debugEl) debugEl.style.display = 'none';
        }
        if (!debugEnabled && debugEl) {
            debugEl.style.display = 'none';
            debugEl.textContent = '';
        }
        const chartEl = root.querySelector('#chart');
        const statusEl = root.querySelector('#status');
        const legendEl = root.querySelector('#legend');
        const axisTitlesEl = root.querySelector('#axis-titles');
        const axisTitleLeftEl = root.querySelector('#axis-title-left');
        const axisTitleRightEl = root.querySelector('#axis-title-right');
        if (!chartEl) return;
        if (!this._hass) {
            if (statusEl && this._config.show_status_text !== false) {
                statusEl.textContent = 'Waiting for Home Assistant...';
            }
            showDebug('No Home Assistant instance available yet (this._hass is missing).');
            return;
        }

        // --- Catch-all error handling wrapper ---
        const setStatus = (msg) => { if (statusEl) statusEl.textContent = msg; };
        try {
            await this._loadDataInner({
                root,
                chartEl,
                statusEl,
                legendEl,
                axisTitlesEl,
                axisTitleLeftEl,
                axisTitleRightEl,
                debugEl,
                showDebug,
                hideDebug,
                setStatus
            });
        } catch (err) {
            setStatus('Error: ' + (err && err.message ? err.message : String(err)));
            showDebug('UNHANDLED ERROR:\n' + (err && err.stack ? err.stack : String(err)));
            console.error('[TIMESCALE-PLOTLY-CARD] Unhandled error in loadData:', err);
        }
    }

    // The actual logic, split out for error wrapping
    async _loadDataInner({ root, chartEl, statusEl, legendEl, axisTitlesEl, axisTitleLeftEl, axisTitleRightEl, debugEl, showDebug, hideDebug, setStatus }) {

        try {
            const clearCurrentPlot = () => {
                try {
                    if (window.Plotly && chartEl) {
                        Plotly.purge(chartEl);
                    }
                } catch (e) {
                    // ignore cleanup errors
                }
                if (chartEl) {
                    chartEl.innerHTML = '';
                }
                if (legendEl) {
                    legendEl.classList.remove('visible');
                    legendEl.innerHTML = '';
                }
                if (axisTitlesEl) {
                    axisTitlesEl.classList.remove('visible');
                }
                if (axisTitleLeftEl) {
                    axisTitleLeftEl.textContent = '';
                }
                if (axisTitleRightEl) {
                    axisTitleRightEl.textContent = '';
                }
            };

            const renderNoDataGrid = async (message) => {
                clearCurrentPlot();
                if (!window.Plotly || !chartEl) return;
                const noDataLayout = {
                    paper_bgcolor: this._config.paper_bg_color || this._config.paper_bgcolor || 'rgba(0,0,0,0)',
                    plot_bgcolor: this._config.plot_bg_color || this._config.plot_bgcolor || 'rgba(0,0,0,0)',
                    margin: {
                        t: Number(this._config.margin_top) || 40,
                        r: Number(this._config.margin_right) || 10,
                        b: Number(this._config.margin_bottom) || 40,
                        l: Number(this._config.margin_left) || 50
                    },
                    showlegend: false,
                    xaxis: {
                        range: [0, 1],
                        showgrid: true,
                        gridcolor: this._config.grid_color || 'rgba(128,128,128,0.3)',
                        zeroline: false,
                        showticklabels: false,
                        fixedrange: true
                    },
                    yaxis: {
                        range: [0, 1],
                        showgrid: true,
                        gridcolor: this._config.grid_color || 'rgba(128,128,128,0.3)',
                        zeroline: false,
                        showticklabels: false,
                        fixedrange: true
                    },
                    annotations: [{
                        x: 0.5,
                        y: 0.5,
                        xref: 'paper',
                        yref: 'paper',
                        text: message || 'No data',
                        showarrow: false,
                        font: {
                            size: 16,
                            color: this._config.font_color || 'var(--primary-text-color, #e1e1e1)'
                        }
                    }]
                };
                await Plotly.newPlot(chartEl, [], noDataLayout, {
                    displayModeBar: this._config.show_modebar !== false,
                    responsive: true
                });
            };

            const showStatusText = this._config.show_status_text !== false;
            if (statusEl) {
                statusEl.style.display = showStatusText ? '' : 'none';
            }
            const showTable = this._config.show_table === true;
            const showChart = this._config.show_chart !== false;
            const tableContainerEl = root.querySelector('#data-table-container');
            const escapeHtml = (value) => String(value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
            const renderDataTable = (responses, seriesConfigs) => {
                if (!tableContainerEl) return;
                if (!showTable) {
                    tableContainerEl.style.display = 'none';
                    tableContainerEl.innerHTML = '';
                    return;
                }

                let rows = [];
                responses.forEach((responseRows, idx) => {
                    const series = seriesConfigs[idx] || {};
                    const seriesName = series.name || series.sensor_id || `series_${idx + 1}`;
                    (Array.isArray(responseRows) ? responseRows : []).forEach((row) => {
                        rows.push({ series: seriesName, ...row });
                    });
                });

                if (!rows.length) {
                    tableContainerEl.style.display = 'block';
                    tableContainerEl.innerHTML = '<div class="ts-data-table-empty">No table data</div>';
                    return;
                }

                const preferredOrder = ['series', 'time', 'bucket', 'entity_id', 'state', 'value', 'avg_state', 'min_state', 'max_state'];
                const allKeys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
                const selectedColumnsRaw = this._config.table_columns;
                let columns = Array.isArray(selectedColumnsRaw) && selectedColumnsRaw.length
                    ? selectedColumnsRaw.map((col) => String(col))
                    : preferredOrder.filter((key) => allKeys.includes(key));
                const remaining = allKeys.filter((key) => !columns.includes(key));
                columns = [...columns, ...remaining];

                const limitRaw = this._config.table_limit;
                const tableLimit = Number.isFinite(Number(limitRaw)) && Number(limitRaw) > 0
                    ? Math.floor(Number(limitRaw))
                    : 200;
                const sortedRows = rows.slice().sort((a, b) => {
                    const ta = new Date(a.time || a.bucket || 0).getTime();
                    const tb = new Date(b.time || b.bucket || 0).getTime();
                    return tb - ta;
                }).slice(0, tableLimit);

                const headerHtml = columns.map((col) => `<th>${escapeHtml(col)}</th>`).join('');
                const bodyHtml = sortedRows.map((row) => {
                    const cells = columns.map((col) => {
                        const value = row[col];
                        if (value === null || value === undefined) return '<td></td>';
                        if (col === 'time' || col === 'bucket') {
                            const dt = new Date(value);
                            return `<td>${Number.isFinite(dt.getTime()) ? escapeHtml(dt.toLocaleString()) : escapeHtml(value)}</td>`;
                        }
                        return `<td>${escapeHtml(value)}</td>`;
                    }).join('');
                    return `<tr>${cells}</tr>`;
                }).join('');

                tableContainerEl.innerHTML = `<table class="ts-data-table"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
                tableContainerEl.style.display = 'block';
            };

            if (chartEl) {
                chartEl.style.display = showChart ? '' : 'none';
            }
            if (!showChart) {
                clearCurrentPlot();
                const totalsEl = root.querySelector('#series-totals');
                if (totalsEl) {
                    totalsEl.style.display = 'none';
                    totalsEl.innerHTML = '';
                }
            }

            if (showChart && !window.Plotly) {
                if (showStatusText) {
                    statusEl.textContent = 'Loading Plotly...';
                }
                showDebug('Stap 1: Plotly laden...');
                await this.loadPlotly();
                showDebug('Stap 1: Plotly geladen');
            }

            // Calculate time range
            showDebug('Stap 2: Time range bepalen...');
            const energyMode = this.isEnergyCalendarMode();
            const now = new Date();
            let endTime, startTime, queryStartTime, queryEndTime, downsample;
            let energyWindow = null;

            if (energyMode) {
                energyWindow = this.resolveEnergyWindow(now, this._selectedRange);
                startTime = energyWindow.startTime;
                endTime = energyWindow.endTime;
                queryStartTime = energyWindow.queryStart || startTime;
                queryEndTime = energyWindow.queryEnd || new Date(Math.min(endTime.getTime(), now.getTime()));
                downsample = this._config.energy_downsample || energyWindow.queryDownsampleSeconds || 900;
            } else if (this._selectedRange === 'custom' && this._customStart && this._customEnd) {
                startTime = this._customStart;
                endTime = this._customEnd;
                queryStartTime = startTime;
                queryEndTime = endTime;
                const diffMs = endTime - startTime;
                const diffHours = diffMs / (1000 * 60 * 60);
                downsample = this._config.downsample || (diffHours > 24 ? 3600 : (diffHours > 6 ? 900 : 300));
            } else {
                endTime = now;
                const hours = parseInt(this._selectedRange) || 24;
                startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);
                queryStartTime = startTime;
                queryEndTime = endTime;

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
            showDebug('Stap 3: entities mappen...');

            // --- Entity mapping per tijdsresolutie ---
            const selectedRangeRaw = String(this._selectedRange || 'today').toLowerCase();
            const selectedRange = selectedRangeRaw === 'day' ? 'today' : selectedRangeRaw;
            const entitiesRaw = (Array.isArray(this._config.entities) && this._config.entities.length
                ? this._config.entities
                : [{
                    sensor_id: this.resolveTemplateValue(this._config.sensor_id),
                    entity: this.resolveTemplateValue(this._config.entity),
                    daily: this.resolveTemplateValue(this._config.daily),
                    monthly: this.resolveTemplateValue(this._config.monthly),
                    yearly: this.resolveTemplateValue(this._config.yearly)
                }]).map((entry) => this.resolveEntityConfigTemplates(entry));
            // mappedEntities: altijd objecten met geldige sensor_id
            const mappedEntities = entitiesRaw.map(e => {
                let entityObj = (typeof e === 'string') ? { sensor_id: e } : { ...e };
                let entityId = resolveEntityForRange(entityObj, selectedRange);
                if (!entityId && entityObj.sensor_id) {
                    entityId = entityObj.sensor_id;
                }

                if (entityId && typeof entityId === 'string') {
                    const baseId = entityId.trim();
                    if ((selectedRange === 'week' || selectedRange === 'month') && !entityObj.daily && /_hourly$/i.test(baseId)) {
                        const candidateDaily = baseId.replace(/_hourly$/i, '_daily');
                        if (this._hass?.states?.[candidateDaily]) {
                            entityId = candidateDaily;
                        }
                    }
                    if (selectedRange === 'year' && !entityObj.monthly && /_hourly$/i.test(baseId)) {
                        const candidateMonthly = baseId.replace(/_hourly$/i, '_monthly');
                        if (this._hass?.states?.[candidateMonthly]) {
                            entityId = candidateMonthly;
                        }
                    }
                }
                if (!entityId) return null;
                const selectedIsWeekOrMonth = selectedRange === 'week' || selectedRange === 'month';
                const selectedIsYear = selectedRange === 'year';
                const selectedIsYears = selectedRange === 'years';
                const resolvedFromDaily = selectedIsWeekOrMonth
                    && typeof entityObj.daily === 'string'
                    && entityObj.daily.trim() === entityId;
                const resolvedFromMonthly = selectedIsYear
                    && typeof entityObj.monthly === 'string'
                    && entityObj.monthly.trim() === entityId;
                const resolvedFromYearly = selectedIsYears
                    && typeof entityObj.yearly === 'string'
                    && entityObj.yearly.trim() === entityId;

                return {
                    ...entityObj,
                    sensor_id: entityId,
                    _aggregate_boundary_shift: resolvedFromDaily || resolvedFromMonthly || resolvedFromYearly
                };
            }).filter(Boolean);

            // --- Toon debug info ---
            showDebug(
                `Range: ${selectedRange}\n` +
                mappedEntities.map((e, i) => `#${i + 1}: sensor_id: ${e.sensor_id}\n  config: ${JSON.stringify(e, null, 2)}`).join('\n')
            );

            if (!mappedEntities.length) {
                showDebug('No valid sensor_id found in entities for this range!');
                throw new Error('No valid sensor_id found in entities for this range');
            }

            showDebug(`Stap 4: backend queries starten (${mappedEntities.length} sensors)`);

            const queryJobs = mappedEntities.map(series => {
                const selectedTableRaw = series.table ?? this._config.table;
                const selectedTable = typeof selectedTableRaw === 'string' ? selectedTableRaw.trim() : selectedTableRaw;
                const configuredMethod = String(series.downsample_method || this._config.downsample_method || '').toLowerCase();
                const queryTimeoutRaw = series.query_timeout_ms ?? this._config.query_timeout_ms ?? 20000;
                const queryTimeoutMs = Number(queryTimeoutRaw);
                const sensorLooksDaily = /_daily$/i.test(String(series.sensor_id || ''));
                const sensorLooksYearly = /_yearly$/i.test(String(series.sensor_id || ''));
                const useDailyProjectionQuery = energyMode
                    && (selectedRange === 'week' || selectedRange === 'month')
                    && (series._aggregate_boundary_shift === true || sensorLooksDaily);
                const useRawForYearly = energyMode
                    && selectedRange === 'years'
                    && (series._aggregate_boundary_shift === true || sensorLooksYearly);
                const seriesDownsample = useRawForYearly
                    ? 0
                    : useDailyProjectionQuery
                        ? Math.min(3600, Math.max(300, Number(downsample) || 900))
                        : downsample;
                const msgBase = {
                    type: 'timescale/query',
                    sensor_id: series.sensor_id,
                    downsample: seriesDownsample
                };
                if (selectedTable) {
                    msgBase.table = selectedTable;
                }
                const seriesStateClass = String(this._hass?.states?.[series.sensor_id]?.attributes?.state_class || '').toLowerCase();
                const inferredEnergySourceType = seriesStateClass === 'total_increasing' ? 'cumulative' : 'delta';
                const energySourceType = String(series.energy_source_type || series.energy_source || this._config.energy_source_type || inferredEnergySourceType).toLowerCase();
                if (useDailyProjectionQuery) {
                    msgBase.downsample_method = 'last';
                } else if (energyMode && energySourceType === 'cumulative') {
                    msgBase.downsample_method = 'last';
                } else if (configuredMethod === 'avg' || configuredMethod === 'last') {
                    msgBase.downsample_method = configuredMethod;
                } else if (selectedTable && /(?:minute|aggregate)/i.test(String(selectedTable))) {
                    msgBase.downsample_method = 'last';
                }
                const entryIdRaw = series.entry_id ?? this._config.entry_id;
                const entryId = typeof entryIdRaw === 'string' ? entryIdRaw.trim() : entryIdRaw;
                if (entryId) {
                    msgBase.entry_id = entryId;
                }
                const databaseRaw = series.database ?? this._config.database;
                const database = typeof databaseRaw === 'string' ? databaseRaw.trim() : databaseRaw;
                if (database) {
                    msgBase.database = database;
                }
                const maxQuerySpanSecondsRaw = series.max_query_span_seconds ?? this._config.max_query_span_seconds ?? 31536000;
                const maxQuerySpanSeconds = Number(maxQuerySpanSecondsRaw);
                const startMs = queryStartTime.getTime();
                const endMs = queryEndTime.getTime();
                const maxSpanMs = Number.isFinite(maxQuerySpanSeconds) && maxQuerySpanSeconds > 0
                    ? Math.max(60000, Math.floor(maxQuerySpanSeconds * 1000))
                    : null;

                const chunkRanges = [];
                if (!maxSpanMs || (endMs - startMs) <= maxSpanMs) {
                    chunkRanges.push([startMs, endMs]);
                } else {
                    let chunkStart = startMs;
                    while (chunkStart <= endMs) {
                        const chunkEnd = Math.min(endMs, chunkStart + maxSpanMs);
                        chunkRanges.push([chunkStart, chunkEnd]);
                        chunkStart = chunkEnd + 1;
                    }
                }

                const sendChunk = (chunkStartMs, chunkEndMs) => {
                    const chunkMsg = {
                        ...msgBase,
                        start: new Date(chunkStartMs).toISOString(),
                        end: new Date(chunkEndMs).toISOString()
                    };

                    const requestPromise = this._hass.connection.sendMessagePromise(chunkMsg)
                        .catch((error) => {
                            const detail = [
                                `sensor_id=${series.sensor_id}`,
                                database ? `database=${database}` : null,
                                selectedTable ? `table=${selectedTable}` : null,
                                entryId ? `entry_id=${entryId}` : null,
                                `start=${chunkMsg.start}`,
                                `end=${chunkMsg.end}`
                            ].filter(Boolean).join(', ');
                            const reason = error?.message || String(error);
                            throw new Error(`${reason} (${detail})`);
                        });

                    if (!Number.isFinite(queryTimeoutMs) || queryTimeoutMs <= 0) {
                        return requestPromise;
                    }

                    return new Promise((resolve, reject) => {
                        const timer = setTimeout(() => {
                            reject(new Error(`Query timeout after ${queryTimeoutMs}ms (sensor_id=${series.sensor_id}, start=${chunkMsg.start}, end=${chunkMsg.end})`));
                        }, queryTimeoutMs);

                        requestPromise
                            .then((response) => {
                                clearTimeout(timer);
                                resolve(response);
                            })
                            .catch((error) => {
                                clearTimeout(timer);
                                reject(error);
                            });
                    });
                };

                return Promise.all(chunkRanges.map(([chunkStart, chunkEnd]) => sendChunk(chunkStart, chunkEnd)))
                    .then((parts) => parts.flatMap((resp) => (Array.isArray(resp) ? resp : [])));
            });

            const responses = await Promise.all(queryJobs);
            showDebug(`Stap 5: backend antwoorden ontvangen (${responses.length} responses)`);

            const seriesConfigs = mappedEntities;
            renderDataTable(responses, seriesConfigs);

            const totalPoints = responses.reduce((sum, resp) => sum + (Array.isArray(resp) ? resp.length : 0), 0);
            if (totalPoints === 0) {
                await renderNoDataGrid('No data');
                if (showStatusText) {
                    statusEl.textContent = 'No data found';
                }
                showDebug('Klaar: 0 punten ontvangen (No data found)');
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

            const dayMs = 24 * 60 * 60 * 1000;
            const alignDayStart = (t) => {
                const d = new Date(t);
                d.setHours(0, 0, 0, 0);
                return d.getTime();
            };

            const offset = allTimes.length ? (Math.min(...allTimes) % downsampleMs) : (startTime.getTime() % downsampleMs);
            const alignTimeFloor = (t) => Math.floor((t - offset) / downsampleMs) * downsampleMs + offset;
            const alignTimeCeil = (t) => Math.ceil((t - offset) / downsampleMs) * downsampleMs + offset;

            let xBase = [];
            let energyContext = null;

            if (energyMode && energyWindow) {
                const nowMs = now.getTime();
                const bucketStarts = [];
                const bucketEnds = [];
                const bucketFuture = [];
                const bucketMode = energyWindow.bucketMode || 'fixed';
                const startMs = energyWindow.startTime.getTime();
                const endMs = energyWindow.endTime.getTime();

                if (bucketMode === 'fixed') {
                    const bucketMs = Math.max(60 * 1000, Number(energyWindow.bucketMs || downsampleMs));
                    const first = Math.floor(startMs / bucketMs) * bucketMs;
                    for (let t = first; t <= endMs; t += bucketMs) {
                        if (t < startMs) continue;
                        bucketStarts.push(t);
                        bucketEnds.push(Math.min(endMs, t + bucketMs - 1));
                        bucketFuture.push(t > nowMs);
                    }
                } else if (bucketMode === 'day') {
                    for (let t = alignDayStart(startMs); t <= endMs; t += dayMs) {
                        if (t < startMs) continue;
                        bucketStarts.push(t);
                        bucketEnds.push(Math.min(endMs, t + dayMs - 1));
                        bucketFuture.push(t > nowMs);
                    }
                } else if (bucketMode === 'month') {
                    const cursor = new Date(energyWindow.startTime.getFullYear(), energyWindow.startTime.getMonth(), 1, 0, 0, 0, 0);
                    while (cursor.getTime() <= endMs) {
                        const start = cursor.getTime();
                        if (start >= startMs) {
                            const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1, 0, 0, 0, 0);
                            bucketStarts.push(start);
                            bucketEnds.push(Math.min(endMs, next.getTime() - 1));
                            bucketFuture.push(start > nowMs);
                        }
                        cursor.setMonth(cursor.getMonth() + 1);
                    }
                } else {
                    let cursorYear = energyWindow.startTime.getFullYear();
                    let cursorMs = Date.UTC(cursorYear, 0, 1, 0, 0, 0, 0);
                    while (cursorMs <= endMs) {
                        const start = cursorMs;
                        if (start >= startMs) {
                            const nextMs = Date.UTC(cursorYear + 1, 0, 1, 0, 0, 0, 0);
                            bucketStarts.push(start);
                            bucketEnds.push(Math.min(endMs, nextMs - 1));
                            bucketFuture.push(start > nowMs);
                        }
                        cursorYear++;
                        cursorMs = Date.UTC(cursorYear, 0, 1, 0, 0, 0, 0);
                    }
                }

                xBase = bucketStarts.map(ms => new Date(ms));

                const dayKeyToIndex = new Map();
                const monthKeyToIndex = new Map();
                const yearKeyToIndex = new Map();
                bucketStarts.forEach((ms, idx) => {
                    const d = new Date(ms);
                    dayKeyToIndex.set(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`, idx);
                    monthKeyToIndex.set(`${d.getFullYear()}-${d.getMonth()}`, idx);
                    yearKeyToIndex.set(`${d.getUTCFullYear()}`, idx);
                });

                const findBucketIndex = (timeMs) => {
                    if (!Number.isFinite(timeMs) || timeMs < startMs || timeMs > endMs) return -1;
                    if (bucketMode === 'fixed') {
                        const bucketMs = Math.max(60 * 1000, Number(energyWindow.bucketMs || downsampleMs));
                        const base = bucketStarts[0];
                        const idx = Math.floor((timeMs - base) / bucketMs);
                        return idx >= 0 && idx < bucketStarts.length ? idx : -1;
                    }
                    if (bucketMode === 'day') {
                        const d = new Date(alignDayStart(timeMs));
                        const idx = dayKeyToIndex.get(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
                        return Number.isInteger(idx) ? idx : -1;
                    }
                    if (bucketMode === 'month') {
                        const d = new Date(timeMs);
                        const idx = monthKeyToIndex.get(`${d.getFullYear()}-${d.getMonth()}`);
                        return Number.isInteger(idx) ? idx : -1;
                    }
                    const d = new Date(timeMs);
                    const idx = yearKeyToIndex.get(`${d.getUTCFullYear()}`);
                    return Number.isInteger(idx) ? idx : -1;
                };

                energyContext = {
                    bucketMode,
                    xBase,
                    bucketFuture,
                    findBucketIndex,
                    futureAsNull: energyWindow.futureAsNull !== false
                };
            } else {
                const startMs = alignTimeFloor(startTime.getTime());
                const endMs = alignTimeCeil(endTime.getTime());
                for (let t = startMs; t <= endMs; t += downsampleMs) {
                    xBase.push(new Date(t));
                }
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
                const valueLabelRaw = seriesConfig.tooltip_label_text ?? this._config.tooltip_label_text;
                const valueLabel = this.resolveTemplateValue(valueLabelRaw);
                const labelText = valueLabel || seriesName || 'Value';
                const formatValue = (val) => (Number.isFinite(val) ? Number(val).toFixed(2) : '—');

                const stateMapRaw = seriesConfig.state_map || this._config.state_map;
                const stateMap = stateMapRaw
                    ? Object.fromEntries(Object.entries(stateMapRaw).map(([k, v]) => [String(k).toLowerCase(), Number(v)]))
                    : null;
                const resolveValue = (rawValue) => {
                    const numeric = parseFloat(rawValue);
                    if (Number.isFinite(numeric)) return numeric;
                    if (stateMap && rawValue != null) {
                        const mapped = stateMap[String(rawValue).toLowerCase()];
                        if (Number.isFinite(mapped)) return mapped;
                    }
                    return NaN;
                };

                const formatEnergyBucketDate = (time, bucketMode) => {
                    const d = new Date(time);
                    if (bucketMode === 'year') {
                        return d.toLocaleDateString('nl-NL', { year: 'numeric' });
                    }
                    if (bucketMode === 'month') {
                        return d.toLocaleDateString('nl-NL', { month: '2-digit', year: 'numeric' });
                    }
                    if (bucketMode === 'day') {
                        return d.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' });
                    }
                    return d.toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                };

                let x = xBase;
                let y = [];
                let plotText = [];
                let hasData = false;

                if (energyMode && energyContext) {
                    const stateClass = String(stateObj?.attributes?.state_class || '').toLowerCase();
                    const inferredSourceType = stateClass === 'total_increasing' ? 'cumulative' : 'delta';
                    const sourceType = String(seriesConfig.energy_source_type || seriesConfig.energy_source || this._config.energy_source_type || inferredSourceType).toLowerCase();
                    const cumulativeMode = String(seriesConfig.energy_cumulative_mode || this._config.energy_cumulative_mode || 'last').toLowerCase();
                    const handleReset = seriesConfig.energy_handle_reset !== false && this._config.energy_handle_reset !== false;
                    const bucketTotals = Array(energyContext.xBase.length).fill(0);
                    const bucketHasData = Array(energyContext.xBase.length).fill(false);
                    const normalizeAggregateBoundaryTime = (pointTimeMs) => {
                        if (!Number.isFinite(pointTimeMs)) return pointTimeMs;
                        const sensorIdText = String(sensorId || '').toLowerCase();
                        const isAggregateSensor = /(_daily|_monthly|_yearly)$/.test(sensorIdText) || seriesConfig._aggregate_boundary_shift === true;
                        if (!isAggregateSensor) return pointTimeMs;

                        const d = new Date(pointTimeMs);
                        const isOnHour = d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0;
                        if (!isOnHour) return pointTimeMs;

                        const boundaryHourTolerance = 2;
                        const isNearMidnightBoundary = d.getHours() >= 0 && d.getHours() <= boundaryHourTolerance;
                        if (!isNearMidnightBoundary) return pointTimeMs;

                        const localDayStartMs = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();

                        if (energyContext.bucketMode === 'day') {
                            return pointTimeMs;
                        }
                        if (energyContext.bucketMode === 'month' && d.getDate() === 1) {
                            const monthStartMs = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0).getTime();
                            return monthStartMs - 1;
                        }
                        if (energyContext.bucketMode === 'year' && d.getDate() === 1 && d.getMonth() === 0) {
                            const sensorLooksYearly = /_yearly$/i.test(sensorIdText);
                            if (sensorLooksYearly) {
                                return pointTimeMs;
                            }
                            const yearStartMs = new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0).getTime();
                            return yearStartMs - 1;
                        }

                        return pointTimeMs;
                    };

                    const rawPoints = (response || [])
                        .map(d => {
                            const sourceTime = new Date(d.bucket || d.time || 0).getTime();
                            const t = normalizeAggregateBoundaryTime(sourceTime);
                            // Prefer the numeric column. In a minute-aggregate table the
                            // text state of a numeric sensor is a '0' placeholder and the
                            // real number only lives in value/avg_state, so reading state
                            // first flattens every bucket to zero. Only take the text state
                            // first when a state_map has to translate it.
                            const rawValue = stateMap ? (d.state ?? d.avg_state) : (d.avg_state ?? d.state);
                            const value = resolveValue(rawValue);
                            return { t, value };
                        })
                        .filter(point => Number.isFinite(point.t) && Number.isFinite(point.value))
                        .sort((a, b) => a.t - b.t);

                    const sensorLooksDaily = /_daily$/i.test(String(sensorId || ''));
                    const useDailyProjection = (selectedRange === 'week' || selectedRange === 'month')
                        && (seriesConfig._aggregate_boundary_shift === true || sensorLooksDaily);

                    if (useDailyProjection) {
                        rawPoints.forEach(point => {
                            const idx = energyContext.findBucketIndex(point.t);
                            if (idx < 0 || idx >= bucketTotals.length) return;
                            if (energyContext.futureAsNull && energyContext.bucketFuture[idx]) return;
                            if (!bucketHasData[idx]) {
                                bucketTotals[idx] = point.value;
                                bucketHasData[idx] = true;
                                return;
                            }
                            bucketTotals[idx] = Math.max(bucketTotals[idx], point.value);
                        });
                    } else if (sourceType === 'cumulative' && cumulativeMode === 'diff') {
                        let prev = null;
                        rawPoints.forEach(point => {
                            if (prev === null) {
                                prev = point.value;
                                return;
                            }
                            const diff = point.value - prev;
                            let add = null;
                            if (diff >= 0) {
                                add = diff;
                            } else if (handleReset) {
                                add = point.value >= 0 ? point.value : 0;
                            }
                            prev = point.value;
                            if (!Number.isFinite(add)) return;
                            const idx = energyContext.findBucketIndex(point.t);
                            if (idx < 0 || idx >= bucketTotals.length) return;
                            if (energyContext.futureAsNull && energyContext.bucketFuture[idx]) return;
                            bucketTotals[idx] += add;
                            bucketHasData[idx] = true;
                        });
                    } else if (sourceType === 'cumulative') {
                        rawPoints.forEach(point => {
                            const idx = energyContext.findBucketIndex(point.t);
                            if (idx < 0 || idx >= bucketTotals.length) return;
                            if (energyContext.futureAsNull && energyContext.bucketFuture[idx]) return;
                            bucketTotals[idx] = point.value;
                            bucketHasData[idx] = true;
                        });
                    } else {
                        rawPoints.forEach(point => {
                            const idx = energyContext.findBucketIndex(point.t);
                            if (idx < 0 || idx >= bucketTotals.length) return;
                            if (energyContext.futureAsNull && energyContext.bucketFuture[idx]) return;
                            bucketTotals[idx] += point.value;
                            bucketHasData[idx] = true;
                        });
                    }

                    y = bucketTotals.map((val, idx) => {
                        if (energyContext.futureAsNull && energyContext.bucketFuture[idx]) return null;
                        if (!bucketHasData[idx]) return 0;
                        return val;
                    });
                    hasData = bucketHasData.some(Boolean);

                    plotText = x.map((time, i) => {
                        const formatted = formatEnergyBucketDate(time, energyContext.bucketMode);
                        return `${formatted}<br>${labelText}: ${formatValue(y[i])}${unitSuffix}`;
                    });
                } else {
                    const dataByTime = new Map();
                    (response || []).forEach(d => {
                        const t = new Date(d.bucket || d.time || 0).getTime();
                        if (!Number.isFinite(t)) return;
                        const key = alignTimeFloor(t);
                        const rawValue = stateMap ? (d.state ?? d.avg_state) : (d.avg_state ?? d.state);
                        const raw = resolveValue(rawValue);
                        dataByTime.set(key, Number.isFinite(raw) ? raw : null);
                    });
                    hasData = Array.from(dataByTime.values()).some(v => Number.isFinite(v));

                    const yBase = xBase.map(time => {
                        const raw = dataByTime.get(time.getTime());
                        return Number.isFinite(raw) ? raw : null;
                    });

                    const ySource = (() => {
                        if (gapDropToZero || !extendEdgeGaps || yBase.length === 0) return yBase;
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

                    y = ySource;

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
                }

                const lineColor = seriesConfig.line_color || seriesConfig.color || this._config.line_color || this._config.color || defaultColors[index % defaultColors.length];
                const fillEnabled = seriesConfig.fill !== false && this._config.fill !== false;
                const fillColor = seriesConfig.fill_color || this._config.fill_color || this._config.fillcolor || 'rgba(75,192,192,0.2)';
                const barValueTextColor = seriesConfig.bar_value_text_color
                    || seriesConfig.bar_value_font_color
                    || this._config.bar_value_text_color
                    || this._config.bar_value_font_color
                    || this._config.font_color
                    || 'var(--primary-text-color, #e1e1e1)';
                const lineWidth = seriesConfig.line_width || this._config.line_width || 2;
                const lineShape = seriesConfig.line_shape || this._config.line_shape || 'linear';
                const chartType = seriesConfig.type || seriesConfig.chart_type || this._config.chart_type || (energyMode ? 'bar' : 'line');
                const showTotalBox = (seriesConfig.show_total_box ?? true) !== false;
                const hideZeroValues = energyMode && (seriesConfig.hide_zero_values ?? this._config.hide_zero_values ?? true) === true;
                if (hideZeroValues) {
                    y = y.map((value) => {
                        if (!Number.isFinite(value)) return value;
                        return Math.abs(value) < 1e-12 ? null : value;
                    });
                }
                const axisSideRaw = (seriesConfig.yaxis || seriesConfig.axis || 'left');
                const axisSide = String(axisSideRaw).toLowerCase() === 'right' ? 'right' : 'left';

                const binaryLabelsRaw = seriesConfig.binary_labels || this._config.binary_labels;
                const binaryLabels = Array.isArray(binaryLabelsRaw) && binaryLabelsRaw.length >= 2
                    ? binaryLabelsRaw
                    : null;

                return {
                    x,
                    y,
                    hasData,
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
                    showTotalBox,
                    barValueTextColor,
                    gapDropToZero,
                    connectGaps,
                    binaryLabels
                };
            };

            const seriesData = seriesConfigs.map((seriesConfig, index) => buildSeries(seriesConfig, responses[index], index));
            const hasAnySeriesData = seriesData.some(series => series.hasData === true);
            if (!hasAnySeriesData) {
                if (showChart) {
                    await renderNoDataGrid('No data');
                }
                if (showStatusText) {
                    statusEl.textContent = 'No data found';
                }
                return;
            }

            // Calculate automatic Y-axis range with margin
            const leftSeries = seriesData.filter(series => series.axisSide !== 'right');
            const rightSeries = seriesData.filter(series => series.axisSide === 'right');
            const leftBinaryLabels = leftSeries.find(s => s.binaryLabels)?.binaryLabels || null;
            const rightBinaryLabels = rightSeries.find(s => s.binaryLabels)?.binaryLabels || null;
            const leftYAll = leftSeries.flatMap(series => series.y || []);
            const rightYAll = rightSeries.flatMap(series => series.y || []);
            const allY = seriesData.flatMap(series => series.y || []);
            const finiteY = allY.filter(v => Number.isFinite(v));
            if (finiteY.length === 0) {
                if (showChart) {
                    await renderNoDataGrid('No data');
                }
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
            const totalsEl = root.querySelector('#series-totals');
            const totalsDecimals = Number.isFinite(Number(this._config.totals_decimals))
                ? Math.max(0, Number(this._config.totals_decimals))
                : (Number.isFinite(Number(this._config.bar_value_decimals)) ? Math.max(0, Number(this._config.bar_value_decimals)) : 2);
            const formatTotalValue = (value) => {
                if (!Number.isFinite(value)) return '0';
                const fixed = Number(value).toFixed(totalsDecimals);
                return fixed.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
            };
            const updateSeriesTotals = () => {
                if (!totalsEl) return;
                const visibleBarSeries = seriesData
                    .map((series, index) => ({ series, index }))
                    .filter(({ series, index }) => String(series.chartType || 'line').toLowerCase() === 'bar'
                        && series.showTotalBox !== false
                        && (this._legendVisibility?.[index] !== false));

                if (!visibleBarSeries.length) {
                    totalsEl.style.display = 'none';
                    totalsEl.innerHTML = '';
                    return;
                }

                const seriesTotals = visibleBarSeries.map(({ series }) => ({
                    series,
                    total: (series.y || []).reduce((sum, value) => Number.isFinite(value) ? (sum + Number(value)) : sum, 0)
                }));
                const grandTotal = seriesTotals.reduce((sum, item) => sum + item.total, 0);
                const unitCandidates = [...new Set(seriesTotals.map(item => String(item.series.unitValue || '').trim()).filter(Boolean))];
                const totalUnit = unitCandidates.length ? unitCandidates[0] : '';

                const htmlParts = [];
                seriesTotals.forEach((item, idx) => {
                    const textColor = item.series.lineColor || this._config.button_text_color || 'var(--primary-text-color, #e1e1e1)';
                    const seriesUnit = String(item.series.unitValue || '').trim();
                    htmlParts.push(`<div class="series-total-box" style="color:${textColor};">${formatTotalValue(item.total)}${seriesUnit ? ` ${seriesUnit}` : ''}</div>`);
                    if (idx < seriesTotals.length - 1) {
                        htmlParts.push('<div class="series-total-op">+</div>');
                    }
                });
                const showGrandTotal = !(this._config.show_grand_total === false || this._config.show_grand_total === 'false');
                if (showGrandTotal) {
                    htmlParts.push('<div class="series-total-op">=</div>');
                    htmlParts.push(`<div class="series-total-box" style="color:${this._config.button_text_color || this._config.button_text || 'var(--primary-text-color, #e1e1e1)'};">${formatTotalValue(grandTotal)}${totalUnit ? ` ${totalUnit}` : ''}</div>`);
                }

                totalsEl.innerHTML = htmlParts.join('');
                totalsEl.style.display = 'flex';
            };
            const normalizeTitle = (value) => {
                if (value === null || value === undefined) return '';
                const text = String(value).trim();
                if (!text) return '';
                if (text.toLowerCase() === 'nan') return '';
                return text;
            };
            const hasOwnConfigValue = (key) => Object.prototype.hasOwnProperty.call(this._config, key);
            const inferAxisTitleFromSeries = (axisSeries) => {
                if (!Array.isArray(axisSeries) || axisSeries.length === 0) return '';
                if (axisSeries.length === 1) {
                    return normalizeTitle(axisSeries[0]?.unitValue || axisSeries[0]?.name || '');
                }
                const uniqueUnits = [...new Set(
                    axisSeries
                        .map(series => normalizeTitle(series?.unitValue))
                        .filter(Boolean)
                )];
                return uniqueUnits.length === 1 ? uniqueUnits[0] : '';
            };
            const resolveAxisTitle = (configKeys, fallbackTitle) => {
                const keys = Array.isArray(configKeys) ? configKeys : [configKeys];
                for (const key of keys) {
                    if (hasOwnConfigValue(key)) {
                        return normalizeTitle(this._config[key]);
                    }
                }
                return fallbackTitle;
            };
            const axisTitlePosition = String(this._config.yaxis_title_position || 'top').toLowerCase();
            const leftAxisTitle = resolveAxisTitle(['yaxis_title_left', 'yaxis_title'], inferAxisTitleFromSeries(leftSeries));
            const rightAxisTitle = resolveAxisTitle('yaxis_title_right', inferAxisTitleFromSeries(rightSeries));

            if (axisTitlesEl && axisTitleLeftEl && axisTitleRightEl) {
                const showTopTitles = axisTitlePosition === 'top' && (leftAxisTitle || rightAxisTitle);
                axisTitlesEl.classList.toggle('visible', showTopTitles);
                axisTitleLeftEl.textContent = leftAxisTitle || '';
                axisTitleRightEl.textContent = rightAxisTitle || '';
            }

            if (!Array.isArray(this._legendVisibility) || this._legendVisibility.length !== seriesData.length) {
                this._legendVisibility = seriesData.map((_, idx) => this._legendVisibility?.[idx] ?? true);
            }

            const barIsHorizontal = String(this._config.bar_orientation || '').toLowerCase() === 'h';
            const traces = seriesData.map((series, index) => {
                const chartType = String(series.chartType || 'line').toLowerCase();
                const isBar = chartType === 'bar';
                let marker;
                if (isBar) {
                    const configuredBarMode = String(this._config.bar_mode || this._config.barmode || (energyMode ? 'stack' : 'group')).toLowerCase();
                    marker = {
                        color: series.fillColor || series.lineColor,
                        line: {
                            color: series.lineColor || (series.fillColor ? undefined : undefined),
                            width: 2
                        }
                    };
                } else {
                    marker = {
                        size: 6,
                        opacity: 0.01,
                        color: series.lineColor
                    };
                }
                const trace = {
                    x: (isBar && barIsHorizontal) ? series.y : series.x,
                    y: (isBar && barIsHorizontal) ? series.x : series.y,
                    orientation: (isBar && barIsHorizontal) ? 'h' : undefined,
                    hovertemplate: (isBar && barIsHorizontal) ? '<extra></extra>' : undefined,
                    hoverinfo: (isBar && barIsHorizontal) ? 'none' : undefined,
                    type: isBar ? 'bar' : 'scatter',
                    mode: isBar ? undefined : 'lines+markers',
                    line: isBar ? undefined : {
                        color: series.lineColor,
                        width: series.lineWidth,
                        shape: series.lineShape
                    },
                    marker,
                    fill: isBar ? 'none' : (series.fillEnabled ? 'tozeroy' : 'none'),
                    fillcolor: isBar ? 'rgba(0,0,0,0)' : (series.fillEnabled ? series.fillColor : 'rgba(0,0,0,0)'),
                    name: series.name,
                    showlegend: showLegend,
                    yaxis: series.axisSide === 'right' ? 'y2' : 'y',
                    visible: this._legendVisibility[index] ? true : false,
                    meta: {
                        labelText: series.labelText,
                        unitValue: series.unitValue,
                        barValueTextColor: series.barValueTextColor
                    }
                };
                if (isBar) {
                    trace.textposition = 'none';
                } else {
                    trace.text = series.plotText;
                    trace.hoverinfo = 'text';
                }
                trace.hoveron = 'points';
                trace.connectgaps = isBar ? false : (series.gapDropToZero ? false : series.connectGaps);
                return trace;
            });

            const hasBarTrace = traces.some(trace => trace.type === 'bar');

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
                    range: leftBinaryLabels ? [-0.1, leftBinaryLabels.length - 1 + 0.1] : (leftRange ? [leftRange.yMin, leftRange.yMax] : undefined),
                    gridcolor: this._config.grid_color || 'rgba(128,128,128,0.2)',
                    ticklabelpadding: this._config.yaxis_tick_padding || 6,
                    ticklabelstandoff: this._config.yaxis_tick_padding || 6,
                    automargin: true,
                    ...(leftBinaryLabels ? { tickmode: 'array', tickvals: leftBinaryLabels.map((_, i) => i), ticktext: leftBinaryLabels } : {})
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

            if (hasBarTrace) {
                const configuredBarMode = String(this._config.bar_mode || this._config.barmode || (energyMode ? 'stack' : 'group')).toLowerCase();
                layout.barmode = (configuredBarMode === 'stack' || configuredBarMode === 'relative' || configuredBarMode === 'overlay')
                    ? configuredBarMode
                    : 'group';
                layout.bargap = this._config.bar_gap ?? (energyMode ? 0.05 : 0.15);
                if (layout.barmode === 'group') layout.bargroupgap = this._config.bar_group_gap ?? 0.08;

                const showBarValues = (this._config.show_bar_values ?? true) !== false;
                if (showBarValues) {
                    const barTraces = traces.filter(trace => trace.type === 'bar' && trace.visible !== false);
                    const pointCount = Math.max(1, ...barTraces.map(trace => Array.isArray(trace.x) ? trace.x.length : 0));
                    const slotWidthPx = chartWidth / pointCount;
                    const barsPerSlot = layout.barmode === 'group' ? Math.max(1, barTraces.length) : 1;
                    const barWidthPx = slotWidthPx / barsPerSlot;
                    const configuredLabelPosition = String(this._config.bar_value_position || 'inside').toLowerCase();
                    const labelPosition = (configuredLabelPosition === 'inside' || configuredLabelPosition === 'outside')
                        ? configuredLabelPosition
                        : 'inside';
                    const minWidthForHorizontal = Number.isFinite(Number(this._config.bar_value_min_width_px))
                        ? Math.max(8, Number(this._config.bar_value_min_width_px))
                        : 24;
                    const useVerticalText = barWidthPx < minWidthForHorizontal;
                    const decimals = Number.isFinite(Number(this._config.bar_value_decimals))
                        ? Math.max(0, Number(this._config.bar_value_decimals))
                        : 2;
                    const formatBarValue = (value) => {
                        if (!Number.isFinite(value)) return '';
                        const fixed = Number(value).toFixed(decimals);
                        return fixed.replace(/\.?0+$/, '');
                    };

                    barTraces.forEach((trace) => {
                        const _barValArr = barIsHorizontal ? (trace.x || []) : (trace.y || []);
                        trace.text = _barValArr.map((value) => {
                            if (!Number.isFinite(value)) return '';
                            const formatted = formatBarValue(value);
                            return (formatted === '0' || formatted === '-0') ? '' : formatted;
                        });
                        trace.texttemplate = '%{text}';
                        trace.textposition = labelPosition;
                        trace.textangle = (barIsHorizontal || !useVerticalText) ? 0 : -90;
                        trace.cliponaxis = labelPosition !== 'outside';
                        trace.textfont = {
                            size: Number(this._config.bar_value_font_size) || 11,
                            color: trace.meta?.barValueTextColor || this._config.bar_value_text_color || this._config.bar_value_font_color || this._config.font_color || 'var(--primary-text-color, #e1e1e1)'
                        };
                    });
                }
            }

            if (energyMode && energyContext) {
                if (energyContext.bucketMode === 'year') {
                    layout.xaxis.tickformat = '%Y';
                } else if (energyContext.bucketMode === 'month') {
                    layout.xaxis.tickformat = '%m-%Y';
                } else if (energyContext.bucketMode === 'day') {
                    layout.xaxis.tickformat = '%d-%m';
                } else {
                    layout.xaxis.tickformat = '%H:%M';
                }
            }

            if (rightRange || rightBinaryLabels) {
                layout.yaxis2 = {
                    title: {
                        text: axisTitlePosition === 'top' ? '' : (rightAxisTitle || ''),
                        font: { color: this._config.font_color || 'var(--primary-text-color, #e1e1e1)' },
                        standoff: 8
                    },
                    range: rightBinaryLabels ? [-0.1, rightBinaryLabels.length - 1 + 0.1] : (rightRange ? [rightRange.yMin, rightRange.yMax] : undefined),
                    overlaying: 'y',
                    side: 'right',
                    gridcolor: 'rgba(0,0,0,0)',
                    ticklabelpadding: this._config.yaxis_tick_padding || 6,
                    ticklabelstandoff: this._config.yaxis_tick_padding || 6,
                    automargin: true,
                    ...(rightBinaryLabels ? { tickmode: 'array', tickvals: rightBinaryLabels.map((_, i) => i), ticktext: rightBinaryLabels } : {})
                };
            }

            if (hasBarTrace && barIsHorizontal) {
                const _tmpAxis = layout.xaxis;
                layout.xaxis = layout.yaxis;
                layout.yaxis = _tmpAxis;
                layout.hovermode = 'y';
            }
            if (showChart) {
                await Plotly.newPlot(chartEl, traces, layout, {
                    responsive: false,
                    displayModeBar: this._config.show_modebar !== false,
                    displaylogo: false,
                    modeBarButtonsToRemove: ['lasso2d', 'select2d', 'pan2d', 'autoScale2d', 'toggleSpikelines', 'hoverClosestCartesian', 'hoverCompareCartesian'],
                    toImageButtonOptions: {
                        format: downloadFormat,
                        filename: this.resolveDownloadFilename(this._config.download_filename),
                        height: this._config.download_height || 500,
                        width: this._config.download_width || 700,
                        scale: this._config.download_scale || 2,
                        // Override background and font for download only
                        paper_bgcolor: this._config.download_theme === 'light' ? 'white' : (this._config.download_theme === 'dark' ? 'rgba(0,0,0,0)' : (this._config.paper_bgcolor || 'rgba(0,0,0,0)')),
                        plot_bgcolor: this._config.download_theme === 'light' ? '#f5f5f5' : (this._config.download_theme === 'dark' ? 'rgba(0,0,0,0)' : (this._config.plot_bgcolor || 'rgba(0,0,0,0)')),
                        font: { color: this._config.download_theme === 'light' ? '#333' : (this._config.download_theme === 'dark' ? 'var(--primary-text-color, #e1e1e1)' : (this._config.font_color || 'var(--primary-text-color, #e1e1e1)')) }
                    }
                });

                updateSeriesTotals();
            }

            if (!showChart) {
                if (showStatusText) {
                    statusEl.textContent = `${totalPoints} points (${downsample}s interval)`;
                }
                return;
            }

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
                    modebarContainer.style.zIndex = '10020';
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

                if (hasBarTrace && barIsHorizontal) {
                    // Custom tooltip for horizontal bars:
                    // pointIndex is the time-bucket index, same across all series.
                    const ptIdx = firstPoint.pointIndex;
                    // Find original Date from first series that has data at this index
                    let _t = null;
                    for (let si = 0; si < seriesData.length; si++) {
                        const candidate = seriesData[si]?.x?.[ptIdx];
                        if (candidate !== undefined && candidate !== null) { _t = candidate; break; }
                    }
                    if (_t === null) return;
                    const formatted = new Date(_t).toLocaleString('nl-NL', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                    });
                    // Collect all series values at this index
                    const hLines = seriesData.map((s) => {
                        const val = s?.y?.[ptIdx];
                        const fVal = Number.isFinite(val) ? Number(val).toFixed(2) : '—';
                        const unit = s?.unitValue ? ` ${s.unitValue}` : '';
                        const color = s?.lineColor || 'currentColor';
                        return `<span style="color:${color};">${s?.name || ''}</span>: <b>${fVal}${unit}</b>`;
                    });
                    tooltip.innerHTML = `<b>${formatted}</b><br>${hLines.join('<br>')}`;
                    tooltip.style.display = 'block';
                    const rect = chartEl.getBoundingClientRect();
                    const clientX = eventData.event?.clientX ?? rect.left;
                    const clientY = eventData.event?.clientY ?? rect.top;
                    const { x: cx, y: cy } = clampTooltipPosition(
                        clientX - rect.left + 12,
                        clientY - rect.top - 10,
                        rect
                    );
                    tooltip.style.left = `${cx}px`;
                    tooltip.style.top = `${cy}px`;
                    if (showStatusText) {
                        statusEl.textContent = `${formatted} • ${seriesData.map((s, si) => {
                            const val = s?.y?.[ptIdx];
                            const fVal = Number.isFinite(val) ? Number(val).toFixed(2) : '—';
                            const unit = s?.unitValue ? ` ${s.unitValue}` : '';
                            return `${s?.name || ''}: ${fVal}${unit}`;
                        }).join(' • ')}`;
                    }
                    return;
                }

                const _hoverRaw = firstPoint.x || 0;
                const date = new Date(_hoverRaw);
                const formatted = date.toLocaleString('nl-NL', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });

                const hoverTime = new Date(_hoverRaw).getTime();
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
                let xPos, yPos;
                if (hasBarTrace && barIsHorizontal) {
                    // For horizontal bars the time axis is Y; pin tooltip to the right of cursor, follow Y
                    xPos = clientX - rect.left + 10;
                    yPos = clientY - rect.top - 10;
                } else {
                    xPos = clientX - rect.left + 10;
                    yPos = clientY - rect.top - 10;
                }
                const lineX = clientX - rect.left;

                const clamped = clampTooltipPosition(xPos, yPos, rect);
                xPos = clamped.x;
                yPos = clamped.y;

                tooltip.style.left = `${xPos}px`;
                tooltip.style.top = `${yPos}px`;

                if (!(hasBarTrace && barIsHorizontal)) {
                    hoverLine.style.display = 'block';
                    hoverLine.style.left = `${lineX}px`;
                }

                if (showStatusText) {
                    statusEl.textContent = `${formatted} • ${lines.join(' • ').replace(/<[^>]*>/g, '')}`;
                }
            });

            chartEl.on('plotly_unhover', () => {
                if (!(hasBarTrace && barIsHorizontal)) {
                    tooltip.style.display = 'none';
                    hoverLine.style.display = 'none';
                }
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
                const _fullLayout = chartEl._fullLayout;
                if (!_fullLayout) return;

                const rect = overlay.getBoundingClientRect();
                const px = evt.clientX - rect.left;
                const py = evt.clientY - rect.top;

                // Horizontal bars: time is on Y-axis
                if (hasBarTrace && barIsHorizontal) {
                    const yaxisLayout = _fullLayout.yaxis;
                    if (!yaxisLayout || !yaxisLayout.range) return;
                    const size = _fullLayout._size;
                    if (!size) return;
                    const yRange = yaxisLayout.range;
                    const yStart = new Date(yRange[0]).getTime();
                    const yEnd = new Date(yRange[1]).getTime();
                    const clampedY = Math.min(Math.max(py - size.t, 0), size.h);
                    const frac = size.h > 0 ? (1 - clampedY / size.h) : 0; // Y axis goes bottom→top in Plotly
                    const targetTime = yStart + frac * (yEnd - yStart);

                    const baseX = seriesData[0]?.x;
                    if (!baseX || !baseX.length) return;
                    const baseIndex = findNearestIndex(targetTime, baseX);
                    const baseTime = baseX[baseIndex];
                    if (!baseTime) return;

                    const formatted = new Date(baseTime).toLocaleString('nl-NL', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                    });

                    const tooltipLines = [];
                    const statusParts = [];
                    seriesData.forEach(s => {
                        const val = s?.y?.[baseIndex];
                        const fVal = Number.isFinite(val) ? Number(val).toFixed(2) : '—';
                        const unit = s?.unitValue ? ` ${s.unitValue}` : '';
                        const label = s?.name || '';
                        const color = s?.lineColor || 'currentColor';
                        tooltipLines.push(`<span style="color:${color}">${label}</span>: <b>${fVal}${unit}</b>`);
                        statusParts.push(`${label}: ${fVal}${unit}`);
                    });

                    tooltip.innerHTML = `<b>${formatted}</b><br>${tooltipLines.join('<br>')}`;
                    tooltip.style.display = 'block';
                    const { x: cx, y: cy } = clampTooltipPosition(px + 12, py - 10, rect);
                    tooltip.style.left = `${cx}px`;
                    tooltip.style.top = `${cy}px`;
                    if (showStatusText) statusEl.textContent = `${formatted} • ${statusParts.join(' • ')}`;
                    return;
                }

                // Normal (vertical) mode
                if (!_fullLayout.xaxis || !x || x.length === 0) return;

                const size = _fullLayout._size;
                const xRange = _fullLayout.xaxis.range;
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
                            updateSeriesTotals();
                        });
                    });
                } else {
                    legendEl.classList.remove('visible');
                    legendEl.innerHTML = '';
                }
            }

        } catch (error) {
            if (statusEl) {
                statusEl.style.display = '';
                statusEl.textContent = 'Error: ' + error.message;
            }
            showDebug('ERROR in _loadDataInner:\n' + (error && error.stack ? error.stack : String(error)));
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
