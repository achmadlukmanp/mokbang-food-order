# Mokbang: Website-Based Online Food Ordering

Mokbang is a full-stack web application for ordering food from fast-food outlets and warung, buying groceries, and reserving tables online. The project is based on the research paper *Rancang Jual Beli Online Makanan Berbasis Website Menggunakan Metodologi Scrum* (SITASI 2023), which designed the system using the Scrum methodology.

## Features

**Customers**
- Register, log in, edit profile, and change password
- Browse places by category: Fast Food, Warung, and Groceries
- Add items to a cart and check out (dine in or take away)
- Pay with Mokbang balance, cash, or bank transfer
- View order history and cancel pending orders (wallet payments are refunded)
- Reserve a table with date and number of adults and children

**Admin**
- Sales report: total orders, revenue, and top places
- Manage orders by updating their status (pending, processing, done, cancelled)
- Add and delete menu items

**Security**
- Passwords are hashed
- Order totals are calculated on the server from database prices
- Admin endpoints are protected by role checks on the back end

## Tech Stack

| Layer | Technology |
|---|---|
| Back end | Python, Flask |
| Database | SQLite (created automatically) |
| Front end | HTML, CSS, vanilla JavaScript (single-page, hash routing) |
| Deployment | Docker, Gunicorn |

## Project Structure

```
.
├── app.py              # Flask API, database schema, seed data
├── requirements.txt
├── Dockerfile
├── static/
│   ├── index.html
│   ├── style.css
│   └── app.js          # All views and client-side logic
├── mokbang.html        # Portfolio project page
└── assets/             # Design mockups and research paper
```

## Run Locally

Requires Python 3.9 or newer.

```bash
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
python app.py
```

Open http://localhost:5000.

## Demo Accounts

| Role | Email | Password |
|---|---|---|
| Admin | admin@mokbang.id | admin123 |
| User | Register a new account | New accounts start with Rp100,000 balance |

> Change the admin password and set a `SECRET_KEY` environment variable before deploying for real users.

## API Overview

| Method | Endpoint | Access |
|---|---|---|
| POST | `/api/register`, `/api/login`, `/api/logout` | Public |
| GET, PUT | `/api/me` | User |
| GET | `/api/places`, `/api/places/<id>` | Public |
| POST, GET | `/api/orders` | User (admin sees all) |
| POST | `/api/orders/<id>/cancel` | User |
| PUT | `/api/orders/<id>/status` | Admin |
| POST, GET | `/api/reservations` | User |
| POST, DELETE | `/api/items`, `/api/items/<id>` | Admin |
| GET | `/api/report` | Admin |

## Design Mockups

Early UI mockups from the Scrum design phase are in the `assets/` folder (for example `mokbang_02.jpg` for the home page and `mokbang_07.jpg` for the order list).

## Deploy with Docker

```bash
docker build -t mokbang .
docker run -p 7860:7860 -e SECRET_KEY=your-random-secret mokbang
```

The app is then available at http://localhost:7860. The same `Dockerfile` works for a Hugging Face Space with the Docker SDK.

## Limitations

- Payments are simulated
- No map, voucher, or delivery features yet
- SQLite data is not persistent on free container hosting that resets on restart

## Authors

Alfarisqi, M. R., Prayogidianto, A. L., and Akbar, N. F. Universitas Pembangunan Nasional "Veteran" Jawa Timur, 2023.

Full-stack implementation by Achmad Lukman Prayogidianto.
