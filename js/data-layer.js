/**
 * Hardware-in-the-Loop (HIL) Plug-and-Play Data Layer & Hardware Abstraction Layer (HAL)
 * Allows seamless switching between:
 *  - 'SIMULATOR': High-fidelity physics-based simulation
 *  - 'DATABASE': Supabase / PostgreSQL REST API ingestion
 *  - 'HARDWARE_MQTT_HTTP': Real ESP32/Raspberry Pi IoT telemetry stream
 */

const DATA_SOURCES = {
  SIMULATOR: 'SIMULATOR',
  DATABASE: 'DATABASE',
  HARDWARE: 'HARDWARE'
};

class DataIngestionLayer {
  constructor() {
    // Read environment mode from localStorage or query param or default to SIMULATOR
    const savedSource = localStorage.getItem('PMS_DATA_SOURCE');
    const urlParams = new URLSearchParams(window.location.search);
    const paramSource = urlParams.get('source');

    this.activeSource = paramSource || savedSource || DATA_SOURCES.SIMULATOR;

    // Database / Backend config (Plug-and-play ready for Supabase or custom REST)
    this.dbConfig = {
      endpoint: localStorage.getItem('PMS_API_ENDPOINT') || 'https://api.supabase.co/rest/v1/telemetry',
      apiKey: localStorage.getItem('PMS_API_KEY') || '',
      pollIntervalMs: 2000
    };

    this.listeners = [];
    this.pollTimer = null;
    this.init();
  }

  init() {
    console.log(`[PMS HAL] Data layer initialized. Active Source: ${this.activeSource}`);

    if (this.activeSource === DATA_SOURCES.SIMULATOR) {
      if (window.physicsSimulator) {
        window.physicsSimulator.subscribe(data => this.handleIncomingData(data, DATA_SOURCES.SIMULATOR));
        window.physicsSimulator.start(1500);
      }
    } else if (this.activeSource === DATA_SOURCES.DATABASE || this.activeSource === DATA_SOURCES.HARDWARE) {
      this.startRemotePolling();
    }
  }

  setDataSource(source) {
    if (!DATA_SOURCES[source]) return;
    this.activeSource = source;
    localStorage.setItem('PMS_DATA_SOURCE', source);

    if (source === DATA_SOURCES.SIMULATOR) {
      this.stopRemotePolling();
      if (window.physicsSimulator) {
        window.physicsSimulator.start(1500);
      }
    } else {
      if (window.physicsSimulator) {
        window.physicsSimulator.stop();
      }
      this.startRemotePolling();
    }

    console.log(`[PMS HAL] Switched data source to: ${source}`);
    this.notifySourceChange(source);
  }

  setDatabaseConfig(endpoint, apiKey) {
    this.dbConfig.endpoint = endpoint;
    this.dbConfig.apiKey = apiKey;
    localStorage.setItem('PMS_API_ENDPOINT', endpoint);
    localStorage.setItem('PMS_API_KEY', apiKey);
  }

  handleIncomingData(reading, sourceTag) {
    reading.sourceTag = sourceTag || this.activeSource;

    // Run diagnostics
    const diag = window.predictiveDiagnostics ? window.predictiveDiagnostics.analyze(reading) : null;
    reading.diagnostics = diag;

    // Notify all active application subscribers
    this.listeners.forEach(fn => {
      try { fn(reading); } catch (e) { console.error('Data layer listener error:', e); }
    });
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  subscribeSourceChange(listener) {
    if (!this.sourceChangeListeners) this.sourceChangeListeners = [];
    this.sourceChangeListeners.push(listener);
  }

  notifySourceChange(source) {
    if (this.sourceChangeListeners) {
      this.sourceChangeListeners.forEach(fn => fn(source));
    }
  }

  startRemotePolling() {
    this.stopRemotePolling();
    this.pollTimer = setInterval(async () => {
      try {
        if (!this.dbConfig.endpoint) return;
        const headers = { 'Content-Type': 'application/json' };
        if (this.dbConfig.apiKey) headers['apikey'] = this.dbConfig.apiKey;

        const response = await fetch(this.dbConfig.endpoint + '?order=timestamp.desc&limit=1', { headers });
        if (response.ok) {
          const records = await response.json();
          if (Array.isArray(records) && records.length > 0) {
            this.handleIncomingData(records[0], this.activeSource);
          }
        }
      } catch (err) {
        // Fallback gracefully without breaking UI
        console.warn('[PMS HAL] Remote ingestion endpoint offline, awaiting hardware...', err.message);
      }
    }, this.dbConfig.pollIntervalMs);
  }

  stopRemotePolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}

window.DataIngestionLayer = DataIngestionLayer;
window.dataIngestionLayer = new DataIngestionLayer();
