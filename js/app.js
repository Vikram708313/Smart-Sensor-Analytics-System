/**
 * Smart Sensor Analytics System - Master Application Controller
 * Professional Blue & White Theme
 * Coordinates state, polling lifecycle, DOM events, UI updates, and data pipeline.
 */

const App = {
    state: {
        allFeeds: [],
        filteredFeeds: [],
        activeFilter: 'all',
        customBounds: null,
        stats: null,
        statusEval: null,
        channelMeta: {},
        settings: null,
        thresholds: null,
        pollingTimer: null,
        isSyncing: false
    },

    /**
     * Application Initialization
     */
    async init() {
        console.log("Initializing Smart Sensor Analytics System (Blue & White Edition)...");

        // 1. Load Configurations & State
        this.state.settings = loadUserSettings();
        this.state.thresholds = loadUserThresholds();

        // 2. Initialize Charts
        ChartManager.initCharts();

        // 3. Bind UI Event Listeners
        this.bindEvents();

        // 4. Fill Threshold Forms with current values
        this.populateThresholdForms();
        this.populateSettingsForm();

        // 5. Initial Data Ingestion
        await this.refreshData(true);

        // 6. Start Polling Engine if enabled
        this.restartPolling();
    },

    /**
     * Event Listeners Registration
     */
    bindEvents() {
        // Bottom Navigation Bar Items & Tab Buttons
        const navItems = document.querySelectorAll('.bottom-nav-item, .tab-btn');
        navItems.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetTab = btn.getAttribute('data-tab');
                if (targetTab) {
                    this.switchTab(targetTab);
                }
            });
        });

        // Historical Analytics Engine - 5 Time Window Options
        const windowBtns = document.querySelectorAll('.window-btn');
        windowBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                windowBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const range = btn.getAttribute('data-range');
                this.setTimeFilter(range);
            });
        });

        // Manual Refresh Button
        const refreshBtn = document.getElementById('btnRefresh');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshData(false));
        }

        // Settings Modal Open / Close
        const openSettingsBtn = document.getElementById('btnOpenSettings');
        const closeSettingsBtn = document.getElementById('btnCloseSettings');
        const cancelSettingsBtn = document.getElementById('btnCancelSettings');
        const modalBackdrop = document.getElementById('settingsModal');

        if (openSettingsBtn && modalBackdrop) {
            openSettingsBtn.addEventListener('click', () => {
                this.populateSettingsForm();
                modalBackdrop.classList.add('open');
            });
        }
        if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', () => modalBackdrop.classList.remove('open'));
        if (cancelSettingsBtn) cancelSettingsBtn.addEventListener('click', () => modalBackdrop.classList.remove('open'));

        // Settings Form Submission
        const settingsForm = document.getElementById('settingsForm');
        if (settingsForm) {
            settingsForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveSettings();
                modalBackdrop.classList.remove('open');
            });
        }

        // Threshold Form Submission
        const thresholdForm = document.getElementById('thresholdForm');
        if (thresholdForm) {
            thresholdForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveThresholds();
            });
        }

        // Threshold Reset to Default
        const resetThresholdsBtn = document.getElementById('btnResetThresholds');
        if (resetThresholdsBtn) {
            resetThresholdsBtn.addEventListener('click', () => {
                if (confirm("Reset all user-defined thresholds to project defaults?")) {
                    this.state.thresholds = JSON.parse(JSON.stringify(CONFIG.DEFAULT_THRESHOLDS));
                    saveUserThresholds(this.state.thresholds);
                    this.populateThresholdForms();
                    this.recomputeAnalytics();
                    alert("Thresholds reset to default.");
                }
            });
        }

        // Export Actions
        const btnExportCSV = document.getElementById('btnExportCSV');
        if (btnExportCSV) {
            btnExportCSV.addEventListener('click', () => {
                ExportManager.exportFeedsToCSV(this.state.filteredFeeds);
            });
        }

        const btnExportAllCSV = document.getElementById('btnExportAllCSV');
        if (btnExportAllCSV) {
            btnExportAllCSV.addEventListener('click', () => {
                ExportManager.exportFeedsToCSV(this.state.allFeeds, "Sensor_Readings_All_Recorded.csv");
            });
        }

        const btnExportAlertsCSV = document.getElementById('btnExportAlertsCSV');
        if (btnExportAlertsCSV) {
            btnExportAlertsCSV.addEventListener('click', () => {
                ExportManager.exportAlertsToCSV(AlertEngine.getHistory("all"));
            });
        }

        const btnExportReport = document.getElementById('btnExportReport');
        if (btnExportReport) {
            btnExportReport.addEventListener('click', () => {
                ExportManager.exportAnalyticsSummaryReport(
                    this.state.stats,
                    this.state.statusEval,
                    this.state.thresholds,
                    this.state.channelMeta
                );
            });
        }

        // Alert Management Actions
        const btnAckAll = document.getElementById('btnAckAllAlerts');
        if (btnAckAll) {
            btnAckAll.addEventListener('click', () => {
                AlertEngine.acknowledgeAll();
                this.renderAlerts();
            });
        }

        const btnClearAlerts = document.getElementById('btnClearAlerts');
        if (btnClearAlerts) {
            btnClearAlerts.addEventListener('click', () => {
                if (confirm("Clear all recorded alert logs?")) {
                    AlertEngine.clearHistory();
                    this.renderAlerts();
                }
            });
        }
    },

    /**
     * Switch Navigation Tabs (Fixed Bottom Nav)
     */
    switchTab(tabId) {
        document.querySelectorAll('.bottom-nav-item, .tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
        });
        document.querySelectorAll('.tab-content').forEach(pane => {
            pane.classList.toggle('active', pane.id === `tab-${tabId}`);
        });

        // Trigger chart resize if charts tab activated
        if (tabId === 'charts' || tabId === 'overview') {
            setTimeout(() => {
                if (ChartManager._tempChart) ChartManager._tempChart.resize();
                if (ChartManager._humChart) ChartManager._humChart.resize();
                if (ChartManager._lightChart) ChartManager._lightChart.resize();
            }, 100);
        }

        // Scroll smoothly to top on tab switch
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    /**
     * Start/Restart Background Polling Timer
     */
    restartPolling() {
        if (this.state.pollingTimer) {
            clearInterval(this.state.pollingTimer);
            this.state.pollingTimer = null;
        }

        const intervalSec = Math.max(15, this.state.settings.pollInterval || 20);
        if (this.state.settings.autoRefresh) {
            this.state.pollingTimer = setInterval(() => {
                this.refreshData(false);
            }, intervalSec * 1000);
        }
    },

    /**
     * Core Data Retrieval and Pipeline Execution
     */
    async refreshData(showFullLoading = false) {
        if (this.state.isSyncing) return;
        this.state.isSyncing = true;
        this.setSyncingUI(true);

        try {
            const dataResult = await ApiService.fetchFeeds({
                channelId: this.state.settings.channelId,
                readApiKey: this.state.settings.readApiKey,
                results: CONFIG.THINGSPEAK.MAX_RESULTS
            });

            this.state.channelMeta = dataResult.channel || {};
            this.state.allFeeds = dataResult.feeds || [];

            // Run Alert Detection on latest reading
            const latest = ApiService.getLatestReading(this.state.allFeeds);
            if (latest) {
                AlertEngine.checkReading(latest, this.state.thresholds);
            }

            // Recompute Analytics, Statistics, and Render
            this.recomputeAnalytics();

            // Update Connection Pill UI
            this.updateConnectionStatus(dataResult);

        } catch (error) {
            console.error("Data refresh failed:", error);
            this.updateConnectionStatus({ isOnline: false, isUsingFallback: true, error: error.message });
        } finally {
            this.state.isSyncing = false;
            this.setSyncingUI(false);
        }
    },

    /**
     * Recompute analytics and update all UI views
     */
    recomputeAnalytics() {
        // 1. Filter feeds according to active time range
        this.state.filteredFeeds = AnalyticsEngine.filterByTimeRange(
            this.state.allFeeds,
            this.state.activeFilter,
            this.state.customBounds
        );

        // 2. Compute statistics over the filtered window
        this.state.stats = AnalyticsEngine.calculateStats(this.state.filteredFeeds);

        // 3. Evaluate latest environmental status
        const latest = ApiService.getLatestReading(this.state.allFeeds);
        this.state.statusEval = AnalyticsEngine.evaluateStatus(latest, this.state.thresholds);

        // 4. Render all UI Modules
        this.renderOverviewCards(latest);
        this.renderCharts();
        this.renderAnalyticsEngine();
        this.renderAlerts();
    },

    /**
     * Render Live Overview Metric Cards
     */
    renderOverviewCards(latest) {
        if (!latest) return;

        // 1. Temperature Card
        const tempValEl = document.getElementById('valTemp');
        const tempTrendEl = document.getElementById('trendTemp');
        const tempMinEl = document.getElementById('statTempMin');
        const tempMaxEl = document.getElementById('statTempMax');
        const tempAvgEl = document.getElementById('statTempAvg');

        if (tempValEl) tempValEl.innerText = latest.isTempValid ? latest.temperature.toFixed(1) : "--";
        if (tempMinEl) tempMinEl.innerText = this.state.stats.temperature.min !== null ? `${this.state.stats.temperature.min}°C` : "--";
        if (tempMaxEl) tempMaxEl.innerText = this.state.stats.temperature.max !== null ? `${this.state.stats.temperature.max}°C` : "--";
        if (tempAvgEl) tempAvgEl.innerText = this.state.stats.temperature.avg !== null ? `${this.state.stats.temperature.avg}°C` : "--";
        if (tempTrendEl) {
            const tr = this.state.stats.trends.temperature;
            tempTrendEl.className = `trend-badge trend-${tr.direction}`;
            tempTrendEl.innerText = `${tr.icon} ${tr.label}`;
        }

        // 2. Humidity Card
        const humValEl = document.getElementById('valHum');
        const humTrendEl = document.getElementById('trendHum');
        const humMinEl = document.getElementById('statHumMin');
        const humMaxEl = document.getElementById('statHumMax');
        const humAvgEl = document.getElementById('statHumAvg');

        if (humValEl) humValEl.innerText = latest.isHumValid ? latest.humidity.toFixed(1) : "--";
        if (humMinEl) humMinEl.innerText = this.state.stats.humidity.min !== null ? `${this.state.stats.humidity.min}%` : "--";
        if (humMaxEl) humMaxEl.innerText = this.state.stats.humidity.max !== null ? `${this.state.stats.humidity.max}%` : "--";
        if (humAvgEl) humAvgEl.innerText = this.state.stats.humidity.avg !== null ? `${this.state.stats.humidity.avg}%` : "--";
        if (humTrendEl) {
            const tr = this.state.stats.trends.humidity;
            humTrendEl.className = `trend-badge trend-${tr.direction}`;
            humTrendEl.innerText = `${tr.icon} ${tr.label}`;
        }

        // 3. Light Intensity Card
        const lightValEl = document.getElementById('valLight');
        const lightPercentEl = document.getElementById('valLightPercent');
        const lightTrendEl = document.getElementById('trendLight');
        const lightStatusTextEl = document.getElementById('statLightStatus');
        const lightRawAvgEl = document.getElementById('statLightAvg');

        if (lightValEl) lightValEl.innerText = latest.isLightValid ? latest.lightRaw : "--";
        if (lightPercentEl) lightPercentEl.innerText = latest.brightnessPercent !== null ? `${latest.brightnessPercent}%` : "--";
        if (lightStatusTextEl) lightStatusTextEl.innerText = latest.lightStatus === 1 ? "BRIGHT" : "DARK";
        if (lightRawAvgEl) lightRawAvgEl.innerText = this.state.stats.lightRaw.avg !== null ? `${this.state.stats.lightRaw.avg}` : "--";
        if (lightTrendEl) {
            const tr = this.state.stats.trends.light;
            lightTrendEl.className = `trend-badge trend-${tr.direction}`;
            lightTrendEl.innerText = `${tr.icon} ${tr.label}`;
        }

        // 4. System / Environmental Status Card
        const statusBadgeEl = document.getElementById('valStatusBadge');
        const statusDewEl = document.getElementById('statDewPoint');
        const statusHeatEl = document.getElementById('statHeatIndex');
        const statusDescEl = document.getElementById('statConditionDesc');

        if (statusBadgeEl) {
            statusBadgeEl.className = `badge ${this.state.statusEval.statusClass}`;
            statusBadgeEl.innerText = this.state.statusEval.overall.toUpperCase();
        }
        if (statusDewEl) statusDewEl.innerText = this.state.statusEval.dewPoint !== null ? `${this.state.statusEval.dewPoint}°C` : "--";
        if (statusHeatEl) statusHeatEl.innerText = this.state.statusEval.heatIndex !== null ? `${this.state.statusEval.heatIndex}°C` : "--";
        if (statusDescEl) statusDescEl.innerText = this.state.statusEval.lightText;

        // 5. Telemetry Health Summary in Overview
        const metaChannelEl = document.getElementById('metaChannelName');
        const metaPacketsEl = document.getElementById('metaPacketCount');
        const metaIntervalEl = document.getElementById('metaPollRate');
        if (metaChannelEl) metaChannelEl.innerText = this.state.channelMeta.name || "Smart Sensor Analytics System";
        if (metaPacketsEl) metaPacketsEl.innerText = `${this.state.allFeeds.length} Packets`;
        if (metaIntervalEl) metaIntervalEl.innerText = `Every ${this.state.settings.pollInterval || 20}s`;
    },

    /**
     * Render Charts in Historical Analytics
     */
    renderCharts() {
        ChartManager.updateCharts(this.state.filteredFeeds);
    },

    /**
     * Render the Analytics Engine Section (Feature 6)
     */
    renderAnalyticsEngine() {
        const stats = this.state.stats;
        if (!stats) return;

        // 1. Time Window Indicator
        const windowLabels = {
            '1h': '1 Hour',
            '24h': '24 Hours',
            '7d': '7 Days',
            '30d': '30 Days',
            'all': 'All Data'
        };
        const currentWindowText = windowLabels[this.state.activeFilter] || 'Selected Window';

        const activeWindowEl = document.getElementById('analyticsActiveWindowLabel');
        const sampleCountEl = document.getElementById('analyticsSampleCount');
        const timespanEl = document.getElementById('analyticsTimespanLabel');

        if (activeWindowEl) activeWindowEl.innerText = `Active Window: ${currentWindowText}`;
        if (sampleCountEl) sampleCountEl.innerText = `(${stats.count} readings evaluated)`;
        if (timespanEl) {
            if (stats.startTime && stats.endTime) {
                const s = new Date(stats.startTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                const e = new Date(stats.endTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                timespanEl.innerText = `${s} — ${e} (${stats.timespanMinutes} mins)`;
            } else {
                timespanEl.innerText = "No timestamp data";
            }
        }

        // 2. Temperature Engine Metrics
        const engTempAvg = document.getElementById('engTempAvg');
        const engTempMin = document.getElementById('engTempMin');
        const engTempMax = document.getElementById('engTempMax');
        const engTempStd = document.getElementById('engTempStd');
        const engTempTrend = document.getElementById('engTempTrend');

        if (engTempAvg) engTempAvg.innerText = stats.temperature.avg !== null ? stats.temperature.avg : "--";
        if (engTempMin) engTempMin.innerText = stats.temperature.min !== null ? `${stats.temperature.min}°C` : "--";
        if (engTempMax) engTempMax.innerText = stats.temperature.max !== null ? `${stats.temperature.max}°C` : "--";
        if (engTempStd) engTempStd.innerText = stats.temperature.stdDev !== null ? `±${stats.temperature.stdDev}°C` : "--";
        if (engTempTrend) {
            const tr = stats.trends.temperature;
            engTempTrend.className = `trend-pill trend-${tr.direction}`;
            engTempTrend.innerText = `${tr.icon} ${tr.label} (${tr.delta > 0 ? '+' : ''}${tr.delta}°C)`;
        }

        // 3. Humidity Engine Metrics
        const engHumAvg = document.getElementById('engHumAvg');
        const engHumMin = document.getElementById('engHumMin');
        const engHumMax = document.getElementById('engHumMax');
        const engHumStd = document.getElementById('engHumStd');
        const engHumTrend = document.getElementById('engHumTrend');

        if (engHumAvg) engHumAvg.innerText = stats.humidity.avg !== null ? stats.humidity.avg : "--";
        if (engHumMin) engHumMin.innerText = stats.humidity.min !== null ? `${stats.humidity.min}%` : "--";
        if (engHumMax) engHumMax.innerText = stats.humidity.max !== null ? `${stats.humidity.max}%` : "--";
        if (engHumStd) engHumStd.innerText = stats.humidity.stdDev !== null ? `±${stats.humidity.stdDev}%` : "--";
        if (engHumTrend) {
            const tr = stats.trends.humidity;
            engHumTrend.className = `trend-pill trend-${tr.direction}`;
            engHumTrend.innerText = `${tr.icon} ${tr.label} (${tr.delta > 0 ? '+' : ''}${tr.delta}%)`;
        }

        // 4. Light / LDR Engine Metrics
        const engLightAvg = document.getElementById('engLightAvg');
        const engLightBrightPercent = document.getElementById('engLightBrightPercent');
        const engLightMin = document.getElementById('engLightMin');
        const engLightMax = document.getElementById('engLightMax');
        const engLightCondition = document.getElementById('engLightCondition');
        const engLightTrend = document.getElementById('engLightTrend');

        if (engLightAvg) engLightAvg.innerText = stats.lightRaw.avg !== null ? stats.lightRaw.avg : "--";
        if (engLightBrightPercent) engLightBrightPercent.innerText = `Brightness Average: ${stats.brightnessPercent.avg !== null ? stats.brightnessPercent.avg + '%' : '--'}`;
        if (engLightMin) engLightMin.innerText = stats.lightRaw.min !== null ? `${stats.lightRaw.min} ADC (Brightest)` : "--";
        if (engLightMax) engLightMax.innerText = stats.lightRaw.max !== null ? `${stats.lightRaw.max} ADC (Darkest)` : "--";
        if (engLightCondition) {
            const rawAvg = stats.lightRaw.avg;
            if (rawAvg === null) engLightCondition.innerText = "--";
            else if (rawAvg >= this.state.thresholds.light.darkThreshold) engLightCondition.innerText = "Dark Room (>=2400 ADC)";
            else if (rawAvg <= this.state.thresholds.light.brightThreshold) engLightCondition.innerText = "Bright Space (<=1800 ADC)";
            else engLightCondition.innerText = "Moderate Lighting";
        }
        if (engLightTrend) {
            const tr = stats.trends.light;
            engLightTrend.className = `trend-pill trend-${tr.direction}`;
            engLightTrend.innerText = `${tr.icon} ${tr.label}`;
        }

        // 5. Multi-variable Analysis Synthesis
        const insightTextEl = document.getElementById('engineInsightText');
        if (insightTextEl) {
            if (stats.count === 0) {
                insightTextEl.innerText = "No valid telemetry data available for the chosen time window. Awaiting sensor packet updates.";
            } else {
                const tempAvg = stats.temperature.avg;
                const humAvg = stats.humidity.avg;
                const lightAvg = stats.lightRaw.avg;
                const tempTrend = stats.trends.temperature.label.toLowerCase();
                const humTrend = stats.trends.humidity.label.toLowerCase();

                let lightClass = "dark indoor room";
                if (lightAvg <= this.state.thresholds.light.brightThreshold) lightClass = "bright daylight environment";
                else if (lightAvg < this.state.thresholds.light.darkThreshold) lightClass = "moderate ambient light";

                insightTextEl.innerText = `Across the ${currentWindowText} window (${stats.count} readings), ambient temperature averaged ${tempAvg}°C with a ${tempTrend} trajectory, while humidity averaged ${humAvg}% with a ${humTrend} pattern. Light intensity averaged ${lightAvg} ADC counts, characteristic of a ${lightClass}. Overall statistical variance indicates stable operational equilibrium without rapid environmental fluctuations.`;
            }
        }
    },

    /**
     * Render Alerts Table & Count Badge
     */
    renderAlerts() {
        const alertListEl = document.getElementById('alertListContainer');
        const alertBadge = document.getElementById('navAlertBadge');
        const unackCount = AlertEngine.getUnacknowledgedCount();

        if (alertBadge) {
            alertBadge.innerText = unackCount;
            alertBadge.style.display = unackCount > 0 ? 'inline-block' : 'none';
        }

        if (!alertListEl) return;

        const history = AlertEngine.getHistory("all");
        if (history.length === 0) {
            alertListEl.innerHTML = `
                <div style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 0.5rem; color: var(--blue-primary);"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    <p style="font-size: 1rem; font-weight: 700; color: var(--text-navy-deep);">No Alerts Recorded</p>
                    <p style="font-size: 0.825rem;">Incoming sensor telemetry is fully compliant with configured thresholds.</p>
                </div>
            `;
            return;
        }

        let html = '';
        history.forEach(a => {
            const isAck = a.acknowledged;
            const ackBtnHtml = !isAck && a.level !== 'recovery'
                ? `<button class="btn btn-secondary btn-sm" onclick="App.acknowledgeAlert('${a.id}')">Acknowledge</button>`
                : `<span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">${a.resolved ? 'Resolved' : 'Acknowledged'}</span>`;

            html += `
                <div class="alert-card alert-${a.level}">
                    <div class="alert-content">
                        <div class="alert-title-row">
                            <span class="badge badge-${a.level}">${a.level}</span>
                            <span class="alert-title">${a.title}</span>
                            <span class="alert-time">${a.dateString} ${a.timeString}</span>
                        </div>
                        <div class="alert-desc">${a.message}</div>
                    </div>
                    <div class="alert-actions">
                        ${ackBtnHtml}
                    </div>
                </div>
            `;
        });

        alertListEl.innerHTML = html;
    },

    /**
     * Acknowledge alert helper
     */
    acknowledgeAlert(id) {
        AlertEngine.acknowledgeAlert(id);
        this.renderAlerts();
    },

    /**
     * Set active time filter from buttons
     */
    setTimeFilter(rangeKey) {
        this.state.activeFilter = rangeKey;

        // Keep all filter buttons synchronized
        document.querySelectorAll('.window-btn, .filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-range') === rangeKey);
        });

        this.recomputeAnalytics();
    },

    /**
     * Connection Status Indicator
     */
    updateConnectionStatus(dataResult) {
        const dot = document.getElementById('connectionDot');
        const text = document.getElementById('connectionText');
        const latestTimeEl = document.getElementById('lastUpdatedTime');

        if (!dot || !text) return;

        if (dataResult.isUsingFallback) {
            dot.className = "pulse-dot pulse-fallback";
            text.innerText = "Local Telemetry Snapshot (Demo)";
        } else if (dataResult.isOnline) {
            dot.className = "pulse-dot";
            text.innerText = "ThingSpeak Live Connected";
        } else {
            dot.className = "pulse-dot pulse-error";
            text.innerText = "API Offline";
        }

        if (latestTimeEl && this.state.allFeeds.length > 0) {
            const latest = this.state.allFeeds[this.state.allFeeds.length - 1];
            latestTimeEl.innerText = `• Last packet: ${latest.timeString}`;
        }
    },

    setSyncingUI(isSyncing) {
        const btn = document.getElementById('btnRefresh');
        if (btn) {
            btn.style.opacity = isSyncing ? '0.6' : '1';
            btn.style.pointerEvents = isSyncing ? 'none' : 'auto';
        }
    },

    /**
     * Populate Threshold Configuration form
     */
    populateThresholdForms() {
        const t = this.state.thresholds;
        if (!t) return;

        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
        };

        setVal('cfgTempMinCritical', t.temperature.minCritical);
        setVal('cfgTempMinWarning', t.temperature.minWarning);
        setVal('cfgTempMaxWarning', t.temperature.maxWarning);
        setVal('cfgTempMaxCritical', t.temperature.maxCritical);

        setVal('cfgHumMinCritical', t.humidity.minCritical);
        setVal('cfgHumMinWarning', t.humidity.minWarning);
        setVal('cfgHumMaxWarning', t.humidity.maxWarning);
        setVal('cfgHumMaxCritical', t.humidity.maxCritical);

        setVal('cfgLightDark', t.light.darkThreshold);
        setVal('cfgLightBright', t.light.brightThreshold);
    },

    /**
     * Populate Settings Modal form
     */
    populateSettingsForm() {
        const s = this.state.settings;
        if (!s) return;

        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
        };

        setVal('setChannelId', s.channelId);
        setVal('setReadApiKey', s.readApiKey || "");
        setVal('setPollInterval', s.pollInterval || 20);

        const chkFallback = document.getElementById('setForceLocal');
        if (chkFallback) chkFallback.checked = !!s.useLocalFallback;

        const chkAuto = document.getElementById('setAutoRefresh');
        if (chkAuto) chkAuto.checked = !!s.autoRefresh;
    },

    /**
     * Save user thresholds from form
     */
    saveThresholds() {
        const getNum = (id) => parseFloat(document.getElementById(id).value);

        this.state.thresholds = {
            temperature: {
                minCritical: getNum('cfgTempMinCritical'),
                minWarning: getNum('cfgTempMinWarning'),
                maxWarning: getNum('cfgTempMaxWarning'),
                maxCritical: getNum('cfgTempMaxCritical'),
                unit: "°C"
            },
            humidity: {
                minCritical: getNum('cfgHumMinCritical'),
                minWarning: getNum('cfgHumMinWarning'),
                maxWarning: getNum('cfgHumMaxWarning'),
                maxCritical: getNum('cfgHumMaxCritical'),
                unit: "%"
            },
            light: {
                darkThreshold: parseInt(document.getElementById('cfgLightDark').value, 10),
                brightThreshold: parseInt(document.getElementById('cfgLightBright').value, 10)
            }
        };

        saveUserThresholds(this.state.thresholds);
        this.recomputeAnalytics();
        alert("Threshold parameters saved successfully.");
    },

    /**
     * Save Settings from Modal
     */
    saveSettings() {
        const channelId = document.getElementById('setChannelId').value.trim();
        const readApiKey = document.getElementById('setReadApiKey').value.trim();
        const pollInterval = parseInt(document.getElementById('setPollInterval').value, 10) || 20;
        const useLocalFallback = document.getElementById('setForceLocal').checked;
        const autoRefresh = document.getElementById('setAutoRefresh').checked;

        this.state.settings = {
            channelId,
            readApiKey,
            pollInterval,
            useLocalFallback,
            autoRefresh
        };

        saveUserSettings(this.state.settings);
        this.restartPolling();
        this.refreshData(true);
    }
};

// Bootstrap application on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
