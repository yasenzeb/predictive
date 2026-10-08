/**
 * Predictive Maintenance System - Data Storage & State Engine
 */

const STORAGE_KEYS = {
  LOGS: 'pms_historical_logs',
  ALERT: 'pms_current_alert',
  SETTINGS: 'pms_system_settings'
};

const DEFAULT_THRESHOLDS = {
  current: { normalMax: 20, warningMax: 28 }, // Amperes
  vibration: { normalMax: 3.5, warningMax: 6.5 }, // mm/s for X, Y, Z
  rpm: { normalMin: 1200, normalMax: 3200, warningMax: 4200, warningMin: 800 }, // RPM
  temperature: { normalMax: 65, warningMax: 85 } // °C
};

// Initial Seed Historical Data for Page 3 analytics
const INITIAL_HISTORICAL_LOGS = [
  {
    id: 'log-101',
    timestamp: '2026-10-05 08:00:00',
    current: 12.4,
    vibX: 1.8,
    vibY: 2.1,
    vibZ: 1.9,
    rpm: 1750,
    temperature: 42.5,
    status: 'NORMAL',
    note: 'Baseline morning cycle'
  },
  {
    id: 'log-102',
    timestamp: '2026-10-05 10:15:00',
    current: 14.1,
    vibX: 2.2,
    vibY: 2.4,
    vibZ: 2.0,
    rpm: 1800,
    temperature: 48.0,
    status: 'NORMAL',
    note: 'Standard production load'
  },
  {
    id: 'log-103',
    timestamp: '2026-10-05 12:30:00',
    current: 22.8,
    vibX: 3.8,
    vibY: 4.1,
    vibZ: 3.6,
    rpm: 2850,
    temperature: 68.4,
    status: 'WARNING',
    note: 'Elevated thermal load detected'
  },
  {
    id: 'log-104',
    timestamp: '2026-10-05 14:45:00',
    current: 18.5,
    vibX: 2.7,
    vibY: 2.9,
    vibZ: 2.6,
    rpm: 2100,
    temperature: 55.2,
    status: 'NORMAL',
    note: 'Cooling cycle active'
  },
  {
    id: 'log-105',
    timestamp: '2026-10-05 16:00:00',
    current: 31.4,
    vibX: 7.8,
    vibY: 6.9,
    vibZ: 8.2,
    rpm: 4450,
    temperature: 92.1,
    status: 'DANGER',
    note: 'Severe resonance & thermal overload'
  },
  {
    id: 'log-106',
    timestamp: '2026-10-05 17:30:00',
    current: 15.0,
    vibX: 2.1,
    vibY: 2.3,
    vibZ: 2.2,
    rpm: 1800,
    temperature: 51.0,
    status: 'NORMAL',
    note: 'Post-intervention stabilization'
  }
];

class MaintenanceStorage {
  constructor() {
    this.init();
  }

