/**
 * Vercel Serverless Cron Telemetry & Automated Emergency Alert Engine
 * Path: /api/cron-telemetry
 *
 * Runs background machinery telemetry monitoring server-side on Vercel.
 * Simulates rotating machinery dynamics, computes ISO 10816-3 severity, RUL estimation,
 * and automatically dispatches Telegram Emergency Alerts whenever thresholds are breached!
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || '8664722270:AAE7OJYP7Jwn1rV_B0Ty0oHm6RRi-PQZYy4';
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID || process.env.CHAT_ID || '8984846317';
const API_URL   = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Server-side Physics & Diagnostic calculation helpers
function gaussianNoise(mean = 0, stdDev = 1) {
  let u1 = Math.random();
  let u2 = Math.random();
  while (u1 === 0) u1 = Math.random();
  return mean + (Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2)) * stdDev;
}

function evaluateDiagnostics(reading) {
  const cur  = parseFloat(reading.current) || 0;
  const vx   = parseFloat(reading.vibX) || 0;
  const vy   = parseFloat(reading.vibY) || 0;
  const vz   = parseFloat(reading.vibZ) || 0;
  const rpm  = parseFloat(reading.rpm) || 0;
  const temp = parseFloat(reading.temperature) || 0;

  const maxVib = Math.max(vx, vy, vz);
  const rmsVib = Math.sqrt((vx * vx + vy * vy + vz * vz) / 3);

  let tempPenalty = 0; if (temp > 65) tempPenalty = Math.min(35, ((temp - 65) / 30) * 35);
  let vibPenalty  = 0; if (maxVib > 3.5) vibPenalty = Math.min(40, ((maxVib - 3.5) / 5.5) * 40);
  let curPenalty  = 0; if (cur > 20) curPenalty = Math.min(20, ((cur - 20) / 15) * 20);
  let rpmPenalty  = 0; if (rpm > 3400 || (rpm > 0 && rpm < 1000)) rpmPenalty = Math.min(15, Math.abs(rpm - 1800) / 1500 * 15);

  const totalPenalty = tempPenalty + vibPenalty + curPenalty + rpmPenalty;
  const healthScore  = Math.max(0, Math.min(100, Math.round(100 - totalPenalty)));

  let isoZone = 'Zone A (Good)';
  if (maxVib >= 7.1)      isoZone = 'Zone D (Critical Hazard)';
  else if (maxVib >= 4.5) isoZone = 'Zone C (Warning)';
  else if (maxVib >= 2.8) isoZone = 'Zone B (Acceptable)';

  const baseLifeHours = 18000;
  const degradationRatio = totalPenalty / 100;
  let rulHours = Math.round(baseLifeHours * Math.exp(-3.8 * degradationRatio));
  let rulDays = (rulHours / 24).toFixed(1);

  return { healthScore, maxVib, rmsVib, isoZone, rulDays, totalPenalty };
}

async function sendTelegramAlert(reading, diag, reason) {
  const text = `
🚨 <b>CRITICAL INDUSTRIAL HAZARD DETECTED</b>
━━━━━━━━━━━━━━━━━━━━
⚠️ <b>Condition:</b> ${reason.toUpperCase()}
🕒 <b>Timestamp:</b> <code>${reading.timestamp}</code>
🔴 <b>Machine Health Score:</b> <b>${diag.healthScore}%</b>
🌐 <b>ISO 10816-3 Zone:</b> <code>${diag.isoZone}</code>
⏳ <b>Estimated RUL:</b> <b>${diag.rulDays} Days</b>

📋 <b>Live Sensor Telemetry (Server-side):</b>
• 🌡️ <b>Temperature:</b> <code>${reading.temperature}°C</code>  [Limit: 85°C]
• 〰️ <b>Vibration Peak:</b> <code>${diag.maxVib.toFixed(1)} mm/s</code>  [Limit: 6.5 mm/s]
• ⚡ <b>Current Ingestion:</b> <code>${reading.current} A</code>  [Limit: 28A]
• ⚙️ <b>Shaft Speed:</b> <code>${reading.rpm} RPM</code>

🌐 <b>Dashboard:</b> https://predictive-delta.vercel.app/
🔴 <i>Automated server-side preventive protocol triggered.</i>`.trim();

  const keyboard = {
    inline_keyboard: [[
      { text: "📊 Check Live Status", url: "https://predictive-delta.vercel.app/" }
    ]]
  };

  try {
    const res = await fetch(`${API_URL}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: 'HTML',
        reply_markup: keyboard
      })
    });
    return await res.json();
  } catch (e) {
    console.error('[Server Cron] Telegram send error:', e);
    return null;
  }
}

export default async function handler(req, res) {
  // Generate authentic telemetry tick server-side
  const rpm = 1800 + Math.round(gaussianNoise(0, 15));
  const current = parseFloat((14.0 + gaussianNoise(0, 0.4)).toFixed(1));
  const temperature = parseFloat((48.0 + gaussianNoise(0, 0.5)).toFixed(1));
  const vibX = parseFloat((1.9 + gaussianNoise(0, 0.2)).toFixed(1));
  const vibY = parseFloat((2.1 + gaussianNoise(0, 0.2)).toFixed(1));
  const vibZ = parseFloat((1.8 + gaussianNoise(0, 0.2)).toFixed(1));
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);

  const reading = { rpm, current, temperature, vibX, vibY, vibZ, timestamp };
  const diag = evaluateDiagnostics(reading);

  let alertSent = false;
  let alertReason = '';

  if (temperature > 85.0) { alertReason = 'Thermal Overheat Spike (>85°C)'; }
  else if (diag.maxVib > 6.5) { alertReason = 'Bearing Thrust Vibration Anomaly (>6.5 mm/s)'; }
  else if (current > 28.0) { alertReason = 'Kinematic Current Overload (>28A)'; }

  if (alertReason) {
    await sendTelegramAlert(reading, diag, alertReason);
    alertSent = true;
  }

  return res.status(200).json({
    ok: true,
    server_time: timestamp,
    configured_chat_id: CHAT_ID,
    telemetry: reading,
    diagnostics: diag,
    hazard_alert_triggered: alertSent,
    hazard_reason: alertReason || 'NOMINAL'
  });
}
