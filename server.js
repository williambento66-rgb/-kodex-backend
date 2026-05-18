const express = require('express');
const axios = require('axios');
const { Resend } = require('resend');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// ═══════════════════════════════════════════
// CONFIG — set these in Railway environment
// ═══════════════════════════════════════════
const FLW_SECRET      = process.env.FLW_SECRET_KEY;
const FLW_WEBHOOK_SEC = process.env.FLW_WEBHOOK_SECRET;
const RESEND_KEY      = process.env.RESEND_API_KEY;
const ADMIN_EMAIL     = process.env.ADMIN_EMAIL;
const APP_URL         = process.env.APP_URL || 'https://kxmessenger.netlify.app';

const resend = new Resend(RESEND_KEY);

// ═══════════════════════════════════════════
// GENERATE ACTIVATION CODE
// ═══════════════════════════════════════════
function generateCode(plan) {
  const prefix = plan === 'business' ? 'KODEX-BIZ' : 'KODEX-PRO';
  const unique = crypto.randomBytes(6).toString('hex').toUpperCase();
  return prefix + '-' + unique;
}

// ═══════════════════════════════════════════
// SEND ACTIVATION EMAIL
// ═══════════════════════════════════════════
async function sendActivationEmail(email, name, plan, code, amount) {
  const planName = plan === 'business' ? 'Business' : 'Pro';
  const features = plan === 'business'
    ? '✓ Up to 10 simultaneous users\n✓ 50MB file transfers\n✓ 30-day sessions\n✓ Custom session codes\n✓ Admin dashboard'
    : '✓ 50MB file transfers\n✓ 7-day session codes\n✓ Custom session codes\n✓ Priority connection';

  const html = `
<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: Arial, sans-serif; background: #060d1a; color: #f8fafc; margin: 0; padding: 0; }
  .wrap { max-width: 520px; margin: 0 auto; padding: 40px 20px; }
  .logo { font-size: 1.4rem; font-weight: 700; color: #60a5fa; margin-bottom: 8px; }
  .card { background: #111d35; border: 1px solid rgba(59,130,246,0.2); border-radius: 16px; padding: 28px; margin: 24px 0; }
  .code-box { background: #0a1628; border: 2px solid #2563eb; border-radius: 12px; padding: 18px; text-align: center; margin: 20px 0; }
  .code { font-family: 'Courier New', monospace; font-size: 1.4rem; font-weight: 800; color: #60a5fa; letter-spacing: 2px; }
  .label { font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
  .step { display: flex; gap: 12px; margin-bottom: 12px; font-size: 0.9rem; color: #94a3b8; }
  .num { background: #2563eb; color: #fff; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 700; flex-shrink: 0; }
  .btn { display: block; text-align: center; background: linear-gradient(135deg, #1e40af, #2563eb); color: #fff; padding: 14px 28px; border-radius: 12px; text-decoration: none; font-weight: 700; margin: 20px 0; }
  .feat { font-size: 0.85rem; color: #94a3b8; line-height: 1.9; white-space: pre-line; }
  .footer { font-size: 0.75rem; color: #475569; text-align: center; margin-top: 32px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="logo">🔐 Kodex Messenger</div>
  <p style="color:#94a3b8;font-size:0.9rem">Private. Encrypted. Yours.</p>

  <div class="card">
    <p style="font-size:1.1rem;font-weight:700;margin-bottom:4px">Welcome to ${planName}, ${name}!</p>
    <p style="color:#94a3b8;font-size:0.88rem;margin-bottom:20px">Your payment of ${amount} has been confirmed. Here is your activation code:</p>

    <div class="code-box">
      <div class="label">Your Activation Code</div>
      <div class="code">${code}</div>
    </div>

    <a href="${APP_URL}" class="btn">Open Kodex Messenger →</a>

    <p style="font-size:0.85rem;font-weight:700;margin-bottom:12px">How to activate your ${planName} plan:</p>
    <div class="step"><div class="num">1</div><span>Open Kodex Messenger at the link above</span></div>
    <div class="step"><div class="num">2</div><span>Connect to any session</span></div>
    <div class="step"><div class="num">3</div><span>Tap the ⚙️ Settings icon in the chat</span></div>
    <div class="step"><div class="num">4</div><span>Tap <strong>Enter Activation Code</strong></span></div>
    <div class="step"><div class="num">5</div><span>Type your code exactly as shown above</span></div>
    <div class="step"><div class="num">6</div><span>Your ${planName} plan activates instantly</span></div>

    <div style="background:rgba(37,99,235,0.08);border:1px solid rgba(37,99,235,0.15);border-radius:10px;padding:16px;margin-top:20px;">
      <div style="font-size:0.8rem;font-weight:700;color:#60a5fa;margin-bottom:8px">Your ${planName} features:</div>
      <div class="feat">${features}</div>
    </div>
  </div>

  <div class="footer">
    <p>This code is valid for 30 days from purchase.</p>
    <p>Questions? Reply to this email or contact us at ${ADMIN_EMAIL}</p>
    <p style="margin-top:8px">© 2026 Kodex Messenger · kodexmessenger.com</p>
  </div>
</div>
</body>
</html>`;

  await resend.emails.send({
    from: 'Kodex Messenger <noreply@kodexmessenger.com>',
    to: email,
    bcc: ADMIN_EMAIL,
    subject: `Your Kodex ${planName} Activation Code`,
    html: html
  });
}

