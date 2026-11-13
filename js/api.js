/**
 * Smart Sensor Analytics System - ThingSpeak API & Data Ingestion Layer
 * Handles fetching, parsing, sanitizing, rate-limiting, and caching telemetry.
 */

const ApiService = {
    _lastFetchTime: null,
    _cachedData: null,
    _channelMetadata: null,
    _isOnline: true,
    _isUsingFallback: false,

    /**
     * Fetch feeds with support for results count, time window, or date range
     * @param {Object} options - { results, minutes, start, end, channelId, readApiKey, forceSample }
     * @returns {Promise<{channel: Object, feeds: Array}>}
     */
    async fetchFeeds(options = {}) {
        const settings = loadUserSettings();
        const channelId = options.channelId || settings.channelId || CONFIG.THINGSPEAK.CHANNEL_ID;
        const readApiKey = options.readApiKey !== undefined ? options.readApiKey : (settings.readApiKey || "");
        const results = options.results || CONFIG.THINGSPEAK.DEFAULT_RESULTS;

        // If forceSample is requested or useLocalFallback is toggled
        if (options.forceSample || settings.useLocalFallback) {
            return await this.fetchSampleData("Loaded offline demonstration snapshot.");
        }

        // Construct ThingSpeak URL
        let url = `${CONFIG.THINGSPEAK.BASE_URL}/channels/${encodeURIComponent(channelId)}/feeds.json?results=${encodeURIComponent(results)}`;

        if (readApiKey && readApiKey.trim().length > 0) {
            url += `&api_key=${encodeURIComponent(readApiKey.trim())}`;
        }
        if (options.minutes) {
            url += `&minutes=${encodeURIComponent(options.minutes)}`;
        }
        if (options.start) {
            url += `&start=${encodeURIComponent(options.start)}`;
        }
        if (options.end) {
            url += `&end=${encodeURIComponent(options.end)}`;
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

            const response = await fetch(url, {
                signal: controller.signal,
                headers: { 'Accept': 'application/json' }
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                // If 400 or 401: Unauthorized / Bad Request (usually private channel without Read Key)
                if (response.status === 400 || response.status === 401 || response.status === 404) {
                    console.warn(`ThingSpeak returned HTTP ${response.status}. Falling back to local telemetry cache.`);
                    return await this.fetchSampleData(
                        response.status === 400 || response.status === 401
                            ? "ThingSpeak Channel is Private. Displaying historical sample dataset (Enter Read API Key in Settings to stream live)."
                            : "Channel not found on ThingSpeak. Displaying local dataset."
                    );
                }
                throw new Error(`ThingSpeak API Error: HTTP ${response.status} ${response.statusText}`);
            }

            const rawData = await response.json();
            this._lastFetchTime = new Date();
            this._isOnline = true;
            this._isUsingFallback = false;

            return this._processData(rawData);

        } catch (error) {
            console.warn("ThingSpeak live fetch failed:", error.message);
            this._isOnline = false;
            // Fallback to sample data gracefully
            return await this.fetchSampleData(`Live stream unreachable (${error.message}). Displaying local verified dataset.`);
        }
    },

    /**
     * Fallback to local verified sample data
     */
    async fetchSampleData(reasonMessage = "") {
        try {
            const res = await fetch(CONFIG.SAMPLE_DATA_URL);
            if (!res.ok) {
                throw new Error(`Failed to load sample data: HTTP ${res.status}`);
            }
            const sampleJson = await res.json();
            this._isUsingFallback = true;
            this._lastFetchTime = new Date();
            const processed = this._processData(sampleJson);
            processed.fallbackReason = reasonMessage;
            return processed;
        } catch (err) {
            console.error("Critical: Could not load sample data either:", err);
            return {
                channel: { name: CONFIG.APP_NAME, description: "System Offline", last_entry_id: 0 },
                feeds: [],
                error: err.message
            };
        }
    },

    /**
     * Process, validate, and sanitize incoming feeds
     */
    _processData(data) {
        if (!data || !data.feeds) {
            return { channel: data?.channel || {}, feeds: [] };
        }

        this._channelMetadata = data.channel || {};
        const sanitizedFeeds = [];

        for (let i = 0; i < data.feeds.length; i++) {
            const feed = data.feeds[i];
            const timestamp = new Date(feed.created_at);

            // Skip entries with invalid dates
            if (isNaN(timestamp.getTime())) continue;

            const tempRaw = parseFloat(feed.field1);
            const humRaw = parseFloat(feed.field2);
            const lightRaw = parseInt(feed.field3, 10);
            const lightStatusRaw = feed.field4 !== undefined && feed.field4 !== null && feed.field4 !== "" 
                ? parseInt(feed.field4, 10) 
                : null;

            // Validate against physical bounds
            const isTempValid = !isNaN(tempRaw) && tempRaw >= -40 && tempRaw <= 85;
            const isHumValid = !isNaN(humRaw) && humRaw >= 0 && humRaw <= 100;
            const isLightValid = !isNaN(lightRaw) && lightRaw >= 0 && lightRaw <= 4095;

            // Compute light status: 0 = Dark, 1 = Bright (using LDR hysteresis if raw provided)
            let derivedLightStatus = lightStatusRaw;
            if (derivedLightStatus === null && isLightValid) {
                derivedLightStatus = lightRaw >= CONFIG.DEFAULT_THRESHOLDS.light.darkThreshold ? 0 : 1;
            }

            // Approximate brightness percentage (ESP32 LDR divider: higher ADC = darker, lower ADC = brighter)
            // 0 (maximum bright) -> 100%, 4095 (maximum dark) -> 0%
            const brightnessPercent = isLightValid 
                ? Math.max(0, Math.min(100, Math.round(((4095 - lightRaw) / 4095) * 100)))
                : null;

            sanitizedFeeds.push({
                entryId: feed.entry_id,
                timestamp: timestamp,
                timeString: timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                dateString: timestamp.toLocaleDateString(),
                isoString: feed.created_at,

                temperature: isTempValid ? Number(tempRaw.toFixed(1)) : null,
                humidity: isHumValid ? Number(humRaw.toFixed(1)) : null,
                lightRaw: isLightValid ? lightRaw : null,
                lightStatus: derivedLightStatus, // 1 = Bright, 0 = Dark
                brightnessPercent: brightnessPercent,

                isTempValid,
                isHumValid,
                isLightValid,
                isCorrupt: !isTempValid || !isHumValid || !isLightValid
            });
        }

        this._cachedData = sanitizedFeeds;

        return {
            channel: this._channelMetadata,
            feeds: sanitizedFeeds,
            isOnline: this._isOnline,
            isUsingFallback: this._isUsingFallback,
            lastFetchTime: this._lastFetchTime
        };
    },

    /**
     * Get the latest single valid reading
     */
    getLatestReading(feeds) {
        if (!feeds || feeds.length === 0) return null;
        for (let i = feeds.length - 1; i >= 0; i--) {
            if (feeds[i].isTempValid && feeds[i].isHumValid) {
                return feeds[i];
            }
        }
        return feeds[feeds.length - 1];
    }
};
