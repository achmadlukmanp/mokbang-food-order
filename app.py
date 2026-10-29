import os, sqlite3
from datetime import datetime
from functools import wraps
from flask import Flask, g, jsonify, request, session
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__, static_folder="static", static_url_path="")
app.secret_key = os.environ.get("SECRET_KEY", "ganti-dengan-secret-acak")
DB = os.environ.get("DB_PATH", "mokbang.db")
STATUSES = ("pending", "processing", "done", "cancelled")

SCHEMA = """
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT, email TEXT UNIQUE,
  password TEXT, role TEXT DEFAULT 'user', balance INTEGER DEFAULT 100000);
CREATE TABLE IF NOT EXISTS places(id INTEGER PRIMARY KEY, name TEXT, category TEXT,
  emoji TEXT, rating REAL, address TEXT);
CREATE TABLE IF NOT EXISTS items(id INTEGER PRIMARY KEY, place_id INTEGER, name TEXT,
  price INTEGER, emoji TEXT);
CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY, user_id INTEGER, place_id INTEGER,
  total INTEGER, status TEXT DEFAULT 'pending', mode TEXT, payment TEXT, created TEXT);
CREATE TABLE IF NOT EXISTS order_items(order_id INTEGER, name TEXT, price INTEGER, qty INTEGER);
CREATE TABLE IF NOT EXISTS reservations(id INTEGER PRIMARY KEY, user_id INTEGER, place_id INTEGER,
  date TEXT, adults INTEGER, kids INTEGER, status TEXT DEFAULT 'booked');
"""

SEED = [  # (name, category, emoji, rating, address, [(item, price, emoji)])
 ("Burger Corner", "fast_food", "🍔", 4.6, "Jl. Arif Rahman Hakim, Surabaya",
  [("Cheeseburger", 28000, "🍔"), ("French Fries", 15000, "🍟"), ("Cola", 9000, "🥤")]),
 ("Crispy Chicken House", "fast_food", "🍗", 4.5, "Jl. Raya Darmo, Surabaya",
  [("Paket 2 Ayam", 36000, "🍗"), ("Chicken Wings", 22000, "🍖"), ("Es Teh", 6000, "🧋")]),
 ("Pizza Station", "fast_food", "🍕", 4.4, "Jl. Ngagel, Surabaya",
  [("Pizza Pepperoni", 65000, "🍕"), ("Pasta Carbonara", 42000, "🍝")]),
 ("Warung Geprek Bu Choy", "warung", "🌶️", 4.7, "Jl. Gebang Putih, Surabaya",
  [("Ayam Geprek", 17000, "🍗"), ("Nasi Putih", 5000, "🍚"), ("Es Jeruk", 6000, "🍊")]),
 ("Nasi Padang Murah", "warung", "🍛", 4.8, "Jl. Keputih, Surabaya",
  [("Nasi + Ayam Goreng", 17000, "🍛"), ("Nasi + Rendang", 18000, "🥘"), ("Es Teh Manis", 5000, "🧋")]),
 ("Mart Sejahtera", "grocery", "🛒", 4.5, "Jl. Keputih Tegal, Surabaya",
  [("Minyak Goreng 1L", 19000, "🛢️"), ("Susu UHT 1L", 18000, "🥛"), ("Mi Instan", 3500, "🍜")]),
 ("Pasar Segar Online", "grocery", "🥬", 4.3, "Jl. Mulyorejo, Surabaya",
  [("Telur 1 kg", 29000, "🥚"), ("Beras 5 kg", 72000, "🌾")]),
]

def db():
    if "db" not in g:
        g.db = sqlite3.connect(DB)
        g.db.row_factory = sqlite3.Row
    return g.db

@app.teardown_appcontext
def close_db(_):
    d = g.pop("db", None)
    if d: d.close()

def q(sql, args=(), one=False):
    cur = db().execute(sql, args)
    rows = [dict(r) for r in cur.fetchall()]
    return (rows[0] if rows else None) if one else rows

def run(sql, args=()):
    cur = db().execute(sql, args); db().commit(); return cur.lastrowid

