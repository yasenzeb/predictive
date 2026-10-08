/**
 * PMS Telegram Bot Integration Engine v2
 * - Smart alert throttling: bypassed when a fault scenario is ACTIVELY INJECTED
 * - Status command always reflects live physics state including active faults
 * - Fault-aware emergency alerts with specific fault type labels
 */

class TelegramBotManager {
  constructor() {
    
    
    this.apiUrl   = `https://api.telegram.org/bot${this.botToken}`;

    this.isPolling        = false;
    this.lastUpdateId     = 0;
    this.pollIntervalMs   = 3000;
    this.pollTimer        = null;

    // Throttle ONLY for automatic hazard alerts, NOT for fault-inject triggered ones
    this.lastAutoAlertTime  = 0;
    this.autoAlertThrottleMs = 15000; // 15 s between auto threshold-breach alerts

    // Track which faults we already sent a telegram for (avoid spam on toggle)
    this.alertedFaults = { thermalOverheat: false, vibrationAnomaly: false, overspeedOverload: false };

    this.init();
  }

  init() {
    console.log('[PMS Telegram] Bot engine ready.');
    this.startLongPolling();
  }

  /* ── Core send ─────────────────────────────────────────────── */
  async sendMessage(text, replyMarkup = null) {
    try {
      const payload = { chat_id: this.chatId, text, parse_mode: 'HTML' };
      if (replyMarkup) payload.reply_markup = replyMarkup;
      const res = await fetch(`${this.apiUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return await res.json();
    } catch (e) {
      console.error('[PMS Telegram] Send error:', e);
      return null;
    }
  }

  /* ── Get current live reading from physics engine ─────────── */
  _getLiveReading() {
    // Priority 1: physics engine real-time snapshot (most current)
    if (window.physicsSimulator) return window.physicsSimulator.getSnapshot();
    // Priority 2: latest stored log
    const logs = window.maintenanceStorage ? window.maintenanceStorage.getLogs() : [];
    return logs[0] || { temperature: 48.2, vibX: 2.1, vibY: 2.3, vibZ: 2.0, current: 14.5, rpm: 1800, status: 'NORMAL' };
  }

  /* ── Get active faults map ─────────────────────────────────── */
  _getActiveFaults() {
    if (window.physicsSimulator) return window.physicsSimulator.activeFaults;
    return { thermalOverheat: false, vibrationAnomaly: false, overspeedOverload: false };
  }

  /* ── Build a readable fault label ─────────────────────────── */
  _faultLabel(faults) {
    const active = [];
    if (faults.thermalOverheat)   active.push('🔥 THERMAL OVERHEAT');
    if (faults.vibrationAnomaly)  active.push('〰️ VIBRATION ANOMALY (Bearing Defect)');
    if (faults.overspeedOverload) active.push('⚡ OVERSPEED & OVERLOAD');
    return active.length ? active.join('\n') : '✅ NONE — Nominal Operation';
  }

  /* ── Status emoji based on score ──────────────────────────── */
  _healthEmoji(score) {
    if (score >= 80) return '🟢';
    if (score >= 50) return '🟡';
    return '🔴';
  }

  /* ── Server Broadcast API invocation ─────────────────────── */
  async _broadcastToServer(reading, faultType, isCleared = false) {
    try {
      // Calls /api/telegram?action=broadcast — the one endpoint confirmed working on Vercel
      await fetch('/api/telegram?action=broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reading, faultType, isCleared })
      });
    } catch (e) {
      /* silently continue if network unavailable */
    }
  }

  /* ── Emergency alert (fault-inject or threshold breach) ───── */
  async sendEmergencyAlert(reading, faultType = 'HAZARD', bypassThrottle = false) {
    const now = Date.now();
    if (!bypassThrottle && (now - this.lastAutoAlertTime < this.autoAlertThrottleMs)) return;
    if (!bypassThrottle) this.lastAutoAlertTime = now;

    // Trigger server-side broadcast so Vercel Server sends to TELEGRAM_CHAT_ID
    this._broadcastToServer(reading, faultType, false);

    const diag        = window.predictiveDiagnostics ? window.predictiveDiagnostics.analyze(reading) : null;
    const healthScore = diag ? diag.healthScore : '—';
    const rulDays     = diag ? diag.rulDays     : '—';
    const conf        = diag ? diag.confidenceScore : '—';
    const isoZone     = diag ? diag.isoZone : '—';
    const faults      = this._getActiveFaults();
    const emoji       = this._healthEmoji(typeof healthScore === 'number' ? healthScore : 0);

    const text = `
🚨 <b>CRITICAL INDUSTRIAL HAZARD DETECTED</b>
━━━━━━━━━━━━━━━━━━━━
⚠️ <b>Active Fault Scenario:</b>
${this._faultLabel(faults)}

🕒 <b>Timestamp:</b> <code>${reading.timestamp || new Date().toLocaleTimeString()}</code>
${emoji} <b>Machine Health Score:</b> <b>${healthScore}%</b>
🎯 <b>Detection Confidence:</b> <b>${conf}%</b>
⏳ <b>Estimated RUL:</b> <b>${rulDays} Days</b>
🌐 <b>ISO 10816-3 Zone:</b> <code>${isoZone}</code>

📋 <b>Live Sensor Snapshot:</b>
• 🌡️ <b>Temperature:</b> <code>${reading.temperature}°C</code>  [Limit: 85°C]
• 〰️ <b>Vibration Peak:</b> <code>${Math.max(reading.vibX||0, reading.vibY||0, reading.vibZ||0).toFixed(1)} mm/s</code>  [Limit: 6.5]
• ⚡ <b>Current Load:</b> <code>${parseFloat(reading.current||0).toFixed(1)} A</code>  [Limit: 28A]
• ⚙️ <b>Shaft Speed:</b> <code>${reading.rpm||0} RPM</code>

🔴 <i>Automated preventive protocol triggered. Immediate inspection recommended.</i>`.trim();

    const kbd = { inline_keyboard: [[
      { text: '📊 Live Status',     callback_data: 'cmd_status' },
      { text: '📑 Full Report',     callback_data: 'cmd_report' }
    ]] };

    return await this.sendMessage(text, kbd);
  }

  /* ── Fault inject notification (always send, no throttle) ─── */
  async sendFaultInjectionNotice(faultKey, isActive) {
    const labels = {
      thermalOverheat:   '🔥 Thermal Overheat — Cooling Breakdown (>90°C)',
      vibrationAnomaly:  '〰️ Vibration Anomaly — Bearing Defect & Resonance',
      overspeedOverload: '⚡ Overspeed & Overload — Kinematic Surge (>4400 RPM)'
    };
    const label = labels[faultKey] || faultKey;

    if (isActive) {
      const reading = this._getLiveReading();
      // Send the emergency alert immediately, bypassing throttle
      await this.sendEmergencyAlert(reading, label, true);
    } else {
      // Broadcast cleared event to server
      this._broadcastToServer(null, label, true);

      // Fault was cleared
      const text = `
✅ <b>FAULT SCENARIO CLEARED</b>
━━━━━━━━━━━━━━━━━━━━
<b>Scenario:</b> ${label}
🟢 <b>Machinery restored to nominal operating parameters.</b>
<i>Telemetry returning to baseline. Continue monitoring.</i>`.trim();
      await this.sendMessage(text);
    }
  }

  /* ── /status handler ───────────────────────────────────────── */
  async handleStatusCommand() {
    const reading = this._getLiveReading();
    const faults  = this._getActiveFaults();
    const diag    = window.predictiveDiagnostics ? window.predictiveDiagnostics.analyze(reading) : null;
    const health  = diag ? diag.healthScore : 95;
    const iso     = diag ? diag.isoZone : 'Zone A (Good)';
    const emoji   = this._healthEmoji(health);

    const anyFaultActive = faults.thermalOverheat || faults.vibrationAnomaly || faults.overspeedOverload;
    const faultLine = anyFaultActive
      ? `\n⚠️ <b>ACTIVE FAULT SCENARIO:</b>\n${this._faultLabel(faults)}\n`
      : '\n✅ <b>No faults active — Nominal Operation</b>\n';

    const statusMsg = `
📡 <b>LIVE MACHINERY TELEMETRY STATUS</b>
━━━━━━━━━━━━━━━━━━━━
${emoji} <b>Health Index:</b> <b>${health}%</b>
🌐 <b>ISO 10816-3 Zone:</b> <code>${iso}</code>
${faultLine}
📊 <b>Sensor Readings:</b>
• 🌡️ <b>Temperature:</b> <code>${parseFloat(reading.temperature||0).toFixed(1)} °C</code>
• 🌀 <b>Shaft Speed:</b> <code>${reading.rpm||0} RPM</code>
• 〰️ <b>Vibration (X/Y/Z):</b> <code>${reading.vibX||0} / ${reading.vibY||0} / ${reading.vibZ||0} mm/s</code>
• ⚡ <b>Current:</b> <code>${parseFloat(reading.current||0).toFixed(1)} A</code>

🕒 <b>Captured:</b> <code>${reading.timestamp || new Date().toLocaleTimeString()}</code>`.trim();

    const kbd = { inline_keyboard: [[
      { text: '🔄 Refresh',         callback_data: 'cmd_status' },
      { text: '📑 Diagnostic Report', callback_data: 'cmd_report' }
    ]] };

    return await this.sendMessage(statusMsg, kbd);
  }

  /* ── /report handler ───────────────────────────────────────── */
  async handleReportCommand() {
    const logs    = window.maintenanceStorage ? window.maintenanceStorage.getLogs() : [];
    const reading = this._getLiveReading();
    const diag    = window.predictiveDiagnostics ? window.predictiveDiagnostics.analyze(reading)
      : { healthScore: 92, rulDays: 720, rulHours: 17280, confidenceScore: 99.4, isoZone: 'Zone A', anomalyTypes: ['None'] };

    const dangerLogs  = logs.filter(l => l.status === 'DANGER').length;
    const warnLogs    = logs.filter(l => l.status === 'WARNING').length;
    const faults      = this._getActiveFaults();
    const emoji       = this._healthEmoji(diag.healthScore);

    const rec = diag.healthScore < 50
      ? '🚨 CRITICAL: Immediate bearing lubrication & drive shaft inspection required.'
      : diag.healthScore < 75
      ? '⚠️ WARNING: Schedule preventive maintenance within next 72 hours.'
      : '✅ Machine operating within nominal ISO tolerances. Continue scheduled monitoring.';

    const reportMsg = `
📑 <b>PREDICTIVE DIAGNOSTICS & PROGNOSTICS REPORT</b>
━━━━━━━━━━━━━━━━━━━━
🏭 <b>Asset:</b> Heavy Industrial Rotating Unit #402
${emoji} <b>Health Score:</b> <b>${diag.healthScore}%</b>
⏳ <b>Remaining Useful Life (RUL):</b> <b>${diag.rulDays} Days</b> (~${(diag.rulHours||0).toLocaleString()} Hours)
🎯 <b>Anomaly Detection Confidence:</b> <b>${diag.confidenceScore}%</b>
🌐 <b>ISO 10816-3 Rating:</b> <code>${diag.isoZone}</code>

⚠️ <b>Active Faults:</b>
${this._faultLabel(faults)}

📋 <b>Session Statistics:</b>
• Total Ingested Cycles: <code>${logs.length}</code>
• DANGER Threshold Breaches: <code>${dangerLogs}</code>
• WARNING Events: <code>${warnLogs}</code>
• Anomaly Types: <code>${(diag.anomalyTypes||['None']).join(', ')}</code>

📌 <b>Recommendation:</b> ${rec}`.trim();

    const kbd = { inline_keyboard: [[
      { text: '⚡ Live Status', callback_data: 'cmd_status' }
    ]] };

    return await this.sendMessage(reportMsg, kbd);
  }

  /* ── /start handler ────────────────────────────────────────── */
  async handleStartCommand() {
    const welcome = `
⚙️ <b>Autonomous Heavy Industrial PMS Bot</b>
━━━━━━━━━━━━━━━━━━━━
Real-time predictive maintenance monitoring for heavy rotating machinery.

Physics-based telemetry simulation with:
• Multi-axis vibration spectral analysis (ISO 10816-3)
• Lumped-parameter thermal dynamics
• RUL estimation via exponential degradation model
• Interactive fault injection testing

<b>Available Commands:</b>
/status  — Live sensor telemetry + active faults
/report  — Full diagnostic & RUL prognostics report
/start   — Show this control board`.trim();

    const kbd = { inline_keyboard: [[
      { text: '⚡ Live Telemetry', callback_data: 'cmd_status' },
      { text: '📑 Full Report',    callback_data: 'cmd_report' }
    ]] };

    return await this.sendMessage(welcome, kbd);
  }

  /* ── Long-polling update handler ───────────────────────────── */
  async pollUpdates() {
    try {
      const url = `${this.apiUrl}/getUpdates?offset=${this.lastUpdateId + 1}&timeout=2`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data.ok) {
        if (data.description && data.description.toLowerCase().includes('webhook')) {
          console.log('[PMS Telegram] Serverless Webhook active on Vercel. Browser polling disabled in favor of webhook.');
          this.stopLongPolling();
          return;
        }
        return;
      }
      if (Array.isArray(data.result)) {
        for (const update of data.result) {
          this.lastUpdateId = update.update_id;
          await this.handleUpdate(update);
        }
      }
    } catch (e) { /* network retry */ }
  }

  async handleUpdate(update) {
    if (update.message && update.message.text) {
      const text = update.message.text.trim();
      if (text.startsWith('/start'))  await this.handleStartCommand();
      else if (text.startsWith('/status')) await this.handleStatusCommand();
      else if (text.startsWith('/report')) await this.handleReportCommand();
    }
    if (update.callback_query) {
      const cb = update.callback_query.data;
      if (cb === 'cmd_status') await this.handleStatusCommand();
      else if (cb === 'cmd_report') await this.handleReportCommand();
      try {
        await fetch(`${this.apiUrl}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callback_query_id: update.callback_query.id })
        });
      } catch (e) {}
    }
  }

  startLongPolling() {
    if (this.isPolling) return;
    this.isPolling = true;
    this.pollTimer = setInterval(() => this.pollUpdates(), this.pollIntervalMs);
  }

  stopLongPolling() {
    this.isPolling = false;
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
  }
}

window.TelegramBotManager = TelegramBotManager;
window.telegramBotManager = new TelegramBotManager();