// ═══════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════
app.get('/', (req, res) => {
  res.json({
    status: 'Kodex Backend running',
    time: new Date().toISOString()
  });
});

// ═══════════════════════════════════════════
// FLUTTERWAVE WEBHOOK
// Called automatically when payment succeeds
// ═══════════════════════════════════════════
app.post('/webhook/flutterwave', async (req, res) => {
  try {
    // Verify webhook is from Flutterwave
    const signature = req.headers['verif-hash'];
    if (!signature || signature !== FLW_WEBHOOK_SEC) {
      console.log('Invalid webhook signature');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const event = req.body;
    console.log('Webhook received:', JSON.stringify(event));

    // Only process successful payments
    if (event.event !== 'charge.completed') {
      return res.status(200).json({ received: true });
    }

    const data = event.data;
    if (data.status !== 'successful') {
      return res.status(200).json({ received: true });
    }

    // Verify payment with Flutterwave API
    const verify = await axios.get(
      `https://api.flutterwave.com/v3/transactions/${data.id}/verify`,
      { headers: { Authorization: `Bearer ${FLW_SECRET}` } }
    );

    const payment = verify.data.data;
    if (payment.status !== 'successful') {
      return res.status(200).json({ received: true });
    }

    // Determine plan from amount
    const amount = payment.amount;
    const currency = payment.currency;
    let plan = 'pro';
    if (amount >= 349 && currency === 'ZMW') plan = 'business';
    if (amount >= 19 && currency === 'USD') plan = 'business';

    // Get customer details
    const email = payment.customer.email;
    const name  = payment.customer.name || 'Valued Customer';
    const amountStr = currency + ' ' + amount;

    // Generate activation code
    const code = generateCode(plan);
    console.log(`Generated ${plan} code for ${email}: ${code}`);

    // Send activation email
    await sendActivationEmail(email, name, plan, code, amountStr);
    console.log(`Activation email sent to ${email}`);

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Webhook error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// MANUAL CODE GENERATOR (for you to use)
// POST /generate-code with admin password
// ═══════════════════════════════════════════
app.post('/generate-code', async (req, res) => {
  const { password, plan, email, name } = req.body;

  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!email || !plan) {
    return res.status(400).json({ error: 'email and plan required' });
  }

  const code = generateCode(plan);

  if (email !== 'nomail') {
    await sendActivationEmail(email, name || 'Customer', plan, code, 'Manual');
  }

  return res.json({ success: true, code: code, plan: plan, email: email });
});

// ═══════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Kodex backend running on port ${PORT}`);
});
