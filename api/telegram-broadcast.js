/**
 * Vercel Serverless Function: Server-side Telegram Alert Broadcast
 * Path: /api/telegram-broadcast
 *
 * Called when a web user triggers a Fault Injection scenario or critical sensor input.
 * Sends the Telegram alert directly from Vercel server to TELEGRAM_CHAT_ID.
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || '8664722270:AAE7OJYP7Jwn1rV_B0Ty0oHm6RRi-PQZYy4';
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID || process.env.CHAT_ID || '8984846317';
const API_URL   = `https://api.telegram.org/bot${BOT_TOKEN}`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true, message: 'Server-side Telegram Broadcast API' });
  }

  try {
    const { reading, faultType, isCleared } = req.body || {};

    let text = '';
    if (isCleared) {
      text = `
✅ <b>FAULT SCENARIO CLEARED (SERVER BROADCAST)</b>
━━━━━━━━━━━━━━━━━━━━
<b>Scenario:</b> ${faultType || 'All Faults'}
🟢 <b>Machinery restored to nominal operating parameters.</b>
<i>Continuous baseline monitoring resumed on Vercel Server.</i>`.trim();
    } else {
      const temp  = reading ? reading.temperature : '—';
      const cur   = reading ? reading.current : '—';
      const rpm   = reading ? reading.rpm : '—';
      const vib   = reading ? Math.max(reading.vibX||0, reading.vibY||0, reading.vibZ||0).toFixed(1) : '—';
      const time  = reading ? (reading.timestamp || new Date().toLocaleTimeString()) : new Date().toLocaleTimeString();

      text = `
🚨 <b>CRITICAL INDUSTRIAL HAZARD DETECTED</b>
━━━━━━━━━━━━━━━━━━━━
⚠️ <b>Triggered Fault:</b> ${faultType ? faultType.toUpperCase() : 'HAZARD INJECTION'}
🕒 <b>Timestamp:</b> <code>${time}</code>

📋 <b>Live Sensor Snapshot:</b>
• 🌡️ <b>Temperature:</b> <code>${temp}°C</code>
• 〰️ <b>Vibration Peak:</b> <code>${vib} mm/s</code>
• ⚡ <b>Current Load:</b> <code>${cur} A</code>
• ⚙️ <b>Shaft Speed:</b> <code>${rpm} RPM</code>

🌐 <b>Dashboard:</b> https://predictive-delta.vercel.app/
🔴 <i>Automated preventive protocol dispatched from Vercel Server.</i>`.trim();
    }

    const keyboard = {
      inline_keyboard: [[
        { text: "📊 Open Dashboard", url: "https://predictive-delta.vercel.app/" }
      ]]
    };

    const telegramRes = await fetch(`${API_URL}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: 'HTML',
        reply_markup: keyboard
      })
    });

    const result = await telegramRes.json();
    return res.status(200).json({ ok: true, recipient: CHAT_ID, telegram_response: result });
  } catch (err) {
    console.error('[Broadcast API] Error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
