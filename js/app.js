/**
 * Predictive Maintenance System - Application Controller
 */

class AppController {
  constructor() {
    this.currentPage = 'page-1';
    this.currentFilter = 'ALL';
    this.init();
  }

  init() {
    // Setup event listeners
    this.setupNavigation();
    this.setupForm();
    this.setupLogsTable();
    this.setupPresets();
    this.setupAudioToggle();

    // Initial render
    this.refreshAlertBanner();
    this.renderLogsTable();
    this.updateStatsCards();

    // Init chart
    setTimeout(() => {
      if (window.telemetryChartManager) {
        window.telemetryChartManager.init();
      }
    }, 100);
  }

  /* ----------------- Navigation ----------------- */
  setupNavigation() {
    const navButtons = document.querySelectorAll('[data-page-target]');
    navButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const targetPage = btn.getAttribute('data-page-target');
        this.navigateTo(targetPage);
        window.soundEngine.playClick();
      });
    });
  }

  navigateTo(pageId) {
    this.currentPage = pageId;

    // Update nav links
    document.querySelectorAll('[data-page-target]').forEach(el => {
      const target = el.getAttribute('data-page-target');
      if (target === pageId) {
        el.classList.add('text-cyan-glow', 'border-b-2', 'border-[#00F0FF]');
        el.classList.remove('text-slate-400', 'border-transparent');
      } else {
        el.classList.remove('text-cyan-glow', 'border-b-2', 'border-[#00F0FF]');
        el.classList.add('text-slate-400', 'border-transparent');
      }
    });

    // Update page views
    document.querySelectorAll('.page-view').forEach(view => {
      if (view.id === pageId) {
        view.classList.add('active');
        view.classList.remove('hidden');
      } else {
        view.classList.remove('active');
        view.classList.add('hidden');
      }
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Refresh charts if landing on Page 3
    if (pageId === 'page-3') {
      setTimeout(() => {
        if (window.telemetryChartManager) {
          window.telemetryChartManager.updateData();
        }
      }, 50);
    }
  }

  /* ----------------- Alert Banner ----------------- */
  refreshAlertBanner() {
    const alert = window.maintenanceStorage.getActiveAlert();
    const banner = document.getElementById('hero-alert-banner');
    const bannerTitle = document.getElementById('banner-title');
    const bannerMsg = document.getElementById('banner-message');
    const bannerBadge = document.getElementById('banner-badge');
    const bannerTime = document.getElementById('banner-time');
    const topSystemBadge = document.getElementById('top-system-status');

    if (!banner) return;

    banner.classList.remove('state-normal', 'state-warning', 'state-danger');

    if (alert.level === 'DANGER') {
      banner.classList.add('state-danger');
      bannerTitle.textContent = 'CRITICAL SYSTEM HAZARD DETECTED';
      bannerTitle.className = 'font-display font-bold text-lg text-red-400 flex items-center gap-2';
      bannerBadge.textContent = 'CRITICAL FAULT';
      bannerBadge.className = 'badge-status badge-danger';
      topSystemBadge.innerHTML = '<span class="pulsing-dot danger"></span><span class="text-red-400 font-mono">STATUS: CRITICAL FAULT</span>';
    } else if (alert.level === 'WARNING') {
      banner.classList.add('state-warning');
      bannerTitle.textContent = 'PREVENTIVE MAINTENANCE WARNING';
      bannerTitle.className = 'font-display font-bold text-lg text-amber-400 flex items-center gap-2';
      bannerBadge.textContent = 'ANOMALY DETECTED';
      bannerBadge.className = 'badge-status badge-warning';
      topSystemBadge.innerHTML = '<span class="pulsing-dot warning"></span><span class="text-amber-400 font-mono">STATUS: ATTENTION REQUIRED</span>';
    } else {
      banner.classList.add('state-normal');
      bannerTitle.textContent = 'TELEMETRY NOMINAL';
      bannerTitle.className = 'font-display font-bold text-lg text-emerald-400 flex items-center gap-2';
      bannerBadge.textContent = 'HEALTHY';
      bannerBadge.className = 'badge-status badge-normal';
      topSystemBadge.innerHTML = '<span class="pulsing-dot online"></span><span class="text-emerald-400 font-mono">STATUS: 100% OPERATIONAL</span>';
    }

    bannerMsg.textContent = alert.message;
    if (bannerTime) bannerTime.textContent = alert.timestamp || new Date().toLocaleTimeString();
  }

  /* ----------------- Form & Inputs ----------------- */
  setupForm() {
    const form = document.getElementById('sensor-data-form');
    if (!form) return;

    // Real-time live status indicator below input fields
    const inputs = ['input-current', 'input-vib-x', 'input-vib-y', 'input-vib-z', 'input-rpm', 'input-temp'];
    inputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => this.liveEvaluateInput(id, el.value));
      }
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleFormSubmit();
    });
  }

  liveEvaluateInput(inputId, valStr) {
    const val = parseFloat(valStr);
    const feedbackEl = document.getElementById(`${inputId}-feedback`);
    if (!feedbackEl || isNaN(val)) return;

    if (inputId === 'input-current') {
      if (val > 28) {
        feedbackEl.innerHTML = '<span class="text-red-400 font-mono text-xs">⚠️ Danger: Current Surge (> 28A)</span>';
      } else if (val > 20) {
        feedbackEl.innerHTML = '<span class="text-amber-400 font-mono text-xs">⚡ Warning: High Load (20-28A)</span>';
      } else {
        feedbackEl.innerHTML = '<span class="text-emerald-400 font-mono text-xs">✓ Nominal (5 - 20A)</span>';
      }
    } else if (inputId.startsWith('input-vib')) {
      if (val > 6.5) {
        feedbackEl.innerHTML = '<span class="text-red-400 font-mono text-xs">⚠️ Danger: Severe Vibration (> 6.5 mm/s)</span>';
      } else if (val > 3.5) {
        feedbackEl.innerHTML = '<span class="text-amber-400 font-mono text-xs">⚡ Warning: High Vibration (3.5-6.5 mm/s)</span>';
      } else {
        feedbackEl.innerHTML = '<span class="text-emerald-400 font-mono text-xs">✓ Nominal (&lt; 3.5 mm/s)</span>';
      }
    } else if (inputId === 'input-rpm') {
      if (val > 4200 || (val > 0 && val < 600)) {
        feedbackEl.innerHTML = '<span class="text-red-400 font-mono text-xs">⚠️ Danger: Dangerous RPM Range</span>';
      } else if (val > 3200 || (val > 0 && val < 1000)) {
        feedbackEl.innerHTML = '<span class="text-amber-400 font-mono text-xs">⚡ Warning: Non-Optimal RPM</span>';
      } else {
        feedbackEl.innerHTML = '<span class="text-emerald-400 font-mono text-xs">✓ Nominal (1200 - 3200 RPM)</span>';
      }
    } else if (inputId === 'input-temp') {
      if (val > 85) {
        feedbackEl.innerHTML = '<span class="text-red-400 font-mono text-xs">⚠️ Danger: Thermal Overheat (> 85°C)</span>';
      } else if (val > 65) {
        feedbackEl.innerHTML = '<span class="text-amber-400 font-mono text-xs">⚡ Warning: Thermal Warning (65-85°C)</span>';
      } else {
        feedbackEl.innerHTML = '<span class="text-emerald-400 font-mono text-xs">✓ Nominal (25 - 65°C)</span>';
      }
    }
  }

  handleFormSubmit() {
    const current = document.getElementById('input-current').value;
    const vibX = document.getElementById('input-vib-x').value;
    const vibY = document.getElementById('input-vib-y').value;
    const vibZ = document.getElementById('input-vib-z').value;
    const rpm = document.getElementById('input-rpm').value;
    const temperature = document.getElementById('input-temp').value;
    const note = document.getElementById('input-note').value;

    const payload = { current, vibX, vibY, vibZ, rpm, temperature, note };
    const savedEntry = window.maintenanceStorage.addLog(payload);

    // Audio & Visual Alert feedback
    if (savedEntry.status === 'DANGER') {
      window.soundEngine.playDangerAlarm();
      this.showToast('🚨 CRITICAL FAULT REGISTERED!', savedEntry.note, 'danger');
    } else if (savedEntry.status === 'WARNING') {
      window.soundEngine.playWarning();
      this.showToast('⚠️ WARNING REGISTERED', savedEntry.note, 'warning');
    } else {
      window.soundEngine.playSuccess();
      this.showToast('✓ SENSOR TELEMETRY SAVED', 'Data logged to historical database successfully.', 'success');
    }

    // Refresh UI components
    this.refreshAlertBanner();
    this.renderLogsTable();
    this.updateStatsCards();
    if (window.telemetryChartManager) {
      window.telemetryChartManager.updateData();
    }

    // Show action prompt
    const postSubmitCard = document.getElementById('post-submit-action');
    if (postSubmitCard) {
      postSubmitCard.classList.remove('hidden');
    }
  }

  /* ----------------- Quick Presets ----------------- */
  setupPresets() {
    const setValues = (cur, vx, vy, vz, rpm, temp, note) => {
      document.getElementById('input-current').value = cur;
      document.getElementById('input-vib-x').value = vx;
      document.getElementById('input-vib-y').value = vy;
      document.getElementById('input-vib-z').value = vz;
      document.getElementById('input-rpm').value = rpm;
      document.getElementById('input-temp').value = temp;
      document.getElementById('input-note').value = note;

      ['input-current', 'input-vib-x', 'input-vib-y', 'input-vib-z', 'input-rpm', 'input-temp'].forEach(id => {
        this.liveEvaluateInput(id, document.getElementById(id).value);
      });
      window.soundEngine.playClick();
    };

    document.getElementById('preset-normal')?.addEventListener('click', () => {
      setValues(14.2, 1.9, 2.1, 1.8, 1800, 48.5, 'Normal baseline operating cycle');
    });

    document.getElementById('preset-vibration')?.addEventListener('click', () => {
      setValues(21.5, 4.2, 3.8, 8.4, 3400, 62.0, 'Abnormal Vibration Detected on Axis Z');
    });

    document.getElementById('preset-overheat')?.addEventListener('click', () => {
      setValues(33.0, 5.8, 6.2, 5.1, 4400, 94.5, 'Critical thermal breakdown & current spike');
    });

    document.getElementById('preset-random')?.addEventListener('click', () => {
      const cur = (10 + Math.random() * 22).toFixed(1);
      const vx = (1 + Math.random() * 6).toFixed(1);
      const vy = (1 + Math.random() * 6).toFixed(1);
      const vz = (1 + Math.random() * 7).toFixed(1);
      const rpm = Math.floor(1200 + Math.random() * 3200);
      const temp = (35 + Math.random() * 55).toFixed(1);
      setValues(cur, vx, vy, vz, rpm, temp, 'Automated sensory cycle measurement');
    });
  }

  /* ----------------- Table & Analytics ----------------- */
  setupLogsTable() {
    // Filter pills
    document.querySelectorAll('[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('bg-cyan-500/20', 'text-[#00F0FF]', 'border-[#00F0FF]'));
        btn.classList.add('bg-cyan-500/20', 'text-[#00F0FF]', 'border-[#00F0FF]');
        this.currentFilter = btn.getAttribute('data-filter');
        this.renderLogsTable();
        window.soundEngine.playClick();
      });
    });

    // Reset dataset
    document.getElementById('btn-reset-demo')?.addEventListener('click', () => {
      if (confirm('Restore baseline demonstration dataset?')) {
        window.maintenanceStorage.resetDefaultLogs();
        this.refreshAlertBanner();
        this.renderLogsTable();
        this.updateStatsCards();
        if (window.telemetryChartManager) {
          window.telemetryChartManager.updateData();
        }
        this.showToast('INFO', 'Demonstration dataset restored', 'info');
      }
    });

    // Export CSV
    document.getElementById('btn-export-csv')?.addEventListener('click', () => {
      this.exportLogsToCSV();
    });
  }

  renderLogsTable() {
    const tbody = document.getElementById('historical-logs-body');
    if (!tbody) return;

    let logs = window.maintenanceStorage.getLogs();

    if (this.currentFilter !== 'ALL') {
      logs = logs.filter(l => l.status === this.currentFilter);
    }

    if (logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-slate-500 font-mono">No telemetry records matching filter criteria.</td></tr>`;
      return;
    }

    tbody.innerHTML = logs.map(l => {
      let badgeClass = 'badge-normal';
      let rowClass = '';
      if (l.status === 'DANGER') {
        badgeClass = 'badge-danger';
        rowClass = 'danger-row';
      } else if (l.status === 'WARNING') {
        badgeClass = 'badge-warning';
        rowClass = 'warning-row';
      }

      return `
        <tr class="${rowClass}">
          <td class="font-mono text-xs text-slate-400 whitespace-nowrap">
            ${l.timestamp}
          </td>
          <td>
            <span class="badge-status ${badgeClass}">${l.status}</span>
          </td>
          <td class="font-mono text-cyan-300 font-semibold">${l.temperature.toFixed(1)}°C</td>
          <td class="font-mono text-slate-200">${l.rpm} RPM</td>
          <td class="font-mono text-slate-300">
            <span title="X: ${l.vibX}, Y: ${l.vibY}, Z: ${l.vibZ}">
              X:${l.vibX} | Y:${l.vibY} | <strong class="${l.vibZ > 6.5 ? 'text-red-400 font-bold' : ''}">Z:${l.vibZ}</strong>
            </span>
          </td>
          <td class="font-mono text-amber-300">${l.current.toFixed(1)} A</td>
          <td class="text-right">
            <button onclick="window.appController.deleteEntry('${l.id}')" class="text-slate-500 hover:text-red-400 transition-colors p-1" title="Delete record">
              <svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  deleteEntry(id) {
    window.maintenanceStorage.deleteLog(id);
    this.refreshAlertBanner();
    this.renderLogsTable();
    this.updateStatsCards();
    if (window.telemetryChartManager) {
      window.telemetryChartManager.updateData();
    }
    this.showToast('RECORD DELETED', `Record ${id} removed.`, 'info');
  }

  updateStatsCards() {
    const logs = window.maintenanceStorage.getLogs();
    const countTotal = document.getElementById('stat-total-logs');
    const countDanger = document.getElementById('stat-danger-count');
    const meanTemp = document.getElementById('stat-avg-temp');

    if (countTotal) countTotal.textContent = logs.length;
    if (countDanger) {
      const dangerCount = logs.filter(l => l.status === 'DANGER').length;
      countDanger.textContent = dangerCount;
      if (dangerCount > 0) {
        countDanger.className = 'font-mono text-3xl font-bold text-red-400';
      } else {
        countDanger.className = 'font-mono text-3xl font-bold text-emerald-400';
      }
    }
    if (meanTemp && logs.length > 0) {
      const avg = logs.reduce((sum, l) => sum + l.temperature, 0) / logs.length;
      meanTemp.textContent = avg.toFixed(1) + '°C';
    }
  }

  exportLogsToCSV() {
    const logs = window.maintenanceStorage.getLogs();
    const headers = ['ID', 'Timestamp', 'Status', 'Temperature_C', 'RPM', 'Vib_X', 'Vib_Y', 'Vib_Z', 'Current_A', 'Note'];
    const rows = logs.map(l => [
      l.id,
      `"${l.timestamp}"`,
      l.status,
      l.temperature,
      l.rpm,
      l.vibX,
      l.vibY,
      l.vibZ,
      l.current,
      `"${l.note || ''}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `predictive_maintenance_telemetry_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    this.showToast('EXPORT COMPLETE', 'CSV downloaded successfully.', 'success');
  }

  /* ----------------- Toast Alerts ----------------- */
  showToast(title, message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    let borderColor = '#00F0FF';
    let icon = 'ℹ️';

    if (type === 'danger') {
      borderColor = '#EF4444';
      icon = '🚨';
    } else if (type === 'warning') {
      borderColor = '#F59E0B';
      icon = '⚠️';
    } else if (type === 'success') {
      borderColor = '#10B981';
      icon = '✓';
    }

    toast.className = 'cyber-toast';
    toast.style.borderColor = borderColor;
    toast.innerHTML = `
      <div class="text-xl">${icon}</div>
      <div class="flex-1">
        <div class="font-display font-bold text-sm text-slate-100 uppercase tracking-wider">${title}</div>
        <div class="font-mono text-xs text-slate-400 mt-0.5">${message}</div>
      </div>
      <button class="text-slate-500 hover:text-white" onclick="this.parentElement.remove()">✕</button>
    `;

    container.appendChild(toast);
    setTimeout(() => {
      if (toast.parentElement) {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.4s';
        setTimeout(() => toast.remove(), 400);
      }
    }, 4500);
  }

  /* ----------------- Audio Toggle ----------------- */
  setupAudioToggle() {
    const audioBtn = document.getElementById('btn-audio-toggle');
    const audioLabel = document.getElementById('audio-status-label');
    if (!audioBtn) return;

    const updateLabel = () => {
      const isMuted = window.soundEngine.isMuted();
      if (audioLabel) {
        audioLabel.textContent = isMuted ? 'AUDIO: OFF' : 'AUDIO: ON';
      }
      audioBtn.setAttribute('title', isMuted ? 'Unmute UI Audio' : 'Mute UI Audio');
    };

    updateLabel();

    audioBtn.addEventListener('click', () => {
      window.soundEngine.toggleMute();
      updateLabel();
      if (!window.soundEngine.isMuted()) {
        window.soundEngine.playClick();
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.appController = new AppController();
});
