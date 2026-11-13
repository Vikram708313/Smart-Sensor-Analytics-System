/**
 * Smart Sensor Analytics System - Configuration Module
 * Provides default configurations, local storage management, and constants.
 */

const CONFIG = {
    APP_NAME: "Smart Sensor Analytics System",
    VERSION: "2.0.0",

    // ThingSpeak Default Configuration
    THINGSPEAK: {
        CHANNEL_ID: "3576765",
        READ_API_KEY: "", // Read API Key if channel is private; can be set via Settings modal
        BASE_URL: "https://api.thingspeak.com",
        DEFAULT_RESULTS: 100,
        MAX_RESULTS: 8000,
        POLL_INTERVAL_SEC: 20, // ESP32 uploads every 20 seconds
        FIELD_MAP: {
            temperature: "field1",
            humidity: "field2",
            lightRaw: "field3",
            lightStatus: "field4"
        }
    },

    // Sensor Calibration & Physical Ranges
    SENSOR_SPECS: {
        DHT11: {
            tempRange: { min: 0, max: 50, unit: "°C" },
            humRange: { min: 20, max: 90, unit: "%" },
            tempAccuracy: "±2°C",
            humAccuracy: "±5%"
        },
        LDR: {
            adcBits: 12, // ESP32 12-bit ADC (0 - 4095)
            minRaw: 0,
            maxRaw: 4095,
            darkDefaultThreshold: 2400,
            brightDefaultThreshold: 1800
        }
    },

    // User-Defined Threshold Defaults (Customizable in UI)
    DEFAULT_THRESHOLDS: {
        temperature: {
            minCritical: 10.0,
            minWarning: 18.0,
            maxWarning: 30.0,
            maxCritical: 35.0,
            unit: "°C"
        },
        humidity: {
            minCritical: 20.0,
            minWarning: 30.0,
            maxWarning: 65.0,
            maxCritical: 80.0,
            unit: "%"
        },
        light: {
            darkThreshold: 2400,   // Raw ADC >= 2400 indicates Dark
            brightThreshold: 1800  // Raw ADC <= 1800 indicates Bright
        }
    },

    // Storage Keys
    STORAGE_KEYS: {
        SETTINGS: "ssas_user_settings_v2",
        THRESHOLDS: "ssas_user_thresholds_v2",
        ALERT_HISTORY: "ssas_alert_history_v2",
        DISMISSED_ALERTS: "ssas_dismissed_alerts_v2"
    },

    // Fallback Sample Data Path
    SAMPLE_DATA_URL: "data/sample-feeds.json"
};

// Helper: Load persistent user settings
function loadUserSettings() {
    try {
        const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.SETTINGS);
        if (saved) {
            return JSON.parse(saved);
        }
    } catch (e) {
        console.warn("Could not load saved settings from localStorage:", e);
    }
    return {
        channelId: CONFIG.THINGSPEAK.CHANNEL_ID,
        readApiKey: CONFIG.THINGSPEAK.READ_API_KEY,
        pollInterval: CONFIG.THINGSPEAK.POLL_INTERVAL_SEC,
        useLocalFallback: false,
        autoRefresh: true
    };
}

// Helper: Save persistent user settings
function saveUserSettings(settings) {
    try {
        localStorage.setItem(CONFIG.STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
        return true;
    } catch (e) {
        console.error("Failed to save settings to localStorage:", e);
        return false;
    }
}

// Helper: Load persistent user thresholds
function loadUserThresholds() {
    try {
        const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.THRESHOLDS);
        if (saved) {
            return JSON.parse(saved);
        }
    } catch (e) {
        console.warn("Could not load thresholds from localStorage:", e);
    }
    return JSON.parse(JSON.stringify(CONFIG.DEFAULT_THRESHOLDS));
}

// Helper: Save user thresholds
function saveUserThresholds(thresholds) {
    try {
        localStorage.setItem(CONFIG.STORAGE_KEYS.THRESHOLDS, JSON.stringify(thresholds));
        return true;
    } catch (e) {
        console.error("Failed to save thresholds to localStorage:", e);
        return false;
    }
}