  init() {
    if (!localStorage.getItem(STORAGE_KEYS.LOGS)) {
      localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(INITIAL_HISTORICAL_LOGS));
    }
  }

  getLogs() {
    try {
      const logs = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOGS));
      return Array.isArray(logs) ? logs : INITIAL_HISTORICAL_LOGS;
    } catch (e) {
      return INITIAL_HISTORICAL_LOGS;
    }
  }

  saveLogs(logs) {
    localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(logs));
  }

  addLog(entry) {
    const logs = this.getLogs();
    const newEntry = {
      id: 'log-' + Date.now(),
      timestamp: entry.timestamp || new Date().toISOString().replace('T', ' ').substring(0, 19),
      current: parseFloat(entry.current),
      vibX: parseFloat(entry.vibX),
      vibY: parseFloat(entry.vibY),
      vibZ: parseFloat(entry.vibZ),
      rpm: parseFloat(entry.rpm),
      temperature: parseFloat(entry.temperature),
      status: entry.status || this.evaluateStatus(entry).level,
      note: entry.note || this.evaluateStatus(entry).reason
    };
    logs.unshift(newEntry);
    this.saveLogs(logs);

    // Update alert status based on this latest entry
    this.updateActiveAlert(newEntry);
    return newEntry;
  }

  deleteLog(id) {
    const logs = this.getLogs().filter(item => item.id !== id);
    this.saveLogs(logs);
    return logs;
  }

  resetDefaultLogs() {
    localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(INITIAL_HISTORICAL_LOGS));
    this.clearAlert();
    return INITIAL_HISTORICAL_LOGS;
  }

  evaluateStatus(reading) {
    const cur = parseFloat(reading.current) || 0;
    const vx = parseFloat(reading.vibX) || 0;
    const vy = parseFloat(reading.vibY) || 0;
    const vz = parseFloat(reading.vibZ) || 0;
    const rpm = parseFloat(reading.rpm) || 0;
    const temp = parseFloat(reading.temperature) || 0;

    const maxVib = Math.max(vx, vy, vz);
    const criticalReasons = [];
    const warningReasons = [];

    // Critical Checks
    if (maxVib > DEFAULT_THRESHOLDS.vibration.warningMax) {
      criticalReasons.push(`Abnormal Vibration (${maxVib.toFixed(1)} mm/s on Axis ${maxVib === vz ? 'Z' : maxVib === vx ? 'X' : 'Y'})`);
    }
    if (temp > DEFAULT_THRESHOLDS.temperature.warningMax) {
      criticalReasons.push(`Critical Temperature (${temp.toFixed(1)}°C)`);
    }
    if (cur > DEFAULT_THRESHOLDS.current.warningMax) {
      criticalReasons.push(`Current Surge (${cur.toFixed(1)} A)`);
    }
    if (rpm > DEFAULT_THRESHOLDS.rpm.warningMax || (rpm > 0 && rpm < DEFAULT_THRESHOLDS.rpm.warningMin)) {
      criticalReasons.push(`Hazardous RPM (${rpm} RPM)`);
    }

    if (criticalReasons.length > 0) {
      return {
        level: 'DANGER',
        reason: criticalReasons.join(' & ')
      };
    }

    // Warning Checks
    if (maxVib > DEFAULT_THRESHOLDS.vibration.normalMax) {
      warningReasons.push(`Elevated Vibration (${maxVib.toFixed(1)} mm/s)`);
    }
    if (temp > DEFAULT_THRESHOLDS.temperature.normalMax) {
      warningReasons.push(`Elevated Temperature (${temp.toFixed(1)}°C)`);
    }
    if (cur > DEFAULT_THRESHOLDS.current.normalMax) {
      warningReasons.push(`High Current Load (${cur.toFixed(1)} A)`);
    }
    if (rpm > DEFAULT_THRESHOLDS.rpm.normalMax || (rpm > 0 && rpm < DEFAULT_THRESHOLDS.rpm.normalMin)) {
      warningReasons.push(`Irregular RPM (${rpm} RPM)`);
    }

    if (warningReasons.length > 0) {
      return {
        level: 'WARNING',
        reason: warningReasons.join(' & ')
      };
    }

    return {
      level: 'NORMAL',
      reason: 'All sensory metrics within nominal tolerances'
    };
  }

  updateActiveAlert(reading) {
    const evaluation = this.evaluateStatus(reading);
    if (evaluation.level !== 'NORMAL') {
      const alertData = {
        level: evaluation.level,
        message: `${evaluation.level === 'DANGER' ? 'CRITICAL ALERT' : 'SYSTEM WARNING'}: ${evaluation.reason}`,
        timestamp: new Date().toLocaleTimeString(),
        source: reading
      };
      localStorage.setItem(STORAGE_KEYS.ALERT, JSON.stringify(alertData));
      return alertData;
    } else {
      // Normal reading
      const normalData = {
        level: 'NORMAL',
        message: 'SYSTEM NOMINAL: All Machinery Telemetry Within Safe Operational Limits',
        timestamp: new Date().toLocaleTimeString()
      };
      localStorage.setItem(STORAGE_KEYS.ALERT, JSON.stringify(normalData));
      return normalData;
    }
  }

  getActiveAlert() {
    try {
      const alert = JSON.parse(localStorage.getItem(STORAGE_KEYS.ALERT));
      if (alert) return alert;
    } catch (e) {}

    // Default to the status of latest log entry
    const logs = this.getLogs();
    if (logs.length > 0) {
      return this.updateActiveAlert(logs[0]);
    }
    return {
      level: 'NORMAL',
      message: 'SYSTEM NOMINAL: All Machinery Telemetry Within Safe Operational Limits',
      timestamp: new Date().toLocaleTimeString()
    };
  }

  clearAlert() {
    const normalData = {
      level: 'NORMAL',
      message: 'SYSTEM NOMINAL: All Machinery Telemetry Within Safe Operational Limits',
      timestamp: new Date().toLocaleTimeString()
    };
    localStorage.setItem(STORAGE_KEYS.ALERT, JSON.stringify(normalData));
    return normalData;
  }
}

window.maintenanceStorage = new MaintenanceStorage();
