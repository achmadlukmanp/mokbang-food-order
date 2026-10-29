const $ = s => document.querySelector(s);
const rp = n => "Rp " + Number(n).toLocaleString("id-ID");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const CATS = {fast_food: "Fast Food", warung: "Warung", grocery: "Bahan Makanan"};
const STATUS = {pending: "Menunggu", processing: "Diproses", done: "Selesai", cancelled: "Dibatalkan", booked: "Terjadwal"};
let user = null, cart = JSON.parse(localStorage.getItem("cart") || "null") || {place: null, items: {}};

async function api(path, method = "GET", body) {
  const r = await fetch("/api" + path, {method, headers: {"Content-Type": "application/json"}, body: body ? JSON.stringify(body) : undefined});
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Terjadi kesalahan");
  return d;
}
function toast(msg, bad) { const t = $("#toast"); t.textContent = msg; t.className = "show" + (bad ? " err" : ""); setTimeout(() => t.className = "", 2500); }
const saveCart = () => localStorage.setItem("cart", JSON.stringify(cart));
const cartCount = () => Object.values(cart.items).reduce((a, i) => a + i.qty, 0);
const cartTotal = () => Object.values(cart.items).reduce((a, i) => a + i.qty * i.price, 0);
const go = h => location.hash = h;
const guard = async fn => { try { await fn(); } catch (e) { toast(e.message, true); } };

function nav() {
  const h = location.hash || "#/";
  const l = (href, t) => `<a href="${href}" class="${h === href ? "on" : ""}">${t}</a>`;
  $("#nav").innerHTML = l("#/", "Beranda") + l("#/reserve", "Reservasi") + (user ? l("#/orders", "Pesanan") + l("#/cart", `Keranjang (${cartCount()})`)
    + (user.role === "admin" ? l("#/admin", "Admin") : "") + l("#/profile", esc(user.name)) + `<button onclick="logout()">Keluar</button>` : l("#/login", "Masuk"));
}
async function logout() { await api("/logout", "POST"); user = null; cart = {place: null, items: {}}; saveCart(); go("#/"); route(); }

// ---------- views ----------
async function home(cat = "") {
  const ps = await api("/places" + (cat ? "?category=" + cat : ""));
  $("#app").innerHTML = `<h1>Mau makan apa hari ini?</h1>
    <div class="tabs">${[["", "Semua"], ...Object.entries(CATS)].map(([k, v]) => `<button class="tab ${k === cat ? "on" : ""}" onclick="home('${k}')">${v}</button>`).join("")}</div>
    <div class="grid">${ps.map(p => `<a class="card" href="#/place/${p.id}"><div class="emoji">${p.emoji}</div><h3>${esc(p.name)}</h3>
      <div class="mut">${CATS[p.category]} · ⭐ ${p.rating}</div><div class="mut">${esc(p.address)}</div></a>`).join("")}</div>`;
}

async function placeView(id) {
  const p = await api("/places/" + id);
  const draw = () => {
    $("#app").innerHTML = `<a href="#/" class="mut">← Kembali</a><h1>${p.emoji} ${esc(p.name)}</h1><p class="mut">${esc(p.address)} · ⭐ ${p.rating}</p>
      <div class="card">${p.items.map(i => `<div class="row"><div><span class="emoji" style="font-size:1.6rem">${i.emoji}</span> <b>${esc(i.name)}</b><div class="mut">${rp(i.price)}</div></div>
        <div class="qty"><button onclick="chg(${p.id},${i.id},-1)" aria-label="Kurangi">−</button><span>${cart.place === p.id ? cart.items[i.id]?.qty || 0 : 0}</span><button onclick="chg(${p.id},${i.id},1)" aria-label="Tambah">+</button></div></div>`).join("")}</div>
      ${cartCount() ? `<div class="bar"><span>${cartCount()} item · <b>${rp(cartTotal())}</b></span><a class="btn" href="#/cart">Lihat keranjang</a></div>` : ""}`;
    nav();
  };
  window.chg = (pid, iid, d) => {
    if (cart.place !== pid) cart = {place: pid, items: {}};
    const it = p.items.find(x => x.id === iid), cur = cart.items[iid]?.qty || 0, n = Math.max(0, cur + d);
    if (n) cart.items[iid] = {name: it.name, price: it.price, qty: n}; else delete cart.items[iid];
    saveCart(); draw();
  };
  draw();
}

