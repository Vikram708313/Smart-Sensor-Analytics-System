/**
 * Smart Sensor Analytics System - Export & Reporting Engine
 * Provides client-side CSV generation, data formatting, and analytical summary reporting.
 */

const ExportManager = {
    /**
     * Export sensor readings to a structured CSV file
     */
    exportFeedsToCSV(feeds, customFilename = null) {
        if (!feeds || feeds.length === 0) {
            alert("No sensor readings available to export.");
            return false;
        }

        const headers = [
            "Entry_ID",
            "Timestamp_ISO",
            "Local_Date",
            "Local_Time",
            "Temperature_Celsius",
            "Humidity_Percent",
            "Light_ADC_Raw",
            "Light_Status",
            "Brightness_Percent"
        ];

        const rows = [headers.join(",")];

        for (let i = 0; i < feeds.length; i++) {
            const f = feeds[i];
            const lightStatusText = f.lightStatus === 1 ? "BRIGHT" : (f.lightStatus === 0 ? "DARK" : "UNKNOWN");
            const row = [
                f.entryId,
                `"${f.isoString || ''}"`,
                `"${f.dateString || ''}"`,
                `"${f.timeString || ''}"`,
                f.temperature !== null ? f.temperature : "",
                f.humidity !== null ? f.humidity : "",
                f.lightRaw !== null ? f.lightRaw : "",
                `"${lightStatusText}"`,
                f.brightnessPercent !== null ? f.brightnessPercent : ""
            ];
            rows.push(row.join(","));
        }

        const csvContent = "\uFEFF" + rows.join("\r\n"); // Add UTF-8 BOM
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const filename = customFilename || `Sensor_Readings_${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;

        this._triggerDownload(blob, filename);
        return true;
    },

    /**
     * Export alert history to CSV
     */
    exportAlertsToCSV(alerts, customFilename = null) {
        if (!alerts || alerts.length === 0) {
            alert("No alert history records found to export.");
            return false;
        }

        const headers = [
            "Alert_ID",
            "Timestamp_ISO",
            "Local_Date",
            "Local_Time",
            "Parameter",
            "Severity_Level",
            "Alert_Title",
            "Message_Description",
            "Sensor_Value",
            "Threshold_Violated",
            "Acknowledged",
            "Resolved"
        ];

        const rows = [headers.join(",")];

        for (let i = 0; i < alerts.length; i++) {
            const a = alerts[i];
            const row = [
                `"${a.id}"`,
                `"${a.timestamp}"`,
                `"${a.dateString || ''}"`,
                `"${a.timeString || ''}"`,
                `"${a.param}"`,
                `"${a.level.toUpperCase()}"`,
                `"${(a.title || '').replace(/"/g, '""')}"`,
                `"${(a.message || '').replace(/"/g, '""')}"`,
                a.value !== null ? a.value : "",
                a.threshold !== null ? a.threshold : "",
                a.acknowledged ? "YES" : "NO",
                a.resolved ? "YES" : "NO"
            ];
            rows.push(row.join(","));
        }

        const csvContent = "\uFEFF" + rows.join("\r\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const filename = customFilename || `Alert_History_${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;

        this._triggerDownload(blob, filename);
        return true;
    },

    /**
     * Generate and download a comprehensive analytical report in text format
     */
    exportAnalyticsSummaryReport(stats, statusEval, thresholds, channelMeta = {}) {
        if (!stats || stats.count === 0) {
            alert("Insufficient telemetry data to compile an executive report.");
            return false;
        }

        const dateGenerated = new Date().toLocaleString();
        const startStr = stats.startTime ? new Date(stats.startTime).toLocaleString() : "N/A";
        const endStr = stats.endTime ? new Date(stats.endTime).toLocaleString() : "N/A";

        let report = `================================================================================\n`;
        report += `           SMART SENSOR ANALYTICS SYSTEM - ENVIRONMENTAL AUDIT REPORT            \n`;
        report += `================================================================================\n\n`;

        report += `1. REPORT METADATA & TELEMETRY SCOPE\n`;
        report += `--------------------------------------------------------------------------------\n`;
        report += `Channel Name        : ${channelMeta.name || "Smart Sensor Analytics System"}\n`;
        report += `Channel ID          : ${channelMeta.id || CONFIG.THINGSPEAK.CHANNEL_ID}\n`;
        report += `Report Compiled At  : ${dateGenerated}\n`;
        report += `Analysis Timespan   : ${startStr}  -->  ${endStr}\n`;
        report += `Timespan Duration   : ${stats.timespanMinutes} minutes\n`;
        report += `Sample Points Analyzed : ${stats.count} readings\n\n`;

        report += `2. USER-CONFIGURED THRESHOLD PROFILE\n`;
        report += `--------------------------------------------------------------------------------\n`;
        report += `Temperature Bounds  : Min Critical ${thresholds.temperature.minCritical}°C | Min Warning ${thresholds.temperature.minWarning}°C\n`;
        report += `                      Max Warning ${thresholds.temperature.maxWarning}°C | Max Critical ${thresholds.temperature.maxCritical}°C\n`;
        report += `Humidity Bounds     : Min Critical ${thresholds.humidity.minCritical}% | Min Warning ${thresholds.humidity.minWarning}%\n`;
        report += `                      Max Warning ${thresholds.humidity.maxWarning}% | Max Critical ${thresholds.humidity.maxCritical}%\n`;
        report += `Light Thresholds    : Dark Threshold >= ${thresholds.light.darkThreshold} ADC | Bright Threshold <= ${thresholds.light.brightThreshold} ADC\n\n`;

        report += `3. STATISTICAL METRICS SUMMARY\n`;
        report += `--------------------------------------------------------------------------------\n`;
        report += `[TEMPERATURE]\n`;
        report += `  - Current Value   : ${stats.temperature.current} °C\n`;
        report += `  - Average Value   : ${stats.temperature.avg} °C\n`;
        report += `  - Minimum Value   : ${stats.temperature.min} °C\n`;
        report += `  - Maximum Value   : ${stats.temperature.max} °C\n`;
        report += `  - Std. Deviation  : ±${stats.temperature.stdDev} °C\n`;
        report += `  - Active Trend    : ${stats.trends.temperature.label} (${stats.trends.temperature.delta > 0 ? '+' : ''}${stats.trends.temperature.delta} °C)\n\n`;

        report += `[RELATIVE HUMIDITY]\n`;
        report += `  - Current Value   : ${stats.humidity.current} %\n`;
        report += `  - Average Value   : ${stats.humidity.avg} %\n`;
        report += `  - Minimum Value   : ${stats.humidity.min} %\n`;
        report += `  - Maximum Value   : ${stats.humidity.max} %\n`;
        report += `  - Std. Deviation  : ±${stats.humidity.stdDev} %\n`;
        report += `  - Active Trend    : ${stats.trends.humidity.label} (${stats.trends.humidity.delta > 0 ? '+' : ''}${stats.trends.humidity.delta} %)\n\n`;

        report += `[LIGHT INTENSITY & ILLUMINATION]\n`;
        report += `  - Current ADC Raw : ${stats.lightRaw.current} ADC\n`;
        report += `  - Average ADC Raw : ${stats.lightRaw.avg} ADC\n`;
        report += `  - Minimum ADC Raw : ${stats.lightRaw.min} ADC (Brightest)\n`;
        report += `  - Maximum ADC Raw : ${stats.lightRaw.max} ADC (Darkest)\n`;
        report += `  - Brightness Avg  : ${stats.brightnessPercent.avg} %\n`;
        report += `  - Active Trend    : ${stats.trends.light.label}\n\n`;

        report += `4. ENVIRONMENTAL COMFORT & DERIVED INDICES\n`;
        report += `--------------------------------------------------------------------------------\n`;
        report += `Overall Status      : ${statusEval.overall.toUpperCase()}\n`;
        report += `Status Summary      : ${statusEval.summary}\n`;
        report += `Dew Point           : ${statusEval.dewPoint !== null ? statusEval.dewPoint + " °C" : "N/A"}\n`;
        report += `Heat Index          : ${statusEval.heatIndex !== null ? statusEval.heatIndex + " °C" : "N/A"}\n`;
        report += `Lighting Condition  : ${statusEval.lightText}\n\n`;

        report += `5. SYSTEM INTEGRITY & TELEMETRY HEALTH\n`;
        report += `--------------------------------------------------------------------------------\n`;
        report += `Sensor Ingestion    : ESP32 Node via Wi-Fi HTTP REST Ingestion\n`;
        report += `Data Sampling Rate  : ~20 seconds per packet\n`;
        report += `Quality Assurance   : Range verification and boundary validation enforced\n`;
        report += `================================================================================\n`;
        report += `Generated automatically by Smart Sensor Analytics System. All rights reserved.\n`;

        const blob = new Blob([report], { type: "text/plain;charset=utf-8;" });
        const filename = `Environmental_Summary_Report_${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
        this._triggerDownload(blob, filename);
        return true;
    },

    /**
     * Browser download helper
     */
    _triggerDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 300);
    }
};
