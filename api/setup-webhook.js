/**
 * Vercel Serverless Function: Register Telegram Webhook
 * Path: /api/setup-webhook
 *
 * Visit this URL once after deployment to register your bot webhook with Telegram:
 * https://your-project.vercel.app/api/setup-webhook
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
const PROD_URL   = 'https://predictive-delta.vercel.app';

export default async function handler(req, res) {
  const host = req.headers.host || 'predictive-delta.vercel.app';
  const webhookUrl = `https://${host}/api/telegram`;

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
          allowed_updates: ['message', 'callback_query']
        })
      }
    );
    const data = await response.json();

    if (data.ok) {
      return res.status(200).json({
        success: true,
        message: `✅ Webhook registered successfully!`,
        webhook_url: webhookUrl,
        telegram_response: data
      });
    } else {
      return res.status(200).json({
        success: false,
        message: `❌ Failed to register webhook`,
        webhook_url: webhookUrl,
        telegram_response: data
      });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