async function cartView() {
  if (!user) return go("#/login");
  const rows = Object.entries(cart.items);
  if (!rows.length) { $("#app").innerHTML = `<h1>Keranjang</h1><p class="mut">Keranjang masih kosong. <a href="#/"><u>Pilih menu</u></a></p>`; return; }
  $("#app").innerHTML = `<h1>Checkout</h1><div class="card">${rows.map(([id, i]) => `<div class="row"><span>${esc(i.name)} × ${i.qty}</span><b>${rp(i.qty * i.price)}</b></div>`).join("")}
    <div class="row"><b>Total</b><b>${rp(cartTotal())}</b></div></div>
    <div class="form"><label>Jenis pesanan</label><select id="mode"><option value="dine_in">Makan di tempat</option><option value="take_away">Bawa pulang</option></select>
    <label>Metode pembayaran</label><select id="pay"><option value="wallet">Saldo Mokbang (${rp(user.balance)})</option><option value="cash">Tunai</option><option value="transfer">Transfer</option></select><br><br>
    <button class="btn" onclick="placeOrder()">Pesan sekarang</button> <button class="btn red" onclick="cart={place:null,items:{}};saveCart();cartView();nav()">Kosongkan</button></div>`;
}
window.placeOrder = () => guard(async () => {
  await api("/orders", "POST", {place_id: cart.place, mode: $("#mode").value, payment: $("#pay").value, items: Object.entries(cart.items).map(([id, i]) => ({id: +id, qty: i.qty}))});
  cart = {place: null, items: {}}; saveCart(); user = await api("/me"); toast("Pesanan berhasil dibuat"); go("#/orders");
});

async function ordersView() {
  if (!user) return go("#/login");
  const os = await api("/orders");
  $("#app").innerHTML = `<h1>Pesanan saya</h1>` + (os.map(o => `<div class="card" style="margin-bottom:12px"><div class="row"><b>#${o.id} · ${esc(o.place_name)}</b><span class="badge ${o.status}">${STATUS[o.status]}</span></div>
    ${o.items.map(i => `<div class="mut">${esc(i.name)} × ${i.qty}</div>`).join("")}
    <div class="row"><span class="mut">${o.created} · ${o.mode === "dine_in" ? "Makan di tempat" : "Bawa pulang"} · ${o.payment}</span><b>${rp(o.total)}</b></div>
    ${o.status === "pending" ? `<button class="btn red" onclick="cancelOrder(${o.id})">Batalkan pesanan</button>` : ""}</div>`).join("") || `<p class="mut">Belum ada pesanan.</p>`);
}
window.cancelOrder = id => guard(async () => { if (!confirm("Batalkan pesanan ini?")) return; await api(`/orders/${id}/cancel`, "POST"); user = await api("/me"); toast("Pesanan dibatalkan"); ordersView(); });

async function reserveView() {
  if (!user) return go("#/login");
  const [ps, rs] = await Promise.all([api("/places"), api("/reservations")]);
  const today = new Date().toISOString().slice(0, 10);
  $("#app").innerHTML = `<h1>Reservasi meja</h1><div class="form"><label>Tempat</label><select id="rp">${ps.filter(p => p.category !== "grocery").map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select>
    <label>Tanggal</label><input id="rd" type="date" min="${today}" value="${today}"><label>Dewasa</label><input id="ra" type="number" min="1" value="2"><label>Anak-anak</label><input id="rk" type="number" min="0" value="0"><br><br>
    <button class="btn" onclick="book()">Reservasi</button></div><h2>Reservasi saya</h2>
    ${rs.map(r => `<div class="row"><span>${esc(r.place_name)} · ${r.date} · ${r.adults} dewasa, ${r.kids} anak</span><span class="badge booked">${STATUS[r.status]}</span></div>`).join("") || `<p class="mut">Belum ada reservasi.</p>`}`;
}
window.book = () => guard(async () => { await api("/reservations", "POST", {place_id: +$("#rp").value, date: $("#rd").value, adults: +$("#ra").value, kids: +$("#rk").value}); toast("Reservasi berhasil"); reserveView(); });

function loginView(mode = "login") {
  $("#app").innerHTML = `<div class="form"><h1>${mode === "login" ? "Masuk" : "Daftar"}</h1>${mode === "register" ? `<label>Nama</label><input id="n">` : ""}
    <label>Email</label><input id="e" type="email"><label>Password</label><input id="p" type="password"><br><br>
    <button class="btn" onclick="auth('${mode}')">${mode === "login" ? "Masuk" : "Daftar"}</button>
    <p class="mut">${mode === "login" ? `Belum punya akun? <a href="#" onclick="loginView('register');return false"><u>Daftar</u></a>` : `Sudah punya akun? <a href="#" onclick="loginView('login');return false"><u>Masuk</u></a>`}</p></div>`;
}
window.auth = m => guard(async () => { user = await api("/" + m, "POST", {name: $("#n")?.value, email: $("#e").value, password: $("#p").value}); toast("Selamat datang, " + user.name); go("#/"); });

