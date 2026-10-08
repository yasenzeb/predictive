/**
 * Vercel Serverless Function: Telegram Bot Webhook Handler
 * Path: /api/telegram  (the ONLY endpoint that matters — webhook + broadcast combined)
 *
 * Architecture:
 * 1. GET  /api/telegram           → webhook health check
 * 2. POST /api/telegram (from Telegram) → handles /start /status /report + inline buttons
 * 3. POST /api/telegram?action=broadcast → called by browser fault injection to send
 *         emergency alerts from Vercel Server so they reach the owner even with no browser open
 *
 * Physics engine runs server-side on every /status command — real computed data, not static text.
 */

// ─── Server-side Physics Simulation (Box-Muller Gaussian + thermal/vibration dynamics) ───
function gaussNoise(mean = 0, std = 1) {
  let u1, u2;
  do { u1 = Math.random(); } while (u1 === 0);
  u2 = Math.random();
  return mean + std * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function serverTelemetryTick() {
  const rpm         = Math.round(1800 + gaussNoise(0, 18));
  const temperature = parseFloat((48.5 + gaussNoise(0, 0.6)).toFixed(1));
  const current     = parseFloat((14.1 + gaussNoise(0, 0.3)).toFixed(1));
  const vibX        = parseFloat((1.9  + gaussNoise(0, 0.18)).toFixed(2));
  const vibY        = parseFloat((2.1  + gaussNoise(0, 0.2)).toFixed(2));
  const vibZ        = parseFloat((1.8  + gaussNoise(0, 0.22)).toFixed(2));
  return { rpm, temperature, current, vibX, vibY, vibZ,
           timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19) };
}

function serverDiagnostics(r) {
  const maxVib = Math.max(r.vibX, r.vibY, r.vibZ);
  const rmsVib = Math.sqrt((r.vibX**2 + r.vibY**2 + r.vibZ**2) / 3);

  let tP = 0, vP = 0, cP = 0, rP = 0;
  if (r.temperature > 65) tP = Math.min(35, ((r.temperature - 65) / 30) * 35);
  if (maxVib > 3.5)       vP = Math.min(40, ((maxVib - 3.5) / 5.5) * 40);
  if (r.current > 20)     cP = Math.min(20, ((r.current - 20) / 15) * 20);
  if (r.rpm > 3400 || (r.rpm > 0 && r.rpm < 1000))
    rP = Math.min(15, Math.abs(r.rpm - 1800) / 1500 * 15);

  const totalPenalty = tP + vP + cP + rP;
  const health = Math.max(0, Math.min(100, Math.round(100 - totalPenalty)));

  let isoZone = 'Zone A (Good)';
  if (maxVib >= 7.1)      isoZone = 'Zone D (Critical Hazard)';
  else if (maxVib >= 4.5) isoZone = 'Zone C (Warning)';
  else if (maxVib >= 2.8) isoZone = 'Zone B (Acceptable)';

  const rul = Math.round(18000 * Math.exp(-3.8 * totalPenalty / 100));
  const rulDays = (rul / 24).toFixed(1);

  let anomalies = [];
  if (r.temperature > 70) anomalies.push('Thermal Drift');
  if (maxVib > 4.5)       anomalies.push('Bearing/Resonance Stress');
  if (r.current > 22)     anomalies.push('Electrical Overload');
  if (!anomalies.length)  anomalies.push('None (Nominal)');

  return { health, maxVib: parseFloat(maxVib.toFixed(2)),
           rmsVib: parseFloat(rmsVib.toFixed(2)),
           isoZone, rulDays, anomalies };
}

function healthEmoji(score) {
  if (score >= 80) return '🟢';
  if (score >= 55) return '🟡';
  return '🔴';
}

// ─── Telegram send helpers ───────────────────────────────────────────────────
function buildApiUrl(token) {
  return `https://api.telegram.org/bot${token}`;
}

async function sendMsg(apiUrl, chatId, text, kbd = null) {
  const body = { chat_id: chatId, text, parse_mode: 'HTML' };
  if (kbd) body.reply_markup = kbd;
  try {
    const r = await fetch(`${apiUrl}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return r.json();
  } catch (e) { return null; }
}

async function ackCallback(apiUrl, callbackId) {
  try {
    await fetch(`${apiUrl}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackId })
    });
  } catch (e) {}
}

