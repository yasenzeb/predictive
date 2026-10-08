/**
 * Predictive Maintenance System - High-Tech Chart Visualizer
 * Powered by Chart.js with Cyber-Industrial Neon Aesthetics
 */

class TelemetryChartManager {
  constructor(canvasId) {
    this.canvasId = canvasId;
    this.chart = null;
    this.activeMetrics = {
      temp: true,
      rpm: true,
      vib: true,
      current: true
    };
  }

  init() {
    const canvas = document.getElementById(this.canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Create neon gradients
    const gradCyan = ctx.createLinearGradient(0, 0, 0, 350);
    gradCyan.addColorStop(0, 'rgba(0, 240, 255, 0.4)');
    gradCyan.addColorStop(1, 'rgba(0, 240, 255, 0.0)');

    const gradRed = ctx.createLinearGradient(0, 0, 0, 350);
    gradRed.addColorStop(0, 'rgba(239, 68, 68, 0.35)');
    gradRed.addColorStop(1, 'rgba(239, 68, 68, 0.0)');

    const gradAmber = ctx.createLinearGradient(0, 0, 0, 350);
    gradAmber.addColorStop(0, 'rgba(245, 158, 11, 0.3)');
    gradAmber.addColorStop(1, 'rgba(245, 158, 11, 0.0)');

    const gradEmerald = ctx.createLinearGradient(0, 0, 0, 350);
    gradEmerald.addColorStop(0, 'rgba(16, 185, 129, 0.35)');
    gradEmerald.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

    const logs = [...window.maintenanceStorage.getLogs()].reverse(); // Chronological order
    const labels = logs.map(l => l.timestamp.split(' ')[1] || l.timestamp);

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Temperature (°C)',
            data: logs.map(l => l.temperature),
            borderColor: '#EF4444',
            backgroundColor: gradRed,
            borderWidth: 2.5,
            pointBackgroundColor: '#EF4444',
            pointBorderColor: '#FFFFFF',
            pointRadius: 4,
            pointHoverRadius: 7,
            tension: 0.35,
            fill: true,
            yAxisID: 'yTemp'
          },
          {
            label: 'Vibration Max (mm/s)',
            data: logs.map(l => Math.max(l.vibX, l.vibY, l.vibZ)),
            borderColor: '#00F0FF',
            backgroundColor: gradCyan,
            borderWidth: 2.5,
            pointBackgroundColor: '#00F0FF',
            pointBorderColor: '#FFFFFF',
            pointRadius: 4,
            pointHoverRadius: 7,
            tension: 0.35,
            fill: true,
            yAxisID: 'yVib'
          },
          {
            label: 'Current (A)',
            data: logs.map(l => l.current),
            borderColor: '#F59E0B',
            backgroundColor: gradAmber,
            borderWidth: 2,
            pointBackgroundColor: '#F59E0B',
            pointBorderColor: '#FFFFFF',
            pointRadius: 3,
            pointHoverRadius: 6,
            tension: 0.3,
            fill: false,
            yAxisID: 'yVib'
          },
          {
            label: 'RPM (Speed)',
            data: logs.map(l => l.rpm),
            borderColor: '#10B981',
            backgroundColor: gradEmerald,
            borderWidth: 2,
            borderDash: [5, 4],
            pointBackgroundColor: '#10B981',
            pointBorderColor: '#FFFFFF',
            pointRadius: 3,
            pointHoverRadius: 6,
            tension: 0.25,
            fill: false,
            yAxisID: 'yRpm'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            display: false // We use custom cyber pills for legend toggling
          },
          tooltip: {
            backgroundColor: 'rgba(6, 11, 22, 0.95)',
            titleColor: '#00F0FF',
            titleFont: { family: 'Rajdhani', size: 14, weight: '700' },
            bodyColor: '#F8FAFC',
            bodyFont: { family: 'JetBrains Mono', size: 12 },
            borderColor: 'rgba(0, 240, 255, 0.3)',
            borderWidth: 1,
            padding: 12,
            displayColors: true,
            boxPadding: 6,
            callbacks: {
              afterTitle: function(context) {
                return 'Telemetry Timestamp: ' + context[0].label;
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              color: 'rgba(255, 255, 255, 0.05)',
              borderColor: '#1E293B'
            },
            ticks: {
              color: '#94A3B8',
              font: { family: 'JetBrains Mono', size: 11 }
            }
          },
          yVib: {
            type: 'linear',
            display: true,
            position: 'left',
            title: {
              display: true,
              text: 'Vibration (mm/s) / Current (A)',
              color: '#00F0FF',
              font: { family: 'Chakra Petch', size: 11, weight: '600' }
            },
            grid: {
              color: 'rgba(0, 240, 255, 0.05)'
            },
            ticks: {
              color: '#64748B',
              font: { family: 'JetBrains Mono', size: 10 }
            }
          },
          yTemp: {
            type: 'linear',
            display: true,
            position: 'right',
            title: {
              display: true,
              text: 'Temperature (°C)',
              color: '#EF4444',
              font: { family: 'Chakra Petch', size: 11, weight: '600' }
            },
            grid: {
              drawOnChartArea: false
            },
            ticks: {
              color: '#EF4444',
              font: { family: 'JetBrains Mono', size: 10 }
            }
          },
          yRpm: {
            type: 'linear',
            display: false, // RPM has large values (1000 - 5000), scaled internally
            position: 'right',
            grid: {
              drawOnChartArea: false
            }
          }
        }
      }
    });
  }

  toggleDataset(index, pillElement) {
    if (!this.chart) return;
    const isVisible = this.chart.isDatasetVisible(index);
    this.chart.setDatasetVisibility(index, !isVisible);
    this.chart.update();

    if (pillElement) {
      if (isVisible) {
        pillElement.classList.add('opacity-40', 'line-through');
      } else {
        pillElement.classList.remove('opacity-40', 'line-through');
      }
    }
  }

  updateData() {
    if (!this.chart) {
      this.init();
      return;
    }
    const logs = [...window.maintenanceStorage.getLogs()].reverse();
    const labels = logs.map(l => l.timestamp.split(' ')[1] || l.timestamp);

    this.chart.data.labels = labels;
    this.chart.data.datasets[0].data = logs.map(l => l.temperature);
    this.chart.data.datasets[1].data = logs.map(l => Math.max(l.vibX, l.vibY, l.vibZ));
    this.chart.data.datasets[2].data = logs.map(l => l.current);
    this.chart.data.datasets[3].data = logs.map(l => l.rpm);

    this.chart.update('active');
  }
}

window.telemetryChartManager = new TelemetryChartManager('telemetryChart');
