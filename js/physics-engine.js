/**
 * Realistic Physics-Based Industrial Machinery Simulation Engine
 * Hardware-in-the-Loop (HIL) & Edge Diagnostics Architecture
 *
 * Implements:
 * 1. Lumped-parameter Thermal Dynamics: dT/dt = (P_loss - k_cool*(T - T_amb)) / C_thermal
 * 2. Multi-axis Mechanical Vibration Dynamics with Bearing Harmonic Peaks:
 *    RMS Vibration = sqrt(vib_baseline^2 + (load*wear)^2 + harmonic_resonances)
 * 3. Electromagnetic Current & Torque Loading: I = (Torque_load / (k_t * phi)) + I_magnetizing
 * 4. Box-Muller Gaussian Noise Injection for authentic sensor telemetry
 * 5. Mechanical Degradation & Thermal Drift Models
 */

class PhysicsSimulationEngine {
  constructor() {
    // Environmental Constants
    this.ambientTemp = 24.5; // °C
    this.thermalCapacitance = 420.0; // J/°C thermal mass of stator/bearing casing
    this.coolingCoefficient = 3.6; // W/°C passive & forced air dissipation rate
    this.motorEfficiency = 0.91; // Electrical to mechanical efficiency

    // Dynamic State Variables
    this.state = {
      rpm: 1780.0,
      targetRpm: 1800.0,
      loadFactor: 0.72, // 0.0 (idle) to 1.5 (heavy overload)
      temperature: 46.2,
      bearingWear: 0.08, // Degradation index: 0.0 (brand new) to 1.0 (imminent seizure)
      vibX: 1.85,
      vibY: 2.10,
      vibZ: 1.75,
      current: 13.8,
      timestamp: Date.now()
    };

    // Active Fault Injections
    this.activeFaults = {
      thermalOverheat: false,
      vibrationAnomaly: false, // Bearing defect (inner/outer race degradation)
      overspeedOverload: false,
      sensorNoiseMultiplier: 1.0
    };

    // Listeners for telemetry streaming
    this.listeners = [];
    this.isRunning = false;
    this.timer = null;
    this.stepIntervalMs = 1000; // 1-second telemetry ticks
  }

  // Gaussian noise using Box-Muller transform
  gaussianNoise(mean = 0, stdDev = 1) {
    let u1 = Math.random();
    let u2 = Math.random();
    while (u1 === 0) u1 = Math.random(); // avoid log(0)
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return mean + z0 * stdDev;
  }

  // Inject or clear fault scenarios
  setFault(faultKey, state = true) {
    if (this.activeFaults.hasOwnProperty(faultKey)) {
      this.activeFaults[faultKey] = state;
    }
  }

  toggleFault(faultKey) {
    if (this.activeFaults.hasOwnProperty(faultKey)) {
      this.activeFaults[faultKey] = !this.activeFaults[faultKey];
      return this.activeFaults[faultKey];
    }
    return false;
  }

  clearAllFaults() {
    this.activeFaults.thermalOverheat = false;
    this.activeFaults.vibrationAnomaly = false;
    this.activeFaults.overspeedOverload = false;
    this.activeFaults.sensorNoiseMultiplier = 1.0;
  }

