/* BlockHost frontend logic */
const INR = (n) => '₹' + n.toLocaleString('en-IN');

async function api(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Request failed');
  return r.json();
}

/* ------------------------- Landing page ------------------------- */
async function loadConfig() {
  try {
    const c = await api('/api/config');
    const b = document.getElementById('modeBadge');
    if (b) b.textContent = c.paymentMode === 'live' ? 'Live payments enabled' : 'Demo payment mode';
  } catch {}
}

let PLANS = [];
async function loadPlans() {
  const grid = document.getElementById('planGrid');
  if (!grid) return;
  const data = await api('/api/plans');
  PLANS = data.plans;
  const popular = 'gold';
  grid.innerHTML = data.plans.map((p) => `
    <div class="plan ${p.id === popular ? 'popular' : ''}">
      ${p.id === popular ? '<div class="tag">POPULAR</div>' : ''}
      <h3>${p.name}</h3>
      <div class="ram">${p.ram} GB RAM</div>
      <div class="price">${INR(p.price)}<small>/mo</small></div>
      <ul>
        <li>${p.slots}+ player slots</li>
        <li>NVMe SSD storage</li>
        <li>DDoS protection</li>
        <li>One-click modpacks</li>
      </ul>
      <a class="btn" href="checkout.html?plan=${p.id}">Choose ${p.name}</a>
    </div>`).join('');
}

/* --------------------------- Checkout --------------------------- */
function initCheckout() {
  const params = new URLSearchParams(location.search);
  const planId = params.get('plan') || 'gold';
  let cycle = 'monthly';
  let priced = null;

  api('/api/config').then((c) => {
    const note = document.getElementById('modeNote');
    if (c.paymentMode === 'live') {
      note.className = 'note';
      note.textContent = 'Live mode: you will be charged the total shown.';
    }
  });

  async function refresh() {
    const r = await api('/api/plans');
    const plan = r.plans.find((p) => p.id === planId);
    const mult = { monthly: 1, quarterly: 2.7, yearly: 9.6 }[cycle];
    const sub = Math.round(plan.price * mult);
    const gst = Math.round(sub * r.gstRate);
    priced = { plan, sub, gst, total: sub + gst };
    document.getElementById('planLine').textContent = `${plan.name} — ${plan.ram} GB RAM`;
    document.getElementById('planMeta').textContent = `${plan.slots}+ slots · billed ${cycle}`;
    document.getElementById('sub').textContent = INR(sub);
    document.getElementById('gst').textContent = INR(gst);
    document.getElementById('total').textContent = INR(priced.total);
  }

  document.querySelectorAll('#cycleToggle button').forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll('#cycleToggle button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      cycle = b.dataset.cycle;
      refresh();
    };
  });

  document.getElementById('payBtn').onclick = async () => {
    const btn = document.getElementById('payBtn');
    btn.disabled = true;
    btn.textContent = 'Processing…';
    try {
      const customer = {
        name: document.getElementById('name').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
      };
      const { order } = await api('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, cycle, customer }),
      });
      const conf = await api(`/api/orders/${order.orderId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      document.getElementById('checkoutView').style.display = 'none';
      document.getElementById('successView').style.display = 'block';
      document.getElementById('orderId').textContent = order.orderId;
      document.getElementById('successNote').textContent =
        order.mode === 'demo'
          ? 'This was a demo payment — no money was charged. Add Razorpay keys on the server to accept real payments.'
          : 'A confirmation email is on its way.';
      if (conf.serverId) localStorage.setItem('lastServer', conf.serverId);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Pay now';
      alert('Payment failed: ' + e.message);
    }
  };

  refresh();
}

/* --------------------------- Dashboard --------------------------- */
function initDashboard() {
  const rows = document.getElementById('serverRows');
  const panel = document.getElementById('panel');
  const cons = document.getElementById('console');
  let current = null;
  let timer = null;

  function log(line, dim) {
    const t = new Date().toLocaleTimeString('en-IN');
    cons.innerHTML += `<div class="${dim ? 'dim' : ''}">[${t}] ${line}</div>`;
    cons.scrollTop = cons.scrollHeight;
  }

  async function render() {
    const { servers } = await api('/api/servers');
    if (!servers.length) {
      rows.innerHTML = `<tr><td colspan="6" style="color:var(--muted)">No servers yet. <a href="index.html#plans">Buy a plan</a> to get started.</td></tr>`;
      return;
    }
    rows.innerHTML = servers.map((s) => `
      <tr>
        <td><b>${s.plan} server</b><br><small style="color:var(--muted)">${s.id}</small></td>
        <td>${s.plan}</td><td>${s.ram} GB</td>
        <td><code>${s.ip}</code></td>
        <td><span class="status ${s.status}">${s.status}</span></td>
        <td><button class="btn ghost" data-id="${s.id}">Manage</button></td>
      </tr>`).join('');
    rows.querySelectorAll('button[data-id]').forEach((b) => {
      b.onclick = () => openPanel(servers.find((s) => s.id === b.dataset.id));
    });
  }

  function openPanel(srv) {
    current = srv;
    panel.style.display = 'block';
    document.getElementById('panelTitle').textContent = `${srv.plan} server — ${srv.ip}`;
    cons.innerHTML = '';
    log(`Connecting to ${srv.ip} …`, true);
    log('Server is ' + srv.status, true);
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      if (current && current.status === 'online') {
        document.getElementById('statRam').textContent = (40 + Math.floor(Math.random() * 30)) + '%';
        document.getElementById('statCpu').textContent = (20 + Math.floor(Math.random() * 40)) + '%';
        document.getElementById('barRam').style.width = document.getElementById('statRam').textContent;
        document.getElementById('barCpu').style.width = document.getElementById('statCpu').textContent;
      }
    }, 1500);
  }

  document.querySelectorAll('#panel [data-act]').forEach((b) => {
    b.onclick = async () => {
      if (!current) return;
      const act = b.dataset.act;
      log(`> ${act}`, true);
      const { server } = await api(`/api/servers/${current.id}/${act}`, { method: 'POST' });
      current = server;
      document.getElementById('statPlayers').textContent = server.players || 0;
      log(act === 'stop' ? 'Server stopped.' : `Server ${act}ed. Ready to accept connections.`);
      render();
    };
  });

  render();
}