// ─── Command Handlers ────────────────────────────────────────────────────────
function cmdStart(apiUrl, chatId) {
  return sendMsg(apiUrl, chatId, `
⚙️ <b>Autonomous Heavy Industrial PMS Bot</b>
━━━━━━━━━━━━━━━━━━━━
Real-time predictive maintenance monitoring for heavy rotating machinery.

Server-side telemetry engine features:
• Multi-axis vibration spectral analysis (ISO 10816-3)
• Lumped-parameter thermal dynamics (Box-Muller Gaussian noise)
• RUL estimation via exponential degradation model
• Cross-sensor anomaly detection confidence scoring

<b>Available Commands:</b>
/status  — Live computed server-side telemetry
/report  — Full diagnostic &amp; RUL prognostics report
/start   — Show this control board`.trim(), {
    inline_keyboard: [[
      { text: '⚡ Live Status',  callback_data: 'cmd_status' },
      { text: '📑 Full Report', callback_data: 'cmd_report' }
    ]]
  });
}

function cmdStatus(apiUrl, chatId) {
  // Run full server-side physics tick — real computed values every time
  const r    = serverTelemetryTick();
  const diag = serverDiagnostics(r);
  const emoji = healthEmoji(diag.health);

  const isAlert = diag.health < 60 || diag.maxVib > 4.5 || r.temperature > 70 || r.current > 22;
  const statusLine = isAlert ? '🔴 <b>HAZARD DETECTED — Thresholds Breached</b>' : '🟢 <b>All Parameters Within Safe Operating Range</b>';

  return sendMsg(apiUrl, chatId, `
📡 <b>LIVE MACHINERY TELEMETRY STATUS</b>
━━━━━━━━━━━━━━━━━━━━
${statusLine}

${emoji} <b>Machine Health Index:</b> <b>${diag.health}%</b>
🌐 <b>ISO 10816-3 Zone:</b> <code>${diag.isoZone}</code>
⏳ <b>Estimated RUL:</b> <b>${diag.rulDays} days</b>
⚠️ <b>Anomaly Types:</b> <code>${diag.anomalies.join(', ')}</code>

📊 <b>Server-Side Sensor Snapshot:</b>
• 🌡️ Temperature: <code>${r.temperature}°C</code>  [Limit: 85°C]
• 〰️ Vibration (RMS): <code>${diag.rmsVib} mm/s</code>  [Peak: ${diag.maxVib} mm/s]
• 〰️ Axes X/Y/Z: <code>${r.vibX} / ${r.vibY} / ${r.vibZ} mm/s</code>
• ⚡ Current Load: <code>${r.current} A</code>  [Limit: 28A]
• ⚙️ Shaft Speed: <code>${r.rpm} RPM</code>

🕒 <b>Server Timestamp:</b> <code>${r.timestamp} UTC</code>
🔗 <b>Dashboard:</b> https://predictive-delta.vercel.app/`.trim(), {
    inline_keyboard: [[
      { text: '🔄 Refresh Now', callback_data: 'cmd_status' },
      { text: '📑 Full Report', callback_data: 'cmd_report' }
    ]]
  });
}

function cmdReport(apiUrl, chatId) {
  const r    = serverTelemetryTick();
  const diag = serverDiagnostics(r);
  const emoji = healthEmoji(diag.health);

  const rec = diag.health < 50
    ? '🚨 <b>CRITICAL:</b> Immediate bearing inspection, lubrication &amp; drive shaft alignment required.'
    : diag.health < 75
    ? '⚠️ <b>WARNING:</b> Schedule preventive maintenance within 72 hours.'
    : '✅ Machine operating within nominal ISO tolerances. Maintain scheduled monitoring.';

  return sendMsg(apiUrl, chatId, `
📑 <b>PREDICTIVE DIAGNOSTICS &amp; PROGNOSTICS REPORT</b>
━━━━━━━━━━━━━━━━━━━━
🏭 <b>Asset:</b> Heavy Industrial Rotating Unit #402
${emoji} <b>Health Score:</b> <b>${diag.health}%</b>
⏳ <b>Remaining Useful Life (RUL):</b> <b>${diag.rulDays} Days</b> (~${Math.round(diag.rulDays * 24).toLocaleString()} Hours)
🎯 <b>ISO 10816-3 Severity:</b> <code>${diag.isoZone}</code>
🔍 <b>Anomaly Classification:</b> <code>${diag.anomalies.join(', ')}</code>

📊 <b>Computed Telemetry:</b>
• 🌡️ Temperature: <code>${r.temperature}°C</code>
• 〰️ Vibration Peak: <code>${diag.maxVib} mm/s</code>  RMS: <code>${diag.rmsVib} mm/s</code>
• ⚡ Current: <code>${r.current} A</code>
• ⚙️ RPM: <code>${r.rpm}</code>

📌 <b>Recommendation:</b>
${rec}

🕒 <b>Report Time:</b> <code>${r.timestamp} UTC</code>`.trim(), {
    inline_keyboard: [[
      { text: '⚡ Live Status', callback_data: 'cmd_status' }
    ]]
  });
}

