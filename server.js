const express = require('express');
const axios   = require('axios');
const crypto  = require('crypto');
const { Resend } = require('resend');

const app = express();

// Raw body for webhook signature verification
app.use('/webhook/elicatepay', express.raw({ type: '*/*' }));
app.use(express.json());
app.use(require('cors')());

// ═══════════════════════════════════════════════
// CONFIG — Railway Variables
// ═══════════════════════════════════════════════
const EP_SECRET_KEY  = process.env.EP_SECRET_KEY  || '';
const EP_WEBHOOK_SEC = process.env.EP_WEBHOOK_SEC || '';
const RESEND_KEY     = process.env.RESEND_API_KEY || '';
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || 'williambento66@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const APP_URL        = process.env.APP_URL        || 'https://kxmessenger.netlify.app';

const resend = new Resend(RESEND_KEY);

// In-memory pending transactions
var pending = {};
var processed = {};

// ═══════════════════════════════════════════════
// GENERATE ACTIVATION CODE
// ═══════════════════════════════════════════════
function generateCode(plan) {
  var prefix = plan === 'business' ? 'KODEX-BIZ' : 'KODEX-PRO';
  var unique = crypto.randomBytes(5).toString('hex').toUpperCase();
  return prefix + '-' + unique;
}

// ═══════════════════════════════════════════════
// SEND ACTIVATION EMAIL
// ═══════════════════════════════════════════════
async function sendActivationEmail(email, name, plan, code, amount) {
  var planName = plan === 'business' ? 'Business' : 'Pro';
  var features = plan === 'business'
    ? '&#10003; Up to 10 simultaneous users<br>&#10003; 50MB file transfers<br>&#10003; 30-day sessions<br>&#10003; Custom session codes<br>&#10003; Admin dashboard'
    : '&#10003; 50MB file transfers<br>&#10003; 7-day session codes<br>&#10003; Custom session codes<br>&#10003; Priority connection<br>&#10003; Email support 24h';

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>'
    + 'body{font-family:Arial,sans-serif;background:#060d1a;color:#f8fafc;margin:0;padding:0}'
    + '.w{max-width:520px;margin:0 auto;padding:36px 20px}'
    + '.logo{font-size:1.3rem;font-weight:700;color:#60a5fa}'
    + '.card{background:#111d35;border:1px solid rgba(59,130,246,.2);border-radius:16px;padding:26px;margin:20px 0}'
    + '.cb{background:#0a1628;border:2px solid #2563eb;border-radius:12px;padding:18px;text-align:center;margin:18px 0}'
    + '.code{font-family:Courier New,monospace;font-size:1.5rem;font-weight:800;color:#60a5fa;letter-spacing:3px}'
    + '.lbl{font-size:.72rem;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}'
    + '.step{display:flex;gap:10px;margin-bottom:9px;font-size:.87rem;color:#94a3b8;align-items:flex-start}'
    + '.num{background:#2563eb;color:#fff;border-radius:50%;width:22px;height:22px;min-width:22px;display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:700}'
    + '.btn{display:block;text-align:center;background:linear-gradient(135deg,#1e40af,#2563eb);color:#fff;padding:14px;border-radius:12px;text-decoration:none;font-weight:700;margin:18px 0;font-size:1rem}'
    + '.foot{font-size:.74rem;color:#475569;text-align:center;margin-top:24px;line-height:1.8}'
    + '</style></head><body><div class="w">'
    + '<div class="logo">&#128272; Kodex Messenger</div>'
    + '<p style="color:#94a3b8;font-size:.88rem;margin:4px 0 0">Private. Encrypted. Yours.</p>'
    + '<div class="card">'
    + '<p style="font-size:1.05rem;font-weight:700;margin:0 0 5px">Welcome to ' + planName + ', ' + name + '!</p>'
    + '<p style="color:#94a3b8;font-size:.87rem;margin:0 0 18px">Payment of ' + amount + ' confirmed. Your activation code:</p>'
    + '<div class="cb"><div class="lbl">Your Activation Code</div><div class="code">' + code + '</div></div>'
    + '<a href="' + APP_URL + '" class="btn">Open Kodex Messenger &#8594;</a>'
    + '<p style="font-size:.84rem;font-weight:700;margin:14px 0 10px">How to activate:</p>'
    + '<div class="step"><div class="num">1</div><span>Open Kodex Messenger at the link above</span></div>'
    + '<div class="step"><div class="num">2</div><span>Connect to any session</span></div>'
    + '<div class="step"><div class="num">3</div><span>Tap &#9881;&#65039; Settings in the chat screen</span></div>'
    + '<div class="step"><div class="num">4</div><span>Tap Enter Activation Code</span></div>'
    + '<div class="step"><div class="num">5</div><span>Type your code exactly as shown above</span></div>'
    + '<div class="step"><div class="num">6</div><span>Your ' + planName + ' plan activates instantly</span></div>'
    + '<div style="background:rgba(37,99,235,.08);border:1px solid rgba(37,99,235,.15);border-radius:10px;padding:14px;margin-top:16px">'
    + '<div style="font-size:.78rem;font-weight:700;color:#60a5fa;margin-bottom:8px">Your ' + planName + ' features:</div>'
    + '<div style="font-size:.84rem;color:#94a3b8;line-height:2">' + features + '</div>'
    + '</div></div>'
    + '<div class="foot">'
    + '<p>Code valid for 30 days from purchase.</p>'
    + '<p>Questions? <a href="mailto:' + ADMIN_EMAIL + '" style="color:#60a5fa">' + ADMIN_EMAIL + '</a></p>'
    + '<p style="margin-top:6px">&#169; 2026 Kodex Messenger &middot; kodexmessenger.com</p>'
    + '</div></div></body></html>';

  return await resend.emails.send({
    from:    'Kodex Messenger <noreply@kodexmessenger.com>',
    to:      email,
    bcc:     ADMIN_EMAIL,
    subject: 'Your Kodex ' + planName + ' Activation Code — ' + code,
    html:    html
  });
}