  // Advance simulation by dt seconds
  step(dt = 1.0) {
    // 1. Shaft Dynamics (RPM)
    let targetRpm = 1800.0;
    if (this.activeFaults.overspeedOverload) {
      targetRpm = 4550.0; // Dangerous overspeed
    }
    // Exponential approach towards target RPM + slight mechanical hunting
    const rpmInertiaAlpha = 0.22;
    this.state.rpm += (targetRpm - this.state.rpm) * rpmInertiaAlpha + this.gaussianNoise(0, 8.5);
    this.state.rpm = Math.max(0, this.state.rpm);

    // 2. Load Factor & Current (Amperes)
    let baseLoad = 0.72;
    if (this.activeFaults.overspeedOverload) {
      baseLoad = 1.45; // Heavy electrical overload
    }
    if (this.activeFaults.vibrationAnomaly) {
      baseLoad += 0.25; // Drag friction from defective bearing
    }
    this.state.loadFactor = baseLoad;

    // Power consumption: base no-load current ~ 5.5A + torque current proportional to load * speed
    const speedRatio = this.state.rpm / 1800.0;
    const nominalCurrent = 14.0 * speedRatio * this.state.loadFactor;
    const currentNoise = this.gaussianNoise(0, 0.25 * this.activeFaults.sensorNoiseMultiplier);
    this.state.current = Math.max(1.0, nominalCurrent + currentNoise);

    // 3. Thermal Dynamics (dT/dt)
    // Thermal losses: I^2 * R + mechanical bearing friction
    const electricalLosses = Math.pow(this.state.current / 14.0, 2) * 28.0; // Watts
    const frictionLosses = (this.state.rpm / 1800.0) * (1.0 + this.state.bearingWear * 3.5) * 15.0;
    let faultHeatInjection = 0;
    if (this.activeFaults.thermalOverheat) {
      faultHeatInjection = 180.0; // Severe cooling failure or phase imbalance
    }

    const totalHeatPower = electricalLosses + frictionLosses + faultHeatInjection;
    const coolingPower = this.coolingCoefficient * (this.state.temperature - this.ambientTemp);
    const dTemp = ((totalHeatPower - coolingPower) / this.thermalCapacitance) * dt * 10.0; // accelerated time scale for responsive UI

    this.state.temperature += dTemp + this.gaussianNoise(0, 0.08);

    // 4. Multi-Axis Vibration Dynamics (mm/s RMS)
    // Base vibration is function of speed squared (unbalance) + bearing health
    const unbalanceForce = Math.pow(this.state.rpm / 1800.0, 1.8);
    let faultVibMultiplier = 1.0;
    let zResonance = 0;

    if (this.activeFaults.vibrationAnomaly) {
      faultVibMultiplier = 3.8; // High amplitude bearing inner race defect
      zResonance = 4.2; // Axial thrust instability
    }
    if (this.activeFaults.overspeedOverload) {
      faultVibMultiplier += 1.2;
    }

    const baseVibX = 1.6 * unbalanceForce * faultVibMultiplier;
    const baseVibY = 1.8 * unbalanceForce * faultVibMultiplier;
    const baseVibZ = 1.4 * unbalanceForce * faultVibMultiplier + zResonance;

    this.state.vibX = Math.max(0.2, baseVibX + this.gaussianNoise(0, 0.18 * this.activeFaults.sensorNoiseMultiplier));
    this.state.vibY = Math.max(0.2, baseVibY + this.gaussianNoise(0, 0.22 * this.activeFaults.sensorNoiseMultiplier));
    this.state.vibZ = Math.max(0.2, baseVibZ + this.gaussianNoise(0, 0.26 * this.activeFaults.sensorNoiseMultiplier));

    // 5. Wear Accumulation
    if (this.state.temperature > 80 || this.state.vibZ > 6.0 || this.state.current > 25) {
      this.state.bearingWear = Math.min(1.0, this.state.bearingWear + 0.001);
    }

    this.state.timestamp = Date.now();

    const snapshot = this.getSnapshot();
    this.notify(snapshot);
    return snapshot;
  }

  getSnapshot() {
    return {
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      current: parseFloat(this.state.current.toFixed(1)),
      vibX: parseFloat(this.state.vibX.toFixed(1)),
      vibY: parseFloat(this.state.vibY.toFixed(1)),
      vibZ: parseFloat(this.state.vibZ.toFixed(1)),
      rpm: Math.round(this.state.rpm),
      temperature: parseFloat(this.state.temperature.toFixed(1)),
      bearingWear: parseFloat(this.state.bearingWear.toFixed(3)),
      activeFaults: { ...this.activeFaults }
    };
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notify(data) {
    this.listeners.forEach(fn => {
      try { fn(data); } catch (e) { console.error('Sim listener error:', e); }
    });
  }

  start(intervalMs = 1500) {
    if (this.isRunning) return;
    this.isRunning = true;
    this.stepIntervalMs = intervalMs;
    this.timer = setInterval(() => {
      this.step(intervalMs / 1000);
    }, this.stepIntervalMs);
  }

  stop() {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  resetToNominal() {
    this.clearAllFaults();
    this.state.rpm = 1800.0;
    this.state.targetRpm = 1800.0;
    this.state.temperature = 48.0;
    this.state.bearingWear = 0.08;
    this.state.current = 14.2;
    this.state.vibX = 1.9;
    this.state.vibY = 2.1;
    this.state.vibZ = 1.8;
    return this.getSnapshot();
  }
}

window.PhysicsSimulationEngine = PhysicsSimulationEngine;
window.physicsSimulator = new PhysicsSimulationEngine();