def init_db():
    c = sqlite3.connect(DB); c.executescript(SCHEMA)
    if not c.execute("SELECT 1 FROM users").fetchone():
        c.execute("INSERT INTO users(name,email,password,role,balance) VALUES(?,?,?,?,?)",
                  ("Admin", "admin@mokbang.id", generate_password_hash("admin123"), "admin", 0))
        for n, cat, e, r, a, items in SEED:
            pid = c.execute("INSERT INTO places(name,category,emoji,rating,address) VALUES(?,?,?,?,?)",
                            (n, cat, e, r, a)).lastrowid
            c.executemany("INSERT INTO items(place_id,name,price,emoji) VALUES(?,?,?,?)",
                           [(pid, *i) for i in items])
    c.commit(); c.close()

def me():
    return q("SELECT id,name,email,role,balance FROM users WHERE id=?", (session.get("uid"),), one=True) if session.get("uid") else None

def need(role=None):
    def deco(f):
        @wraps(f)
        def w(*a, **k):
            u = me()
            if not u: return jsonify(error="Silakan login terlebih dahulu"), 401
            if role and u["role"] != role: return jsonify(error="Akses ditolak"), 403
            return f(u, *a, **k)
        return w
    return deco

def err(msg, code=400): return jsonify(error=msg), code

# ---------- auth ----------
@app.post("/api/register")
def register():
    d = request.get_json(force=True)
    name, email, pw = (d.get("name") or "").strip(), (d.get("email") or "").strip().lower(), d.get("password") or ""
    if not name or "@" not in email or len(pw) < 6: return err("Nama, email valid, dan password minimal 6 karakter wajib diisi")
    if q("SELECT 1 FROM users WHERE email=?", (email,), one=True): return err("Email sudah terdaftar")
    session["uid"] = run("INSERT INTO users(name,email,password) VALUES(?,?,?)", (name, email, generate_password_hash(pw)))
    return jsonify(me())

@app.post("/api/login")
def login():
    d = request.get_json(force=True)
    u = q("SELECT * FROM users WHERE email=?", ((d.get("email") or "").strip().lower(),), one=True)
    if not u or not check_password_hash(u["password"], d.get("password") or ""): return err("Email atau password salah", 401)
    session["uid"] = u["id"]; return jsonify(me())

@app.post("/api/logout")
def logout(): session.clear(); return jsonify(ok=True)

@app.get("/api/me")
def get_me(): return jsonify(me())

@app.put("/api/me")
@need()
def update_me(u):
    d = request.get_json(force=True)
    if d.get("name", "").strip(): run("UPDATE users SET name=? WHERE id=?", (d["name"].strip(), u["id"]))
    if d.get("new_password"):
        row = q("SELECT password FROM users WHERE id=?", (u["id"],), one=True)
        if not check_password_hash(row["password"], d.get("old_password") or ""): return err("Password lama salah")
        if len(d["new_password"]) < 6: return err("Password baru minimal 6 karakter")
        run("UPDATE users SET password=? WHERE id=?", (generate_password_hash(d["new_password"]), u["id"]))
    return jsonify(me())

# ---------- katalog ----------
@app.get("/api/places")
def places():
    cat = request.args.get("category")
    return jsonify(q("SELECT * FROM places WHERE category=?" if cat else "SELECT * FROM places", (cat,) if cat else ()))

@app.get("/api/places/<int:pid>")
def place(pid):
    p = q("SELECT * FROM places WHERE id=?", (pid,), one=True)
    if not p: return err("Tempat tidak ditemukan", 404)
    p["items"] = q("SELECT * FROM items WHERE place_id=?", (pid,)); return jsonify(p)

# ---------- pesanan ----------
@app.post("/api/orders")
@need()
def create_order(u):
    d = request.get_json(force=True)
    place_id, mode, pay = d.get("place_id"), d.get("mode", "dine_in"), d.get("payment", "cash")
    lines, total = [], 0
    for it in d.get("items", []):
        row = q("SELECT * FROM items WHERE id=? AND place_id=?", (it.get("id"), place_id), one=True)
        qty = int(it.get("qty", 0))
        if row and 0 < qty <= 50: lines.append((row, qty)); total += row["price"] * qty
    if not lines: return err("Keranjang kosong")
    if mode not in ("dine_in", "take_away") or pay not in ("cash", "wallet", "transfer"): return err("Pilihan tidak valid")
    if pay == "wallet":
        if u["balance"] < total: return err("Saldo tidak cukup")
        run("UPDATE users SET balance=balance-? WHERE id=?", (total, u["id"]))
    oid = run("INSERT INTO orders(user_id,place_id,total,mode,payment,created) VALUES(?,?,?,?,?,?)",
              (u["id"], place_id, total, mode, pay, datetime.now().strftime("%Y-%m-%d %H:%M")))
    for row, qty in lines: run("INSERT INTO order_items VALUES(?,?,?,?)", (oid, row["name"], row["price"], qty))
    return jsonify(id=oid, total=total), 201