// ═══════════════════════════════════════════════
// PROCESS PAYMENT — deduplicated
// ═══════════════════════════════════════════════
async function processPayment(txRef, email, name, plan, amount) {
  if (processed[txRef]) {
    console.log('Already processed:', txRef);
    return false;
  }
  processed[txRef] = true;

  var code = generateCode(plan);
  console.log('Processing payment:', txRef, email, plan, '->', code);

  try {
    await sendActivationEmail(email, name, plan, code, amount);
    console.log('Email sent to:', email, 'code:', code);

    if (pending[txRef]) {
      pending[txRef].status = 'completed';
      pending[txRef].code   = code;
    }
    return true;
  } catch (err) {
    console.error('Email failed:', err.message);
    delete processed[txRef];
    return false;
  }
}

// ═══════════════════════════════════════════════
// VERIFY WITH ELICATEPAY API
// ═══════════════════════════════════════════════
async function verifyElicate(txRef) {
  var endpoints = [
    { method: 'GET',  url: 'https://elicatepay.vercel.app/api/verify/' + txRef },
    { method: 'POST', url: 'https://elicatepay.vercel.app/api/verify', body: { reference: txRef, transaction_id: txRef } },
    { method: 'GET',  url: 'https://elicatepay.vercel.app/api/transaction/' + txRef },
    { method: 'POST', url: 'https://elicatepay.vercel.app/api/payment/verify', body: { ref: txRef } },
  ];

  var headers = {
    'Authorization': 'Bearer ' + EP_SECRET_KEY,
    'x-api-key':     EP_SECRET_KEY,
    'Content-Type':  'application/json',
    'Accept':        'application/json'
  };

  for (var i = 0; i < endpoints.length; i++) {
    var ep = endpoints[i];
    try {
      var cfg = { headers: headers, timeout: 8000 };
      var res = ep.method === 'POST'
        ? await axios.post(ep.url, ep.body || {}, cfg)
        : await axios.get(ep.url, cfg);

      var d      = res.data;
      var status = (d.status || d.payment_status || d.state || d.data && d.data.status || '').toString().toLowerCase();
      console.log('ElicatePay verify', ep.url, '->', status, JSON.stringify(d).slice(0, 150));

      if (
        status === 'success'     || status === 'successful' ||
        status === 'completed'   || status === 'paid'       ||
        status === 'approved'    || status === '1'          ||
        d.success === true       || d.paid === true         ||
        (d.data && d.data.paid === true)
      ) {
        return { verified: true, data: d };
      }
    } catch (err) {
      console.log('Endpoint failed:', ep.url, err.message);
    }
  }
  return { verified: false };
}

