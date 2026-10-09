# BlockHost — Minecraft Server Hosting

A Minecraft game-server hosting platform: plans, a checkout/payment flow
(Razorpay-ready, runs in demo mode by default) and a client server dashboard
with start/stop/restart controls and a live console.

## Features

- **Plans** tiered by RAM (Dirt 2GB → Netherite 16GB), priced in ₹/month.
- **Checkout** with monthly / quarterly (10% off) / yearly (20% off) billing,
  GST (18%) breakdown, and UPI / card / netbanking / wallet options.
- **Payments** via Razorpay. With no keys set, the app runs in **demo mode**
  — a simulated order is created and no money is charged.
- **Dashboard** listing your servers with status, IP:port, a control panel
  (start / stop / restart), player count and CPU/RAM gauges, and a live console.

## Quick start

```bash
npm install
cp .env.example .env      # optional
npm start
# open http://localhost:3000
```

## Going live with real payments

1. Create a [Razorpay](https://razorpay.com) account and grab your API keys.
2. Put them in `.env`:
   ```
   RAZORPAY_KEY_ID=rzp_live_xxxxxxxx
   RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxx
   ```
3. Restart. The app auto-detects the keys and creates real orders; the
   frontend badge switches from *Demo payment mode* to *Live payments enabled*.

> Never commit your `.env` file or hard-code keys in source. `.gitignore`
> already excludes `.env`.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET  | `/api/plans` | List plans and billing cycles |
| GET  | `/api/config` | Payment mode + public Razorpay key id |
| POST | `/api/orders` | Create an order |
| POST | `/api/orders/:id/confirm` | Confirm payment (demo) / verify signature (live) |
| GET  | `/api/servers` | List servers |
| POST | `/api/servers/:id/:action` | `start` \| `stop` \| `restart` |

## Project layout

```
server.js            Express backend + APIs
public/index.html    Landing page + plans
public/checkout.html Checkout / payment page
public/dashboard.html Server dashboard
public/styles.css    Theme
public/app.js        Frontend logic
```

## Notes / next steps

- Orders and servers are stored in memory for simplicity. Swap in a real
  database (Postgres, SQLite) before production.
- Server control endpoints are mocked; wire them to a real panel (Pterodactyl,
  AMP) to actually provision Minecraft instances.

## License

MIT. Not affiliated with Mojang or Microsoft.