@app.get("/api/orders")
@need()
def orders(u):
    sql = """SELECT o.*, p.name AS place_name, u.name AS user_name FROM orders o
             JOIN places p ON p.id=o.place_id JOIN users u ON u.id=o.user_id"""
    rows = q(sql + (" ORDER BY o.id DESC" if u["role"] == "admin" else " WHERE o.user_id=? ORDER BY o.id DESC"),
             () if u["role"] == "admin" else (u["id"],))
    for o in rows: o["items"] = q("SELECT name,price,qty FROM order_items WHERE order_id=?", (o["id"],))
    return jsonify(rows)

@app.post("/api/orders/<int:oid>/cancel")
@need()
def cancel(u, oid):
    o = q("SELECT * FROM orders WHERE id=? AND user_id=?", (oid, u["id"]), one=True)
    if not o: return err("Pesanan tidak ditemukan", 404)
    if o["status"] != "pending": return err("Hanya pesanan berstatus pending yang bisa dibatalkan")
    run("UPDATE orders SET status='cancelled' WHERE id=?", (oid,))
    if o["payment"] == "wallet": run("UPDATE users SET balance=balance+? WHERE id=?", (o["total"], u["id"]))
    return jsonify(ok=True)

@app.put("/api/orders/<int:oid>/status")
@need("admin")
def set_status(u, oid):
    s = request.get_json(force=True).get("status")
    if s not in STATUSES: return err("Status tidak valid")
    run("UPDATE orders SET status=? WHERE id=?", (s, oid)); return jsonify(ok=True)

# ---------- reservasi ----------
@app.post("/api/reservations")
@need()
def reserve(u):
    d = request.get_json(force=True)
    try: datetime.strptime(d.get("date", ""), "%Y-%m-%d")
    except ValueError: return err("Tanggal tidak valid")
    if not q("SELECT 1 FROM places WHERE id=? AND category!='grocery'", (d.get("place_id"),), one=True): return err("Tempat tidak valid")
    run("INSERT INTO reservations(user_id,place_id,date,adults,kids) VALUES(?,?,?,?,?)",
        (u["id"], d["place_id"], d["date"], max(1, int(d.get("adults", 1))), max(0, int(d.get("kids", 0)))))
    return jsonify(ok=True), 201

@app.get("/api/reservations")
@need()
def reservations(u):
    sql = "SELECT r.*, p.name AS place_name FROM reservations r JOIN places p ON p.id=r.place_id"
    return jsonify(q(sql + ("" if u["role"] == "admin" else " WHERE r.user_id=?") + " ORDER BY r.id DESC",
                     () if u["role"] == "admin" else (u["id"],)))

# ---------- admin ----------
@app.post("/api/items")
@need("admin")
def add_item(u):
    d = request.get_json(force=True)
    if not d.get("name") or int(d.get("price", 0)) <= 0: return err("Nama dan harga wajib diisi")
    run("INSERT INTO items(place_id,name,price,emoji) VALUES(?,?,?,?)", (d["place_id"], d["name"], int(d["price"]), d.get("emoji") or "🍽️"))
    return jsonify(ok=True), 201

@app.delete("/api/items/<int:iid>")
@need("admin")
def del_item(u, iid): run("DELETE FROM items WHERE id=?", (iid,)); return jsonify(ok=True)

@app.get("/api/report")
@need("admin")
def report(u):
    return jsonify(
        totals=q("SELECT COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue FROM orders WHERE status!='cancelled'", one=True),
        by_status=q("SELECT status, COUNT(*) AS n FROM orders GROUP BY status"),
        top_places=q("""SELECT p.name, COUNT(*) AS orders, SUM(o.total) AS revenue FROM orders o
                        JOIN places p ON p.id=o.place_id WHERE o.status!='cancelled'
                        GROUP BY p.id ORDER BY revenue DESC LIMIT 5"""))

@app.get("/")
def index(): return app.send_static_file("index.html")

init_db()
if __name__ == "__main__":
    app.run(debug=True, port=5000)
