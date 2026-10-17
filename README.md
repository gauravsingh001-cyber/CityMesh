# 🛍️ CityMesh — Hyper-Local Live Commerce Mesh

A working prototype of the **Hyper-Local Live Commerce Mesh** — a system that lets a
person type/say a shopping list, instantly "pings" nearby local shops for stock
availability, and shows a live, smart-ranked result — built for the Gemini event pitch.

This is a **fully working local prototype** (not just mockup screens). It has been
built and tested end-to-end following the exact roadmap:

1. User types a shopping list →
2. Gemini (or local fallback engine) parses it into items + categories →
3. System broadcasts a ping to nearby matching shops →
4. Shopkeepers respond Yes / No / Partial in real time →
5. User sees a live, ranked result (shops that say "Yes" more often rank higher) →

Everything runs locally on your machine — no cloud deployment needed for the demo.

---

## 🧱 Tech Stack Used (in this prototype)

| Layer | Technology |

| Backend | Node.js + Express |
| Real-time | Socket.io (WebSockets) |
| AI Parsing | Google Gemini API (`gemini-2.5-flash`) — **optional**, with automatic local fallback |
| Frontend | Plain HTML/CSS/JS (no build step) + **Leaflet.js (Interactive Maps)** |
| Data | In-memory + JSON file (`data/shops.json`) acting as a mock database |

> Note: The original roadmap mentioned React Native/Flutter + MongoDB/Redis for a
> full production app. For a **demo-ready prototype you can run today**, this project
> uses a lightweight web-based equivalent that shows the *exact same working flow* —
> it can be migrated to that full stack later without changing the core logic.

---

## 📁 Project Structure

```
citymesh/
├── server.js              → Main backend: API routes + Socket.io real-time logic
├── gemini.js               → Gemini API integration + local fallback parser
├── package.json
├── data/
│   └── shops.json          → Dummy local shops dataset (7 shops across 4 categories)
└── public/
    ├── index.html           → User view (type shopping list, see live results)
    ├── shopkeeper.html       → Shopkeeper dashboard (respond Yes/No/Partial)
    ├── app.js                → User-side frontend logic
    ├── shopkeeper.js         → Shopkeeper-side frontend logic
    └── style.css             → Shared styling
```

---

## ▶️ How to Run This Locally