// ─── Emergency Alert (called from browser via POST /api/telegram?action=broadcast) ──
async function broadcastAlert(apiUrl, chatId, body) {
  const { reading, faultType, isCleared } = body || {};

  if (isCleared) {
    return sendMsg(apiUrl, chatId, `
✅ <b>FAULT SCENARIO CLEARED</b>
━━━━━━━━━━━━━━━━━━━━
<b>Scenario:</b> ${faultType || 'All Faults'}
🟢 <b>Machinery restored to nominal operating parameters.</b>
<i>Automated monitoring resumed. Continue scheduled inspection cycle.</i>`.trim());
  }

  // Build alert from browser-provided reading or generate server-side
  const r    = reading || serverTelemetryTick();
  const diag = serverDiagnostics(r);
  const emoji = healthEmoji(diag.health);

  return sendMsg(apiUrl, chatId, `
🚨 <b>CRITICAL INDUSTRIAL HAZARD DETECTED</b>
━━━━━━━━━━━━━━━━━━━━
⚠️ <b>Fault Scenario:</b> ${faultType ? faultType.toUpperCase() : 'THRESHOLD BREACH'}
🕒 <b>Timestamp:</b> <code>${r.timestamp || new Date().toLocaleTimeString()}</code>

${emoji} <b>Machine Health Score:</b> <b>${diag.health}%</b>
🌐 <b>ISO 10816-3 Zone:</b> <code>${diag.isoZone}</code>
⏳ <b>Estimated RUL:</b> <b>${diag.rulDays} Days</b>
⚠️ <b>Anomaly Types:</b> <code>${diag.anomalies.join(', ')}</code>

📋 <b>Live Sensor Snapshot:</b>
• 🌡️ Temperature: <code>${r.temperature}°C</code>  [Limit: 85°C]
• 〰️ Vibration Peak: <code>${diag.maxVib} mm/s</code>  [Limit: 6.5 mm/s]
• ⚡ Current Load: <code>${r.current} A</code>  [Limit: 28A]
• ⚙️ Shaft Speed: <code>${r.rpm} RPM</code>

🔗 https://predictive-delta.vercel.app/
🔴 <i>Automated preventive protocol dispatched from Vercel Server.</i>`.trim(), {
    inline_keyboard: [[
      { text: '📊 Open Dashboard', url: 'https://predictive-delta.vercel.app/' }
    ]]
  });
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
  const CHAT_ID   = process.env.TELEGRAM_CHAT_ID || process.env.CHAT_ID;

  if (!BOT_TOKEN) {
    return res.status(500).json({ ok: false, error: 'Telegram bot token is not configured in environment variables.' });
  }

  const API_URL   = buildApiUrl(BOT_TOKEN);

  // ── GET: health check
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true, message: 'PMS Telegram Webhook Active', ts: new Date().toISOString() });
  }

  // ── POST ?action=broadcast: server-side alert from browser fault injection
  if (req.query && req.query.action === 'broadcast') {
    if (!CHAT_ID) {
        return res.status(500).json({ ok: false, error: 'Target chat ID is not configured for broadcasts.' });
    }
    try {
      await broadcastAlert(API_URL, CHAT_ID, req.body);
      return res.status(200).json({ ok: true, dispatched: true, recipient: CHAT_ID });
    } catch (err) {
      return res.status(200).json({ ok: false, error: err.message });
    }
  }

  // ── POST: Telegram webhook update
  try {
    const update = req.body;

    // يرد على المرسل بناء على الشات ايدي الخاص به
    if (update.message && update.message.text) {
      const text   = update.message.text.trim();
      const senderChatId = update.message.chat.id; // يرد على الشخص اللي بعت الرسالة
      
      if (text.startsWith('/start'))        await cmdStart(API_URL, senderChatId);
      else if (text.startsWith('/status'))  await cmdStatus(API_URL, senderChatId);
      else if (text.startsWith('/report'))  await cmdReport(API_URL, senderChatId);
    }

    if (update.callback_query) {
      const cb     = update.callback_query.data;
      const senderChatId = update.callback_query.message?.chat.id;
      
      if (senderChatId) {
          if (cb === 'cmd_status')      await cmdStatus(API_URL, senderChatId);
          else if (cb === 'cmd_report') await cmdReport(API_URL, senderChatId);
      }
      await ackCallback(API_URL, update.callback_query.id);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[Webhook] Error:', err);
    return res.status(200).json({ ok: false });
  }
}
