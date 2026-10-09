/**
 * BlockHost - Minecraft server hosting platform
 * Backend: Express. Serves the static frontend and exposes the plans,
 * checkout/payment and server-control APIs.
 *
 * Payment: works out of the box in DEMO mode (no real money charged).
 * Add RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET to .env to switch to real
 * Razorpay orders - no other code change needed.
 */
require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const GST_RATE = Number(process.env.GST_RATE || 0.18);

const HAS_RAZORPAY =
  !!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET;

let razorpay = null;
if (HAS_RAZORPAY) {
  // Lazily required so the app still runs in demo mode without the package.
  try {
    const Razorpay = require('razorpay');
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  } catch (e) {
    console.warn('razorpay package not installed; staying in demo mode.');
  }
}

/* ----------------------------- Plans ----------------------------- */

const PLANS = [
  { id: 'dirt',      name: 'Dirt',      ram: 2,  slots: 10,  price: 199  },
  { id: 'stone',     name: 'Stone',     ram: 4,  slots: 25,  price: 349  },
  { id: 'iron',      name: 'Iron',      ram: 6,  slots: 40,  price: 499  },
  { id: 'gold',      name: 'Gold',      ram: 8,  slots: 60,  price: 699  },
  { id: 'diamond',   name: 'Diamond',   ram: 12, slots: 100, price: 999  },
  { id: 'netherite', name: 'Netherite', ram: 16, slots: 200, price: 1299 },
];

// Billing cycle multipliers (discounts for longer commitments).
const CYCLES = {
  monthly:   { months: 1,  multiplier: 1.0 },
  quarterly: { months: 3,  multiplier: 2.7 }, // 10% off
  yearly:    { months: 12, multiplier: 9.6 }, // 20% off
};

/* --------------------------- In-memory store --------------------------- */
// Swap for a real database (Postgres/SQLite) in production.
const orders = new Map();
const servers = new Map();

function priceOrder(planId, cycle) {
  const plan = PLANS.find((p) => p.id === planId);
  const c = CYCLES[cycle] || CYCLES.monthly;
  if (!plan) return null;
  const subtotal = Math.round(plan.price * c.multiplier);
  const gst = Math.round(subtotal * GST_RATE);
  const total = subtotal + gst;
  return { plan, cycle, months: c.months, subtotal, gst, total };
}

/* ------------------------------- API ------------------------------- */

app.get('/api/plans', (_req, res) => {
  res.json({ plans: PLANS, cycles: Object.keys(CYCLES), gstRate: GST_RATE });
});

app.get('/api/config', (_req, res) => {
  res.json({
    paymentMode: HAS_RAZORPAY ? 'live' : 'demo',
    razorpayKeyId: HAS_RAZORPAY ? process.env.RAZORPAY_KEY_ID : null,
  });
});

// Create an order. In demo mode we just record it and return a fake id.
app.post('/api/orders', async (req, res) => {
  const { planId, cycle, customer } = req.body || {};
  const priced = priceOrder(planId, cycle);
  if (!priced) return res.status(400).json({ error: 'Unknown plan' });

  const orderId = 'ord_' + crypto.randomBytes(8).toString('hex');

  if (razorpay) {
    try {
      const rzp = await razorpay.orders.create({
        amount: priced.total * 100, // paise
        currency: 'INR',
        receipt: orderId,
        notes: { planId, cycle },
      });
      const order = {
        orderId, planId, cycle, customer: customer || {},
        ...priced, gatewayOrderId: rzp.id, status: 'created',
        mode: 'live', createdAt: new Date().toISOString(),
      };
      orders.set(orderId, order);
      return res.json({ order, razorpayKeyId: process.env.RAZORPAY_KEY_ID });
    } catch (e) {
      return res.status(502).json({ error: 'Payment gateway error' });
    }
  }

  // Demo mode
  const order = {
    orderId, planId, cycle, customer: customer || {},
    ...priced, status: 'created', mode: 'demo',
    createdAt: new Date().toISOString(),
  };
  orders.set(orderId, order);
  res.json({ order, razorpayKeyId: null });
});

// Confirm payment (demo) or verify signature (live).
app.post('/api/orders/:id/confirm', (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (order.mode === 'live') {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body || {};
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');
    if (expected !== razorpay_signature) {
      return res.status(400).json({ error: 'Invalid signature' });
    }
  }

  order.status = 'paid';
  order.paidAt = new Date().toISOString();

  // Provision a mock server for this order.
  const serverId = 'srv_' + crypto.randomBytes(6).toString('hex');
  servers.set(serverId, {
    id: serverId,
    orderId: order.orderId,
    plan: order.plan.name,
    ram: order.plan.ram,
    slots: order.plan.slots,
    status: 'offline',
    ip: `play.blockhost.in:${25565 + (servers.size % 1000)}`,
    createdAt: new Date().toISOString(),
  });

  res.json({ order, serverId });
});

app.get('/api/servers', (_req, res) => {
  res.json({ servers: [...servers.values()] });
});

app.post('/api/servers/:id/:action', (req, res) => {
  const srv = servers.get(req.params.id);
  const action = req.params.action;
  if (!srv) return res.status(404).json({ error: 'Server not found' });
  if (!['start', 'stop', 'restart'].includes(action)) {
    return res.status(400).json({ error: 'Bad action' });
  }
  srv.status = action === 'stop' ? 'offline' : 'online';
  srv.players = srv.status === 'online' ? Math.floor(Math.random() * srv.slots) : 0;
  res.json({ server: srv });
});

app.listen(PORT, () => {
  console.log(`BlockHost running on http://localhost:${PORT}`);
  console.log(`Payment mode: ${HAS_RAZORPAY ? 'LIVE (Razorpay)' : 'DEMO'}`);
});
