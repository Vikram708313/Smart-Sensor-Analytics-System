/**
 * Smart Sensor Analytics System - Threshold Alert Engine
 * Handles threshold evaluation, state-machine debouncing (prevention of repeat alerts),
 * recovery notifications, acknowledgment, and persistent history tracking.
 */

const AlertEngine = {
    // Current state machine for each parameter to prevent repeated alerts
    _currentState: {
        temperature: "NORMAL", // NORMAL | WARNING_HIGH | WARNING_LOW | CRITICAL_HIGH | CRITICAL_LOW
        humidity: "NORMAL",
        light: "NORMAL"
    },

    // In-memory alert log (synced with localStorage)
    _alertHistory: [],

    /**
     * Initialize engine and restore persistent alert history
     */
    init() {
        try {
            const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.ALERT_HISTORY);
            if (saved) {
                this._alertHistory = JSON.parse(saved);
            }
        } catch (e) {
            console.warn("Could not load alert history:", e);
            this._alertHistory = [];
        }
    },

    /**
     * Process a new reading against current thresholds
     * @param {Object} reading - Sanitized reading object
     * @param {Object} thresholds - Configured thresholds
     * @returns {Array} Newly generated alert objects in this cycle
     */
    checkReading(reading, thresholds) {
        if (!reading) return [];

        const newAlerts = [];
        const now = reading.timestamp || new Date();

        // 1. Evaluate Temperature
        if (reading.isTempValid && thresholds.temperature) {
            const tempAlert = this._evaluateParam(
                "Temperature",
                reading.temperature,
                "°C",
                thresholds.temperature,
                this._currentState.temperature,
                now
            );
            if (tempAlert) {
                this._currentState.temperature = tempAlert.newState;
                if (tempAlert.alert) newAlerts.push(tempAlert.alert);
            }
        }

        // 2. Evaluate Humidity
        if (reading.isHumValid && thresholds.humidity) {
            const humAlert = this._evaluateParam(
                "Humidity",
                reading.humidity,
                "%",
                thresholds.humidity,
                this._currentState.humidity,
                now
            );
            if (humAlert) {
                this._currentState.humidity = humAlert.newState;
                if (humAlert.alert) newAlerts.push(humAlert.alert);
            }
        }

        // If new alerts were created, record and persist
        if (newAlerts.length > 0) {
            for (let i = 0; i < newAlerts.length; i++) {
                this._alertHistory.unshift(newAlerts[i]);
            }
            // Keep maximum 100 historical alerts to manage storage
            if (this._alertHistory.length > 100) {
                this._alertHistory = this._alertHistory.slice(0, 100);
            }
            this._persistHistory();
        }

        return newAlerts;
    },

    /**
     * Single parameter evaluation with debouncing and recovery detection
     */
    _evaluateParam(paramName, value, unit, cfg, prevState, timestamp) {
        let targetState = "NORMAL";

        if (value >= cfg.maxCritical) {
            targetState = "CRITICAL_HIGH";
        } else if (value <= cfg.minCritical) {
            targetState = "CRITICAL_LOW";
        } else if (value >= cfg.maxWarning) {
            targetState = "WARNING_HIGH";
        } else if (value <= cfg.minWarning) {
            targetState = "WARNING_LOW";
        }

        // Case 1: State has NOT changed -> suppress duplicate alert!
        if (targetState === prevState) {
            return { newState: prevState, alert: null };
        }

        // Case 2: Returning from an abnormal state to NORMAL -> Recovery Alert!
        if (targetState === "NORMAL" && prevState !== "NORMAL") {
            const recoveryAlert = {
                id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                timestamp: timestamp.toISOString(),
                timeString: timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                dateString: timestamp.toLocaleDateString(),
                param: paramName,
                level: "recovery",
                title: `${paramName} Normalized`,
                message: `${paramName} returned to normal safe range at ${value}${unit}.`,
                value: value,
                threshold: null,
                acknowledged: false,
                resolved: true
            };
            return { newState: "NORMAL", alert: recoveryAlert };
        }

        // Case 3: Transitioning into Warning or Critical
        let level = "warning";
        let title = "";
        let message = "";
        let thresholdViolated = 0;

        if (targetState === "CRITICAL_HIGH") {
            level = "critical";
            thresholdViolated = cfg.maxCritical;
            title = `Critical High ${paramName}`;
            message = `${paramName} reached ${value}${unit}, exceeding critical safety limit of ${cfg.maxCritical}${unit}.`;
        } else if (targetState === "CRITICAL_LOW") {
            level = "critical";
            thresholdViolated = cfg.minCritical;
            title = `Critical Low ${paramName}`;
            message = `${paramName} dropped to ${value}${unit}, below critical safety minimum of ${cfg.minCritical}${unit}.`;
        } else if (targetState === "WARNING_HIGH") {
            level = "warning";
            thresholdViolated = cfg.maxWarning;
            title = `High ${paramName} Warning`;
            message = `${paramName} reached ${value}${unit}, exceeding warning limit of ${cfg.maxWarning}${unit}.`;
        } else if (targetState === "WARNING_LOW") {
            level = "warning";
            thresholdViolated = cfg.minWarning;
            title = `Low ${paramName} Warning`;
            message = `${paramName} dropped to ${value}${unit}, below warning threshold of ${cfg.minWarning}${unit}.`;
        }

        const alert = {
            id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            timestamp: timestamp.toISOString(),
            timeString: timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            dateString: timestamp.toLocaleDateString(),
            param: paramName,
            level: level,
            title: title,
            message: message,
            value: value,
            threshold: thresholdViolated,
            acknowledged: false,
            resolved: false
        };

        return { newState: targetState, alert: alert };
    },

    /**
     * Acknowledge an alert by ID
     */
    acknowledgeAlert(alertId) {
        const item = this._alertHistory.find(a => a.id === alertId);
        if (item) {
            item.acknowledged = true;
            this._persistHistory();
            return true;
        }
        return false;
    },

    /**
     * Resolve an alert by ID
     */
    resolveAlert(alertId) {
        const item = this._alertHistory.find(a => a.id === alertId);
        if (item) {
            item.resolved = true;
            item.acknowledged = true;
            this._persistHistory();
            return true;
        }
        return false;
    },

    /**
     * Acknowledge all active alerts
     */
    acknowledgeAll() {
        this._alertHistory.forEach(a => { a.acknowledged = true; });
        this._persistHistory();
    },

    /**
     * Clear all alert history
     */
    clearHistory() {
        this._alertHistory = [];
        this._persistHistory();
    },

    /**
     * Get alert history with optional filter
     */
    getHistory(filter = "all") {
        if (filter === "unacknowledged") {
            return this._alertHistory.filter(a => !a.acknowledged && !a.resolved);
        }
        if (filter === "active") {
            return this._alertHistory.filter(a => !a.resolved);
        }
        if (filter === "critical") {
            return this._alertHistory.filter(a => a.level === "critical");
        }
        return [...this._alertHistory];
    },

    /**
     * Count active/unacknowledged alerts
     */
    getUnacknowledgedCount() {
        return this._alertHistory.filter(a => !a.acknowledged && !a.resolved && a.level !== "recovery").length;
    },

    _persistHistory() {
        try {
            localStorage.setItem(CONFIG.STORAGE_KEYS.ALERT_HISTORY, JSON.stringify(this._alertHistory));
        } catch (e) {
            console.error("Failed to persist alert history:", e);
        }
    }
};

AlertEngine.init();
