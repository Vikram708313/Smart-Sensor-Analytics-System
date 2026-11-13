/**
 * Smart Sensor Analytics System - Analytics & Environmental Interpretation Module
 * Computes statistics (Avg, Min, Max), trends, classifications, anomalies, and comfort metrics.
 */

const AnalyticsEngine = {
    /**
     * Filter feeds by pre-defined or custom time ranges
     * @param {Array} feeds - Array of sanitized feed objects
     * @param {string} rangeKey - '1h' | '24h' | '7d' | '30d' | 'all' | 'custom'
     * @param {Object} customBounds - { start: Date, end: Date } (if rangeKey === 'custom')
     * @returns {Array} Filtered feeds
     */
    filterByTimeRange(feeds, rangeKey = 'all', customBounds = null) {
        if (!feeds || feeds.length === 0) return [];
        if (rangeKey === 'all' && !customBounds) return [...feeds];

        // Anchor time to latest feed timestamp to ensure reliable historical viewing
        const latestTime = feeds[feeds.length - 1].timestamp.getTime();

        if (rangeKey === 'custom' && customBounds) {
            const startMs = customBounds.start ? new Date(customBounds.start).getTime() : 0;
            const endMs = customBounds.end ? new Date(customBounds.end).getTime() : Infinity;
            return feeds.filter(f => {
                const t = f.timestamp.getTime();
                return t >= startMs && t <= endMs;
            });
        }

        let windowMs = 0;
        switch (rangeKey) {
            case '1h':
                windowMs = 60 * 60 * 1000;
                break;
            case '24h':
                windowMs = 24 * 60 * 60 * 1000;
                break;
            case '7d':
                windowMs = 7 * 24 * 60 * 60 * 1000;
                break;
            case '30d':
                windowMs = 30 * 24 * 60 * 60 * 1000;
                break;
            default:
                return [...feeds];
        }

        const cutoffTime = latestTime - windowMs;
        const filtered = feeds.filter(f => f.timestamp.getTime() >= cutoffTime);

        // If dataset spans a very short period (e.g. testing in a 1-hour window),
        // and filtering yields too few points, ensure at least some context is preserved
        return filtered.length > 0 ? filtered : [...feeds];
    },

    /**
     * Calculate comprehensive statistics for temperature, humidity, and light
     * @param {Array} feeds - Filtered feed array
     * @returns {Object} Statistics summary
     */
    calculateStats(feeds) {
        if (!feeds || feeds.length === 0) {
            return this._emptyStats();
        }

        const temps = feeds.filter(f => f.isTempValid).map(f => f.temperature);
        const hums = feeds.filter(f => f.isHumValid).map(f => f.humidity);
        const lights = feeds.filter(f => f.isLightValid).map(f => f.lightRaw);
        const brightPercents = feeds.filter(f => f.brightnessPercent !== null).map(f => f.brightnessPercent);

        return {
            count: feeds.length,
            startTime: feeds[0].timestamp,
            endTime: feeds[feeds.length - 1].timestamp,
            timespanMinutes: Math.round((feeds[feeds.length - 1].timestamp - feeds[0].timestamp) / 60000),

            temperature: this._seriesStats(temps, "°C", 1),
            humidity: this._seriesStats(hums, "%", 1),
            lightRaw: this._seriesStats(lights, " ADC", 0),
            brightnessPercent: this._seriesStats(brightPercents, "%", 0),

            // Trends over the selected window
            trends: {
                temperature: this._computeTrend(temps, 0.2), // >0.2°C delta
                humidity: this._computeTrend(hums, 1.0),     // >1% delta
                light: this._computeTrend(brightPercents, 3.0) // >3% delta
            }
        };
    },

    /**
     * Helper to compute min, max, avg, and median of a numerical array
     */
    _seriesStats(values, unit = "", decimals = 1) {
        if (!values || values.length === 0) {
            return { min: null, max: null, avg: null, current: null, count: 0, unit };
        }

        let sum = 0;
        let min = values[0];
        let max = values[0];

        for (let i = 0; i < values.length; i++) {
            const v = values[i];
            sum += v;
            if (v < min) min = v;
            if (v > max) max = v;
        }

        const avg = sum / values.length;
        const current = values[values.length - 1];

        // Variance / Standard Deviation for anomaly detection
        let varianceSum = 0;
        for (let i = 0; i < values.length; i++) {
            varianceSum += Math.pow(values[i] - avg, 2);
        }
        const stdDev = Math.sqrt(varianceSum / values.length);

        return {
            min: Number(min.toFixed(decimals)),
            max: Number(max.toFixed(decimals)),
            avg: Number(avg.toFixed(decimals)),
            current: Number(current.toFixed(decimals)),
            stdDev: Number(stdDev.toFixed(decimals)),
            count: values.length,
            unit: unit
        };
    },

    /**
     * Compute trend direction and magnitude
     * Compares the average of the last 20% of readings with the first 20%
     */
    _computeTrend(values, threshold = 0.5) {
        if (!values || values.length < 3) {
            return { direction: "stable", delta: 0, label: "Stable", icon: "→" };
        }

        const windowSize = Math.max(1, Math.floor(values.length * 0.25));
        const head = values.slice(0, windowSize);
        const tail = values.slice(-windowSize);

        const headAvg = head.reduce((a, b) => a + b, 0) / head.length;
        const tailAvg = tail.reduce((a, b) => a + b, 0) / tail.length;
        const delta = tailAvg - headAvg;

        if (delta > threshold) {
            return { direction: "increasing", delta: Number(delta.toFixed(2)), label: "Rising", icon: "↑" };
        } else if (delta < -threshold) {
            return { direction: "decreasing", delta: Number(delta.toFixed(2)), label: "Falling", icon: "↓" };
        } else {
            return { direction: "stable", delta: Number(delta.toFixed(2)), label: "Stable", icon: "→" };
        }
    },

    /**
     * Environmental Status Assessment
     * Evaluates latest reading against user-defined thresholds
     */
    evaluateStatus(reading, thresholds) {
        if (!reading) {
            return {
                overall: "unknown",
                statusClass: "status-unknown",
                summary: "Awaiting sensor telemetry...",
                details: []
            };
        }

        const issues = [];
        let tempLevel = "normal";
        let humLevel = "normal";
        let lightLevel = "normal";

        // 1. Temperature Evaluation
        if (reading.isTempValid && thresholds.temperature) {
            const t = reading.temperature;
            const cfg = thresholds.temperature;
            if (t >= cfg.maxCritical) {
                tempLevel = "critical";
                issues.push({ param: "Temperature", level: "critical", msg: `Critical Heat: ${t}°C exceeds critical threshold of ${cfg.maxCritical}°C` });
            } else if (t <= cfg.minCritical) {
                tempLevel = "critical";
                issues.push({ param: "Temperature", level: "critical", msg: `Critical Cold: ${t}°C is below critical minimum of ${cfg.minCritical}°C` });
            } else if (t >= cfg.maxWarning) {
                tempLevel = "warning";
                issues.push({ param: "Temperature", level: "warning", msg: `Elevated Temperature: ${t}°C exceeds warning threshold of ${cfg.maxWarning}°C` });
            } else if (t <= cfg.minWarning) {
                tempLevel = "warning";
                issues.push({ param: "Temperature", level: "warning", msg: `Low Temperature: ${t}°C is below warning threshold of ${cfg.minWarning}°C` });
            }
        }

        // 2. Humidity Evaluation
        if (reading.isHumValid && thresholds.humidity) {
            const h = reading.humidity;
            const cfg = thresholds.humidity;
            if (h >= cfg.maxCritical) {
                humLevel = "critical";
                issues.push({ param: "Humidity", level: "critical", msg: `Critical Humidity: ${h}% exceeds safety limit of ${cfg.maxCritical}%` });
            } else if (h <= cfg.minCritical) {
                humLevel = "critical";
                issues.push({ param: "Humidity", level: "critical", msg: `Severe Dry Air: ${h}% is below critical limit of ${cfg.minCritical}%` });
            } else if (h >= cfg.maxWarning) {
                humLevel = "warning";
                issues.push({ param: "Humidity", level: "warning", msg: `High Humidity: ${h}% exceeds warning limit of ${cfg.maxWarning}%` });
            } else if (h <= cfg.minWarning) {
                humLevel = "warning";
                issues.push({ param: "Humidity", level: "warning", msg: `Dry Ambient Air: ${h}% is below comfortable limit of ${cfg.minWarning}%` });
            }
        }

        // 3. Light Evaluation
        let lightText = "Normal Illumination";
        if (reading.isLightValid && thresholds.light) {
            const l = reading.lightRaw;
            if (l >= thresholds.light.darkThreshold) {
                lightLevel = "dark";
                lightText = "Dark / Low Light Environment";
            } else if (l <= thresholds.light.brightThreshold) {
                lightLevel = "bright";
                lightText = "Bright / Daylight Environment";
            } else {
                lightLevel = "moderate";
                lightText = "Moderate Ambient Lighting";
            }
        }

        // Determine Overall State
        let overall = "normal";
        let statusClass = "badge-normal";
        let summaryText = "All environmental indicators are within user-configured normal limits.";

        if (issues.some(i => i.level === "critical")) {
            overall = "critical";
            statusClass = "badge-critical";
            summaryText = issues.filter(i => i.level === "critical").map(i => i.msg).join(". ");
        } else if (issues.some(i => i.level === "warning")) {
            overall = "warning";
            statusClass = "badge-warning";
            summaryText = issues.filter(i => i.level === "warning").map(i => i.msg).join(". ");
        }

        // Compute Dew Point approximation: T - ((100 - RH) / 5)
        let dewPoint = null;
        if (reading.isTempValid && reading.isHumValid) {
            dewPoint = Number((reading.temperature - ((100 - reading.humidity) / 5)).toFixed(1));
        }

        // Compute Heat Index approximation
        let heatIndex = null;
        if (reading.isTempValid && reading.isHumValid && reading.temperature >= 20) {
            // Simplified Steadman's heat index
            const t = reading.temperature;
            const r = reading.humidity;
            heatIndex = Number((-8.78469475556 + 1.61139411 * t + 2.33854883889 * (r / 100 * t) - 0.14611605 * (r / 100 * (t * t))).toFixed(1));
            if (heatIndex < t) heatIndex = t;
        }

        return {
            overall,
            statusClass,
            summary: summaryText,
            issues,
            tempLevel,
            humLevel,
            lightLevel,
            lightText,
            dewPoint,
            heatIndex
        };
    },

    /**
     * Detect anomaly spikes across the historical series
     */
    detectAnomalies(feeds, thresholds) {
        if (!feeds || feeds.length === 0) return [];
        const anomalies = [];

        for (let i = 0; i < feeds.length; i++) {
            const f = feeds[i];
            const issueList = [];

            if (f.isTempValid) {
                if (f.temperature >= thresholds.temperature.maxCritical) {
                    issueList.push(`Critical Temp Spike: ${f.temperature}°C`);
                } else if (f.temperature <= thresholds.temperature.minCritical) {
                    issueList.push(`Critical Temp Drop: ${f.temperature}°C`);
                }
            }
            if (f.isHumValid) {
                if (f.humidity >= thresholds.humidity.maxCritical) {
                    issueList.push(`Critical Humidity: ${f.humidity}%`);
                } else if (f.humidity <= thresholds.humidity.minCritical) {
                    issueList.push(`Low Humidity: ${f.humidity}%`);
                }
            }

            if (issueList.length > 0) {
                anomalies.push({
                    entryId: f.entryId,
                    timestamp: f.timestamp,
                    timeString: f.timeString,
                    issues: issueList,
                    reading: f
                });
            }
        }

        return anomalies;
    },

    _emptyStats() {
        return {
            count: 0,
            startTime: null,
            endTime: null,
            timespanMinutes: 0,
            temperature: { min: null, max: null, avg: null, current: null, count: 0, unit: "°C" },
            humidity: { min: null, max: null, avg: null, current: null, count: 0, unit: "%" },
            lightRaw: { min: null, max: null, avg: null, current: null, count: 0, unit: " ADC" },
            brightnessPercent: { min: null, max: null, avg: null, current: null, count: 0, unit: "%" },
            trends: {
                temperature: { direction: "stable", delta: 0, label: "Stable", icon: "→" },
                humidity: { direction: "stable", delta: 0, label: "Stable", icon: "→" },
                light: { direction: "stable", delta: 0, label: "Stable", icon: "→" }
            }
        };
    }
};
