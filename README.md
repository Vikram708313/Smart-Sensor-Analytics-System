# Smart Sensor Analytics System
### Enterprise-Grade IoT Environmental Monitoring & Predictive Analytics Platform

[![Platform](https://img.shields.io/badge/Platform-ESP32%20%7C%20FreeRTOS-blue.svg)](https://www.espressif.com/)
[![Cloud](https://img.shields.io/badge/Cloud-ThingSpeak%20REST%20API-brightgreen.svg)](https://thingspeak.mathworks.com/)
[![Frontend](https://img.shields.io/badge/Frontend-HTML5%20%7C%20CSS3%20%7C%20Chart.js-orange.svg)](https://www.chartjs.org/)
[![License](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)

The **Smart Sensor Analytics System (SSAS)** is a professional, software-centric IoT environmental intelligence platform. It transforms raw edge telemetry from an ESP32 microcontroller into actionable, presentation-ready environmental insights, historical analytics, biometeorological indices (Dew Point, Heat Index), and configurable threshold alerts.

---

## 1. System Architecture

The system operates across three strictly decoupled tiers to ensure edge resilience, cloud scalability, and presentation-tier security:

```
+-------------------------------------------------------------------------+
|                              EDGE LAYER                                 |
|                                                                         |
|   +-----------------------+           +-----------------------------+   |
|   |  DHT11 Sensor         |           |  LDR Light Sensor           |   |
|   |  - Temp & Rel Humidity|           |  - Ambient Illuminance      |   |
|   |  - GPIO 5 (Pull-up)   |           |  - GPIO 34 (12-bit ADC AO)  |   |
|   +-----------+-----------+           +--------------+--------------+   |
|               |                                      |                  |
|               +------------------+-------------------+                  |
|                                  |                                      |
|                                  v                                      |
|                       +--------------------+                            |
|                       |  ESP32 Dev Board   |                            |
|                       |  - Rolling 20x Avg |                            |
|                       |  - Light Hysteresis|                            |
|                       |  - 20s Wi-Fi HTTP  |                            |
|                       +---------+----------+                            |
+---------------------------------|---------------------------------------+
                                  | Wi-Fi HTTP GET (Protected Write Key)
                                  v
+-------------------------------------------------------------------------+
|                              CLOUD LAYER                                |
|                                                                         |
|                  ThingSpeak Cloud Ingestion Platform                    |
|                        Channel ID: 3576765                              |
|                                                                         |
|      Field 1: Temperature (°C)       Field 3: Light Intensity (ADC)     |
|      Field 2: Relative Humidity (%)  Field 4: Light Status (0/1)        |
+---------------------------------+---------------------------------------+
                                  |
                                  | REST API GET feeds.json (Read-Only)
                                  v
+-------------------------------------------------------------------------+
|                           APPLICATION LAYER                             |
|                                                                         |
|   +---------------------+  +---------------------+  +---------------+   |
|   | Data Retrieval &    |  | Analytics &         |  | Threshold &   |   |
|   | Polling Engine      |  | Statistical Engine  |  | Alert Engine  |   |
|   | - Rate-limit safe   |  | - Min / Max / Avg   |  | - Debounce    |   |
|   | - Error recovery    |  | - Trend detection   |  | - Recovery    |   |
|   | - Local cache store |  | - Dew Pt/Heat Index |  | - Ack/Resolve |   |
|   +----------+----------+  +----------+----------+  +-------+-------+   |
|              |                        |                     |           |
|              v                        v                     v           |
|   +-----------------------------------------------------------------+   |
|   |             Responsive Single-Page Web Dashboard               |   |
|   |  - Live Overview Cards               - Chart.js Visualizations  |   |
|   |  - Environmental Health Banner       - Incident & Alert Log     |   |
|   |  - Threshold Management Form         - CSV & Executive Reports  |   |
|   +-----------------------------------------------------------------+   |
+-------------------------------------------------------------------------+
```

---

## 2. Hardware Topology & Firmware Reference

*Note: The hardware and firmware implementation remains 100% intact and preserved.*

| Component | Pin / Channel | Specifications / Operational Range |
| :--- | :--- | :--- |
| **Microcontroller** | ESP32-WROOM-32 | Dual-core Tensilica Xtensa LX6, 240 MHz, 2.4 GHz 802.11 b/g/n Wi-Fi |
| **DHT11 Sensor** | GPIO 5 | Temp: `0°C – 50°C (±2°C)` • Humidity: `20% – 90% RH (±5%)` |
| **LDR Photoresistor** | GPIO 34 (ADC1_CH6)| 12-bit Analog-to-Digital Converter (`0 – 4095` counts) |
| **Light Hysteresis** | Software-defined | Dark threshold `≥ 2400 ADC` • Bright threshold `≤ 1800 ADC` |
| **Upload Period** | 20 Seconds | Strict rate-limit compliance with ThingSpeak Free tier |

Source firmware is located at [IOT.arduino.ino](file:///C:/Users/Server/Documents/Arduino/IOT.arduino/IOT.arduino.ino).

---

## 3. Core Software Features

### 3.1 Historical Telemetry Analytics
- **Live Stream & Historical Ingestion**: Communicates asynchronously with ThingSpeak Channel `3576765`.
- **Time Filters**: Single-click filtering across `1 Hour`, `24 Hours`, `7 Days`, `30 Days`, and `All Data`.
- **Dynamic Charting**: Responsive Chart.js visualizations with custom gradients, anti-aliased curves, hover tooltips, and time formatting.
- **Statistical Summaries**: Calculates real-time Minimum, Maximum, Mean (Average), and Standard Deviation ($\sigma$) across all parameters.
- **Directional Trend Analysis**: Detects whether conditions are **Rising (↑)**, **Falling (↓)**, or **Stable (→)** based on rolling linear delta computations.

### 3.2 Environmental Interpretation & Derived Indices
- **Biometeorology Computation**:
  - **Dew Point Approximation**:
    $$T_{dew} \approx T - \left(\frac{100 - RH}{5}\right)$$
  - **Heat Index (Apparent Temperature)**: Integrated Steadman thermal comfort equations combining temperature and moisture levels.
- **Illuminance Translation**: Converts raw 12-bit ADC counts into human-readable Brightness Percentage (`0% – 100%`) and classification (`DARK`, `MODERATE`, `BRIGHT`).
- **Explainable Health Status**: Surfaces plain-English assessments explaining exact triggers (e.g., *"Elevated Temperature: 30.5°C exceeds warning threshold of 30.0°C"*).

### 3.3 State-Machine Threshold Alert System
- **Configurable Multi-Tier Bounds**: Supports distinct **Warning** and **Critical** thresholds for both upper and lower boundaries.
- **Continuous Condition Debouncing**: Prevents notification spam by implementing a finite state machine:
  - `NORMAL` $\to$ `WARNING` (1 Alert Dispatched)
  - `WARNING` $\to$ `CRITICAL` (1 Escalation Dispatched)
  - `WARNING` $\to$ `WARNING` (Suppressed — No duplicate spam)
  - `WARNING/CRITICAL` $\to$ `NORMAL` (Automatic **Recovery Notification** generated)
- **Lifecycle Management**: Alerts feature persistent history, timestamps, severity tags, and interactive **Acknowledge** / **Resolve** state toggles.

### 3.4 Data Export & Executive Reporting
- **Filtered Telemetry CSV**: Exports currently filtered time-series data with local timestamps, formatted dates, and sensor fields.
- **Full Historical Archive CSV**: One-click download of all channel records.
- **Incident History CSV**: Exports complete logs of threshold violations and resolution states.
- **Executive Environmental Audit Report**: Generates a structured `.txt` report containing metadata, threshold profiles, statistical variances, biometeorological comfort indices, and health compliance audits.

---

## 4. Directory Structure

```
c:\Users\Server\Documents\Antigravity\
├── index.html              # Main responsive single-page web dashboard
├── css/
│   ├── main.css            # Design tokens, layout grids, typography, animations
│   └── components.css      # Glassmorphic metric cards, alert badges, modal dialogs
├── js/
│   ├── config.js           # Configuration constants, storage keys, default rules
│   ├── api.js              # ThingSpeak REST client with offline fallback & caching
│   ├── analytics.js        # Statistical analysis, time filters, trends, comfort indices
│   ├── alerts.js           # Alert state machine, debouncing, and history manager
│   ├── charts.js           # Chart.js integration, gradients, and custom tooltips
│   ├── export.js           # CSV parser and executive summary report generator
│   ├── app.js              # Master state coordinator and lifecycle controller
│   └── chart.min.js        # Vendored standalone Chart.js UMD bundle (offline-capable)
├── data/
│   └── sample-feeds.json   # 152+ real verified ThingSpeak readings for instant demo
├── serve.ps1               # Lightweight local HTTP static server script
└── README.md               # Complete platform documentation
```

---

## 5. Security & Reliability Highlights

1. **Write API Key Isolation**: The ThingSpeak Write API Key: [REDACTED — never publish this credential]. It is **never** embedded in client-side HTML/JS or checked into public git repositories.
2. **Client-Side Credential Storage**: ThingSpeak Channel IDs and Read API Keys are saved exclusively inside the browser's encrypted `localStorage`, protecting private channels from exposure.
3. **Resilient Offline Demostration**: If the ThingSpeak channel is private, offline, or rate-limited, the platform gracefully activates an offline snapshot mode using [sample-feeds.json](file:///c:/Users/Server/Documents/Antigravity/data/sample-feeds.json), ensuring seamless presentations without connectivity dropouts.
4. **Data Sanitization**: Incoming packets are strictly validated against sensor physical limits (`-40°C` to `85°C`, `0%` to `100%` RH, `0` to `4095` ADC) to prevent corrupt readings or NaN errors from breaking charts.

---

## 6. How to Run Locally

### Option A: Using the Built-in Lightweight Server (PowerShell)
```powershell
cd c:\Users\Server\Documents\Antigravity
powershell -ExecutionPolicy Bypass -File serve.ps1 -Port 8080
```
Open your browser to: **`http://localhost:8080/`**

### Option B: Using Python
```bash
cd c:\Users\Server\Documents\Antigravity
python -m http.server 8080
```

### Option C: Using Node.js / npx
```bash
npx serve .
```

### Option D: Direct Static File Opening
You can also directly open `index.html` in Chrome or Edge.

---

## 7. Deployment to GitHub Pages

1. Initialize a Git repository in `c:\Users\Server\Documents\Antigravity`:
   ```bash
   git init
   git add .
   git commit -m "feat: complete Smart Sensor Analytics System release 2.0"
   ```
2. Push to your GitHub repository:
   ```bash
   git branch -M main
   git remote add origin https://github.com/<username>/smart-sensor-analytics-system.git
   git push -u origin main
   ```
3. In GitHub, go to **Settings > Pages > Source**, select branch `main` and folder `/ (root)`, and click **Save**.
4. The dashboard will be live worldwide at `https://<username>.github.io/smart-sensor-analytics-system/` with zero server infrastructure costs!