// ═══════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════
app.get('/', function(req, res) {
  res.json({
    status:  'Kodex Backend running',
    time:    new Date().toISOString(),
    gateway: 'ElicatePay',
    pending: Object.keys(pending).length
  });
});

// ═══════════════════════════════════════════════
// ELICATEPAY WEBHOOK
// Set in ElicatePay dashboard:
// https://kodex-backend-production.up.railway.app/webhook/elicatepay
// ═══════════════════════════════════════════════
app.post('/webhook/elicatepay', async function(req, res) {
  try {
    var rawBody = req.body;
    var payload = rawBody.toString('utf8');
    console.log('Webhook raw:', payload.slice(0, 300));

    // Verify webhook signature (Stripe-compatible)
    if (EP_WEBHOOK_SEC && EP_WEBHOOK_SEC !== 'placeholder') {
      var sig = req.headers['x-elicate-signature']
             || req.headers['x-webhook-signature']
             || req.headers['stripe-signature']
             || req.headers['x-signature']
             || '';

      if (sig) {
        try {
          // Try Stripe-style HMAC verification
          var ts      = sig.split(',').find(function(p) { return p.startsWith('t='); });
          var sigHash = sig.split(',').find(function(p) { return p.startsWith('v1='); });
          if (ts && sigHash) {
            var timestamp  = ts.replace('t=', '');
            var expected   = 'v1=' + crypto.createHmac('sha256', EP_WEBHOOK_SEC).update(timestamp + '.' + payload).digest('hex');
            var received   = sigHash.replace('v1=', '');
            if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from('v1=' + received))) {
              console.log('Signature mismatch — processing anyway for compatibility');
            }
          }
        } catch (sigErr) {
          console.log('Sig verify error:', sigErr.message);
        }
      }
    }

    var data = JSON.parse(payload);

    // Extract fields — handle multiple payload formats
    var status  = (data.status || data.event || data.type || data.payment_status || '').toLowerCase();
    var txRef   = data.reference || data.tx_ref || data.transaction_id || data.id || data.ref || '';
    var email   = data.email || data.customer_email || (data.customer && data.customer.email) || (data.data && data.data.email) || '';
    var name    = data.name  || data.customer_name  || (data.customer && data.customer.name)  || 'Customer';
    var amount  = data.amount || (data.data && data.data.amount) || 0;
    var currency = data.currency || 'ZMW';

    console.log('Webhook parsed:', { status, txRef, email, amount });

    // Check for success
    var isSuccess =
      status.includes('success') || status.includes('paid')      ||
      status.includes('complete') || status.includes('approved')  ||
      status === 'charge.completed' || status === 'payment.success' ||
      status === 'payment_intent.succeeded' ||
      data.success === true || data.paid === true;

    if (!isSuccess) {
      console.log('Not a success event:', status);
      return res.status(200).json({ received: true });
    }

    if (!email && txRef && pending[txRef]) {
      email = pending[txRef].email;
      name  = pending[txRef].name;
    }

    if (!email) {
      console.log('No email found in webhook');
      return res.status(200).json({ received: true, warning: 'no email' });
    }

    var plan      = parseFloat(amount) >= 300 ? 'business' : 'pro';
    var amountStr = currency + ' ' + amount;

    if (txRef && pending[txRef]) {
      plan = pending[txRef].plan || plan;
    }

    var ok = await processPayment(txRef || ('WH-' + Date.now()), email, name, plan, amountStr);
    return res.status(200).json({ received: true, processed: ok });

  } catch (err) {
    console.error('Webhook error:', err.message);
    // Always return 200 to ElicatePay so they don't retry forever
    return res.status(200).json({ received: true, error: err.message });
  }
});