### Step 1 — Install Node.js
Make sure Node.js (v18 or newer) is installed. Check with:
```bash
node -v
```
If not installed, download from [nodejs.org](https://nodejs.org).

### Step 2 — Install dependencies
Open a terminal inside the `citymesh` folder and run:
```bash
npm install
```

### Step 3 — Start the server
```bash
npm start
```
You should see:
```
CityMesh server running at http://localhost:3000
```

## LIVE PROJECT 
PROJECT LINK :- https://citymesh.onrender.com/

## 🎬 Demo Script (for your mentor)

1. In the **User tab**, type: `Koflet syrup, Class 10 notebook, Amul milk`
2. Click **"🔍 Parse My List"** → shows items auto-categorized (Medical / Stationery / Grocery)
3. Click **"📡 Broadcast to Nearby Shops"** → pings are sent instantly to matching shops
4. Switch to the **Shopkeeper tab**, select a shop from the dropdown (e.g. "Sharma Medical Hall")
   → you'll see the incoming ping appear **live** (no refresh needed)
5. Click **"✅ Yes"** on a ping
6. Switch back to the **User tab** → the result updates live, showing that shop marked
   "✅ In Stock" with distance and a growing "⭐ successful matches" score
7. Click on any shop in the results to open the **Interactive Map**, showing its real-time location and routing details (powered by Leaflet & OpenStreetMap).
8. Repeat with a different shop/shop category to show multiple categories working
   in parallel, and try marking one shop "❌ No" to show it gets deprioritized in ranking

This demonstrates the **entire core loop** from your original idea: no shop-to-shop
wandering, no personal phone numbers needed, and shops that reliably say "yes" get
smart-ranked to the top over time.

---

## 🤖 Enabling the Real Gemini API (optional)

By default, the project runs with a **local fallback parser** (simple keyword matching)
so it works instantly with zero setup — you'll see a note on-screen saying
`⚙️ Parsed using local fallback engine`.

To use the **real Gemini API** for smarter, multilingual, natural-language parsing:

1. Get a free API key from [Google AI Studio](https://aistudio.google.com/apikey)
2. Open the `.env` file in the project folder and paste your key:
   ```env
   GEMINI_API_KEY="your_actual_key_here"
   ```
3. Restart your server if it's already running.

3. Restart the server. The app will now show `✅ Parsed using Gemini API` and will
   correctly handle messier input, like voice-transcribed text, Hindi/Hinglish lists,
   or unusual phrasing — exactly as described in your Gemini-integration answer.

If the Gemini API call fails for any reason (bad key, no internet, rate limit), the
app **automatically falls back** to the local parser so your demo never breaks.

---

## 🧠 What's Simulated vs. What's Real in This Prototype

| Feature | Status |
|---|---|
| Shopping list parsing (Gemini + fallback) | ✅ Fully real |
| Category-based routing to matching shops | ✅ Fully real |
| Real-time ping delivery (WebSockets) | ✅ Fully real |
| Shopkeeper Yes/No/Partial response flow | ✅ Fully real |
| Smart ranking (shops that say Yes rank higher) | ✅ Fully real |
| Interactive Maps & Routing | ✅ Fully real (via Leaflet.js & OpenStreetMap) |
| Shop locations / distances | 🟡 Mock data (`data/shops.json`) — swap in real shop database for production |
| Push notifications to a real phone | 🟡 Simulated via in-browser real-time updates — swap in Firebase Cloud Messaging for a real mobile app |
| User/Merchant login | ⬜ Not built (out of scope for this demo) — add auth (Firebase Auth / JWT) for production |

---

## 🚀 Next Steps Toward the Full Production Roadmap

Once this prototype is validated with your mentor, migrate it in this order:
1. Move `data/shops.json` → PostgreSQL/MongoDB with a real shop-onboarding flow
2. Replace mock lat/lng distance with real Google Maps Distance Matrix API
3. Replace Socket.io web push with Firebase Cloud Messaging for native mobile push
4. Rebuild the frontend in React Native / Flutter for actual app store deployment
5. Add user/merchant authentication and shop verification

---

**Built for:** Gemini Event Pitch — "Our Markets" reimagination
**Core idea:** Turn local markets into a real-time, Gemini-powered inventory mesh — no more shop-to-shop wandering, no more personal phone numbers, just open the app.

---

# 🚀 CityMesh: The Winning Pitch & Presentation Guide
*(Optimized for Judging Criteria)*

This document is specifically structured to directly answer the 5 Judging Criteria (Vision, Real-life relevance, Built with Gemini, Future focused, Execution). When presenting to the judges or investors, use these exact points to prove why CityMesh is a winning concept.

## 🌟 1. Vision (30%): The Conceptual Leap
*Does it reframe how we see the problem?*

**The Old Way:** Tech companies try to "digitize" local shops by forcing them to use complex inventory management apps. This fails because Kirana owners don't have the time to manually update digital catalogs every time they sell a packet of biscuits. 
**The Conceptual Leap:** CityMesh completely reframes the problem. Instead of asking shops "What is your entire inventory?" (Static Catalog), CityMesh asks "Do you have THIS specific item right now?" (Live Ping Commerce).

We have shifted from a Static Database model to a Real-Time Intent model. By treating local shops as a live, connected "Mesh", we bypass the impossible inventory problem entirely.

## 🌍 2. Real-life Relevance (20%): Solving a Real Community Need
*Solves a real community need, not a hypothetical one.*

**What problem does it solve?**
- **For the Community:** The "Uncertainty of Stock". If you need a specific hardware tool or a rare medicine, you currently have to physically wander from shop to shop, or call multiple numbers, wasting time.
- **For Local Economy:** Small, unorganized neighborhood shops (Kirana, Pharmacy, Hardware) are dying because they are losing customers to Quick-Commerce giants (Zepto, Blinkit). They lack a digital storefront to compete.

**Who can use it?**
- **The Consumer:** Anyone (students, working professionals, parents) who wants to buy items instantly while commuting, supporting local businesses without the hassle of waiting in queues or searching multiple shops.
- **The Shopkeeper:** The local merchant who doesn't know how to use complex software. They don't need to do any data entry. They just hear a notification and tap "✅ Yes" or "❌ No" on their phone screen.

## 🤖 3. Built with Gemini (20%)
*How Gemini was used to design and power the solution.*

CityMesh wouldn't work without Google Gemini (`gemini-2.5-flash`) acting as the central intelligence engine.

- **The Brain of the Routing:** A user types messy, natural language (e.g., "1 litre amul taaza aur bukhar ki dawai"). Traditional keyword search would fail here. Gemini instantly parses this human language, identifies the items, and categorizes them (Amul Taaza -> Grocery, Medicine -> Medical).
- **Design & Architecture:** Gemini was actively used to brainstorm the architecture (choosing WebSockets for 0-latency real-time pings) and design the modern, glassmorphism UI that makes the platform look premium.

## 🔮 4. Future Focused (15%)
*Gets ahead of the problem the city will have next.*

**The City's Next Problem:** The complete monopolization of retail by massive warehouses (Dark Stores), leading to the death of community commerce and local street life.

**Getting Ahead:** CityMesh prevents this by empowering existing infrastructure. The Future Roadmap to Scale:

- **Geospatial Database Migration:** Moving from static JSON to MongoDB/PostgreSQL with PostGIS. When a user requests an item, the database will instantly draw a 2km geofence around their GPS location and ping only the shops inside that polygon.
- **Escrow Payment Gateway:** Integrating Razorpay/Stripe. A user pays upfront, but the money is held safely in escrow. Once they pick up the item and share a 4-digit OTP, the money splits automatically (CityMesh commission + Shopkeeper earning). Total trust.
- **Mobile Apps:** Rebuilding the frontend in React Native and using Firebase Cloud Messaging (FCM) to wake up shopkeepers' locked phones with loud custom ringtones for incoming orders.

## ⚙️ 5. Execution (15%): Fundable and Buildable
*Someone could actually fund and build this.*

CityMesh is highly fundable because the onboarding friction for shopkeepers is practically zero (no uploading catalogs).

**How is it working right now? (The Prototype Architecture)**
You have built a fully functional, end-to-end prototype to prove the execution is possible today.

- **server.js (The Engine):** A Node.js + Express backend. It handles API requests and establishes a persistent Socket.io (WebSocket) connection with both users and shopkeepers. This allows messages to travel instantly without anyone refreshing their page.
- **gemini.js (The AI Layer):** Connects to the Gemini API to parse the user's shopping list. It even has a local fallback engine to guarantee 100% uptime during demos.
- **user.html & app.js (The Consumer Side):** Captures the user's intent, sends it to the server, and listens for WebSocket events. When a shopkeeper taps "Yes", the UI updates live, ranking that shop at the top.
- **shopkeeper.html & shopkeeper.js (The Merchant Side):** A simple dashboard that receives live pings. The shopkeeper just taps "✅ Yes, In Stock". This instantly fires a signal back through the WebSocket mesh to the user.

> **💡 Tip for the Interview:** Keep both the user tab and shopkeeper tab open side-by-side during your pitch to prove the real-time execution live!
