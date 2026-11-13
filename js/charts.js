/**
 * Smart Sensor Analytics System - Chart Management Layer
 * Professional Blue & White Theme
 * Configures and renders responsive Chart.js line charts with gradients,
 * dynamic updates, custom tooltips, and time formatting.
 */

const ChartManager = {
    _tempChart: null,
    _humChart: null,
    _lightChart: null,

    /**
     * Common Chart.js styling options for professional blue & white theme
     */
    _getCommonOptions(yTitle, yMin = null, yMax = null) {
        return {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 500,
                easing: 'easeOutQuart'
            },
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(255, 255, 255, 0.97)',
                    titleColor: '#0f172a',
                    bodyColor: '#334155',
                    borderColor: '#bfdbfe',
                    borderWidth: 1.5,
                    padding: 12,
                    cornerRadius: 10,
                    boxShadow: '0 8px 20px rgba(30, 58, 138, 0.12)',
                    displayColors: true,
                    titleFont: { size: 12, weight: '700', family: "'Plus Jakarta Sans', sans-serif" },
                    bodyFont: { size: 12, weight: '600', family: "'Plus Jakarta Sans', sans-serif" },
                    callbacks: {
                        title: function(items) {
                            if (!items.length) return '';
                            const rawDate = items[0].raw?.isoString || items[0].label;
                            return new Date(rawDate).toLocaleString([], {
                                month: 'short', day: 'numeric',
                                hour: '2-digit', minute: '2-digit', second: '2-digit'
                            });
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(203, 213, 225, 0.45)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#64748b',
                        font: { size: 11, weight: '600', family: "'Plus Jakarta Sans', sans-serif" },
                        maxTicksLimit: 8,
                        maxRotation: 0
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: yTitle,
                        color: '#1e3a8a',
                        font: { size: 12, weight: '700', family: "'Plus Jakarta Sans', sans-serif" }
                    },
                    min: yMin,
                    max: yMax,
                    grid: {
                        color: 'rgba(203, 213, 225, 0.45)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#64748b',
                        font: { size: 11, weight: '600', family: "'Plus Jakarta Sans', sans-serif" }
                    }
                }
            }
        };
    },

    /**
     * Initialize all three charts in Historical Analytics
     */
    initCharts() {
        this.destroyAll();

        const tempCanvas = document.getElementById('tempChartCanvas');
        const humCanvas = document.getElementById('humChartCanvas');
        const lightCanvas = document.getElementById('lightChartCanvas');

        // 1. Temperature History Chart (Medium/Royal Blue)
        if (tempCanvas) {
            const ctx = tempCanvas.getContext('2d');
            const grad = ctx.createLinearGradient(0, 0, 0, 260);
            grad.addColorStop(0, 'rgba(37, 99, 235, 0.28)');
            grad.addColorStop(1, 'rgba(37, 99, 235, 0.01)');

            this._tempChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Temperature (°C)',
                        data: [],
                        borderColor: '#2563eb',
                        backgroundColor: grad,
                        borderWidth: 2.4,
                        pointRadius: 2,
                        pointHoverRadius: 6,
                        pointBackgroundColor: '#2563eb',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 2,
                        fill: true,
                        tension: 0.35,
                        spanGaps: true
                    }]
                },
                options: this._getCommonOptions('Temperature (°C)')
            });
        }

        // 2. Humidity History Chart (Sky/Cyan Blue)
        if (humCanvas) {
            const ctx = humCanvas.getContext('2d');
            const grad = ctx.createLinearGradient(0, 0, 0, 260);
            grad.addColorStop(0, 'rgba(2, 132, 199, 0.28)');
            grad.addColorStop(1, 'rgba(2, 132, 199, 0.01)');

            this._humChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Humidity (%)',
                        data: [],
                        borderColor: '#0284c7',
                        backgroundColor: grad,
                        borderWidth: 2.4,
                        pointRadius: 2,
                        pointHoverRadius: 6,
                        pointBackgroundColor: '#0284c7',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 2,
                        fill: true,
                        tension: 0.35,
                        spanGaps: true
                    }]
                },
                options: this._getCommonOptions('Humidity (%)', 0, 100)
            });
        }

        // 3. Light / Illumination History Chart (Indigo / Electric Blue)
        if (lightCanvas) {
            const ctx = lightCanvas.getContext('2d');
            const grad = ctx.createLinearGradient(0, 0, 0, 260);
            grad.addColorStop(0, 'rgba(79, 70, 229, 0.25)');
            grad.addColorStop(1, 'rgba(79, 70, 229, 0.01)');

            this._lightChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Brightness (%)',
                        data: [],
                        borderColor: '#4f46e5',
                        backgroundColor: grad,
                        borderWidth: 2.4,
                        pointRadius: 2,
                        pointHoverRadius: 6,
                        pointBackgroundColor: '#4f46e5',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 2,
                        fill: true,
                        tension: 0.35,
                        spanGaps: true
                    }]
                },
                options: this._getCommonOptions('Brightness (%)', 0, 100)
            });
        }
    },

    /**
     * Update chart data from filtered feeds
     */
    updateCharts(feeds) {
        if (!feeds) return;

        const labels = feeds.map(f => f.timeString);
        const tempPoints = feeds.map(f => ({ x: f.timeString, y: f.temperature, isoString: f.isoString }));
        const humPoints = feeds.map(f => ({ x: f.timeString, y: f.humidity, isoString: f.isoString }));
        const lightPoints = feeds.map(f => ({ x: f.timeString, y: f.brightnessPercent, rawAdc: f.lightRaw, isoString: f.isoString }));

        if (this._tempChart) {
            this._tempChart.data.labels = labels;
            this._tempChart.data.datasets[0].data = tempPoints;
            this._tempChart.update();
        }

        if (this._humChart) {
            this._humChart.data.labels = labels;
            this._humChart.data.datasets[0].data = humPoints;
            this._humChart.update();
        }

        if (this._lightChart) {
            this._lightChart.data.labels = labels;
            this._lightChart.data.datasets[0].data = lightPoints;
            this._lightChart.update();
        }
    },

    /**
     * Destroy charts to prevent memory leak on reloads
     */
    destroyAll() {
        if (this._tempChart) { this._tempChart.destroy(); this._tempChart = null; }
        if (this._humChart) { this._humChart.destroy(); this._humChart = null; }
        if (this._lightChart) { this._lightChart.destroy(); this._lightChart = null; }
    }
};