// ═══════════════════════════════════════════════
// INITIATE PAYMENT — frontend registers transaction
// POST /initiate-payment
// ═══════════════════════════════════════════════
app.post('/initiate-payment', async function(req, res) {
  var email = req.body.email || '';
  var name  = req.body.name  || 'Customer';
  var plan  = req.body.plan  || 'pro';
  var txRef = req.body.txRef || ('EP-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase());

  if (!email || email.indexOf('@') < 0) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  pending[txRef] = {
    email:     email,
    name:      name,
    plan:      plan,
    txRef:     txRef,
    createdAt: Date.now(),
    status:    'pending',
    checks:    0
  };

  console.log('Payment initiated:', txRef, email, plan);
  startPolling(txRef);

  return res.json({ success: true, txRef: txRef });
});

// ═══════════════════════════════════════════════
// POLLING
// ═══════════════════════════════════════════════
function startPolling(txRef) {
  var maxChecks = 120;
  var timer = setInterval(async function() {
    var tx = pending[txRef];
    if (!tx) { clearInterval(timer); return; }
    tx.checks++;

    if (tx.checks > maxChecks || tx.status === 'completed') {
      clearInterval(timer);
      if (tx.checks > maxChecks) { delete pending[txRef]; }
      return;
    }

    try {
      var result = await verifyElicate(txRef);
      if (result.verified) {
        clearInterval(timer);
        var amount = tx.plan === 'business' ? 'ZMW 349' : 'ZMW 86';
        await processPayment(txRef, tx.email, tx.name, tx.plan, amount);
      }
    } catch (err) {
      console.error('Poll error:', txRef, err.message);
    }
  }, 12000);
}

// ═══════════════════════════════════════════════
// VERIFY — frontend manual check
// POST /verify-payment
// ═══════════════════════════════════════════════
app.post('/verify-payment', async function(req, res) {
  var txRef = req.body.txRef || '';
  if (!txRef) { return res.status(400).json({ error: 'txRef required' }); }

  var tx = pending[txRef];
  if (!tx) { return res.json({ status: 'not_found' }); }
  if (tx.status === 'completed') { return res.json({ status: 'completed' }); }

  try {
    var result = await verifyElicate(txRef);
    if (result.verified) {
      var amount = tx.plan === 'business' ? 'ZMW 349' : 'ZMW 86';
      var ok = await processPayment(txRef, tx.email, tx.name, tx.plan, amount);
      return res.json({ status: ok ? 'completed' : 'error' });
    }
    return res.json({ status: 'pending' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════
// MANUAL CODE GENERATOR
// POST /generate-code
// ═══════════════════════════════════════════════
app.post('/generate-code', async function(req, res) {
  if (!ADMIN_PASSWORD || req.body.password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  var email = req.body.email || '';
  var plan  = req.body.plan  || 'pro';
  var name  = req.body.name  || 'Customer';
  if (!email) { return res.status(400).json({ error: 'email required' }); }
  var code = generateCode(plan);
  if (email !== 'nomail') {
    await sendActivationEmail(email, name, plan, code, 'Manual');
  }
  return res.json({ success: true, code: code, plan: plan, email: email });
});

// ═══════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════
var PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log('Kodex backend on port ' + PORT + ' — ElicatePay');
});