function profileView() {
  if (!user) return go("#/login");
  $("#app").innerHTML = `<h1>Profil</h1><div class="form"><p class="mut">${esc(user.email)} · Saldo <b>${rp(user.balance)}</b></p><label>Nama</label><input id="pn" value="${esc(user.name)}">
    <label>Password lama</label><input id="po" type="password"><label>Password baru</label><input id="pw" type="password"><br><br><button class="btn" onclick="saveProfile()">Simpan</button></div>`;
}
window.saveProfile = () => guard(async () => { user = await api("/me", "PUT", {name: $("#pn").value, old_password: $("#po").value, new_password: $("#pw").value}); toast("Profil diperbarui"); nav(); profileView(); });

async function adminView() {
  if (user?.role !== "admin") return go("#/");
  const [rep, os, ps] = await Promise.all([api("/report"), api("/orders"), api("/places")]);
  const items = await Promise.all(ps.map(p => api("/places/" + p.id)));
  $("#app").innerHTML = `<h1>Dashboard admin</h1><div class="stats"><div class="card stat"><span class="mut">Pesanan aktif</span><b>${rep.totals.orders}</b></div>
    <div class="card stat"><span class="mut">Pendapatan</span><b>${rp(rep.totals.revenue)}</b></div></div>
    <h2>Laporan per tempat</h2><div class="card">${rep.top_places.map(t => `<div class="row"><span>${esc(t.name)} (${t.orders} pesanan)</span><b>${rp(t.revenue)}</b></div>`).join("") || `<span class="mut">Belum ada transaksi.</span>`}</div>
    <h2>Kelola pesanan</h2><div class="scroll"><table><tr><th>#</th><th>Pelanggan</th><th>Tempat</th><th>Total</th><th>Status</th></tr>${os.map(o => `<tr><td>${o.id}</td><td>${esc(o.user_name)}</td><td>${esc(o.place_name)}</td><td>${rp(o.total)}</td>
      <td><select onchange="setStatus(${o.id},this.value)">${Object.keys(STATUS).filter(s => s !== "booked").map(s => `<option value="${s}" ${s === o.status ? "selected" : ""}>${STATUS[s]}</option>`).join("")}</select></td></tr>`).join("")}</table></div>
    <h2>Kelola menu</h2><div class="card form" style="max-width:none"><select id="ap">${ps.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select>
      <label>Nama menu</label><input id="an"><label>Harga (Rp)</label><input id="ar" type="number" min="1"><label>Emoji</label><input id="ae" maxlength="4"><br><br><button class="btn dark" onclick="addItem()">Tambah menu</button></div>
    ${items.map(p => `<h2>${p.emoji} ${esc(p.name)}</h2><div class="card">${p.items.map(i => `<div class="row"><span>${i.emoji} ${esc(i.name)} · ${rp(i.price)}</span><button class="btn red" onclick="delItem(${i.id})">Hapus</button></div>`).join("")}</div>`).join("")}`;
}
window.setStatus = (id, status) => guard(async () => { await api(`/orders/${id}/status`, "PUT", {status}); toast("Status diperbarui"); });
window.addItem = () => guard(async () => { await api("/items", "POST", {place_id: +$("#ap").value, name: $("#an").value, price: +$("#ar").value, emoji: $("#ae").value}); toast("Menu ditambahkan"); adminView(); });
window.delItem = id => guard(async () => { if (confirm("Hapus menu ini?")) { await api("/items/" + id, "DELETE"); adminView(); } });

// ---------- router ----------
async function route() {
  const h = location.hash || "#/"; nav();
  await guard(async () => {
    if (h.startsWith("#/place/")) await placeView(+h.split("/")[2]);
    else if (h === "#/cart") await cartView();
    else if (h === "#/orders") await ordersView();
    else if (h === "#/reserve") await reserveView();
    else if (h === "#/profile") profileView();
    else if (h === "#/admin") await adminView();
    else if (h === "#/login") loginView();
    else await home();
  });
}
window.addEventListener("hashchange", route);
(async () => { try { user = await api("/me"); } catch {} route(); })();
