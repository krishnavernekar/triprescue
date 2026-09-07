# 🛡️ TripRescue — TripShield

**Predictive Autonomous Travel Disruption Recovery Agent**

> *"Don't wait for the trip to fail. Recover it before you are stranded."*

---

## 🌟 Executive Summary

**TripRescue** is an agentic AI-powered travel disruption recovery platform built for high-stakes journeys. Unlike conventional chatbots, flight search tools, or booking aggregators, TripRescue operates as an **autonomous decision & recovery agent** governed by authoritative deterministic constraint engines.

When an upstream disruption occurs (e.g. flight delay or cancellation), **TripShield** predicts downstream cascade failures across multimodal connections (flights, trains, buses, and emergency transit hotels), generates feasible alternative recovery plans, verifies physical transfer viability, evaluates insurance and compensation eligibility, and prepares a one-click verified external handoff for user approval.

---

## 🔑 Key Architecture Principles & Safety Guarantees

1. **Deterministic Authority**: All hard constraints (budget limits, arrival deadlines, seat capacity, physical connection times) are enforced by deterministic validators. LLM reasoning suggests candidate strategies, but can **never** override deterministic safety rules.
2. **Predictive Cascade Impact**: Evaluates transfer buffer compression and downstream connection failures *before* the traveler is physically stranded.
3. **Multimodal Autonomy**: Seamlessly adapts across Direct Flights, Connecting Flights, Alternate Airports, High-Speed Trains (Vande Bharat / Shatabdi), Express Buses, and Emergency Transit Hotels.
4. **Zero Automated Payments & Zero Automated Booking**: TripRescue does not process payments or book tickets autonomously. All plans require explicit traveler approval before opening official provider portals.
5. **Zero Fabricated Booking Links**: Deeplinks are validated against official domain allowlists; arbitrary redirects and unsafe protocols (`javascript:`, `data:`, etc.) are blocked.
6. **Immutable What-If Simulations**: Hypothetical delay/cancellation scenarios clone session state in memory and never mutate live MongoDB records or trigger side-effects.
7. **Bounded Monitoring with Fingerprint Deduplication**: Continuous trip monitoring suppresses repeated duplicate alerts and caps automated replanning at 3 iterations to prevent infinite loops.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 19, Vite, Tailwind CSS, Heroicons |
| **Backend** | Node.js 22, Express 4, Mongoose 8 |
| **Database** | MongoDB |
| **AI / LLM** | Google Gemini 1.5 / Flash with structured Function Calling & Tool Calling |
| **Live APIs** | Aviationstack (Flights), Google Maps / Routes API (Ground Transfers) |
| **Realtime** | Server-Sent Events (SSE) |
| **Testing** | Node.js native test runner (`node --test`), 18 test suites, 191 automated tests |

---

## 🚀 Quick Start Guide

### Prerequisites
- Node.js >= 18.0.0
- MongoDB (Running locally on `mongodb://localhost:27017` or MongoDB Atlas)
- npm or yarn

### 1. Installation

```bash
# Clone repository
cd triprescue

# Install Backend Dependencies
cd server
npm install

# Install Frontend Dependencies
cd ../client
npm install
```

### 2. Environment Configuration

Copy `.env.example` in `server/`:

```bash
cp server/.env.example server/.env
```

**Default Demo Mode Settings (Zero API keys required):**
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/triprescue
NODE_ENV=development
DEMO_MODE=true
REAL_PROVIDERS_ENABLED=false
LLM_ENABLED=false
```

**Live API Mode Settings (Optional):**
```env
REAL_PROVIDERS_ENABLED=true
AVIATIONSTACK_API_KEY=your_aviationstack_key
GOOGLE_MAPS_API_KEY=your_google_routes_key
LLM_ENABLED=true
GEMINI_API_KEY=your_gemini_api_key
```

### 3. Running the Application

```bash
# Start Backend (Port 5000)
cd server
npm start

# In a separate terminal, start Frontend (Port 5173)
cd client
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## 🧪 Testing & Verification

Run the full automated test suite across all 15 architecture phases:

```bash
cd server
npm test
```

Build the production frontend bundle:

```bash
cd client
npm run build
```

---

## 📋 Primary Hackathon Demo Script (BLR → DEL → JAI)

1. **Dashboard & Traveler Objective**:
   - Open dashboard and view traveler **Ananya Sharma**.
   - Journey: `BLR → DEL → JAI`, Arrival Deadline: `22:00`, Max Additional Budget: `₹5,000`.
2. **Trigger Disruption**:
   - Upstream flight `6E-101` (BLR → DEL) suffers a 60-minute delay.
3. **TripShield Cascade Prediction**:
   - TripShield detects transfer window at DEL compressed to 15 min (< 60 min MCT).
   - Risk score spikes to **CRITICAL**.
4. **Autonomous Agent Recovery**:
   - Agent attempts `DIRECT_FLIGHT` → rejected due to ₹7,000 cost (`BUDGET_EXCEEDED`).
   - Agent adapts strategy to `FLIGHT_PLUS_TRAIN` (Vande Bharat Express NDLS → JAI).
   - Candidate evaluated: Cost ₹1,600, arrives at 17:30 (before deadline), transfer buffer verified.
5. **What-If Simulation**:
   - Click "Simulate What-If", inject `+60m Delay`.
   - View live cascade prediction with zero mutation to active trip database.
6. **Continuous Monitoring**:
   - Start background monitoring; demonstrate real-time change detection and alert deduplication.
7. **User Approval & Secure Handoff**:
   - Click "Approve Plan", then "Open Provider Handoff".
   - Official IRCTC portal link is opened securely with audit log confirmation.

---

## 📚 Architectural Documentation

- [`docs/architecture.md`](file:///d:/TripShield/triprescue/docs/architecture.md) — System Architecture Overview
- [`docs/agent-loop.md`](file:///d:/TripShield/triprescue/docs/agent-loop.md) — 8-Stage Autonomous Agent Loop
- [`docs/provider-architecture.md`](file:///d:/TripShield/triprescue/docs/provider-architecture.md) — Multimodal Provider Abstractions
- [`docs/recovery-engine.md`](file:///d:/TripShield/triprescue/docs/recovery-engine.md) — Deterministic Constraint & Risk Engine
- [`docs/demo-scenarios.md`](file:///d:/TripShield/triprescue/docs/demo-scenarios.md) — 10 Deterministic Scenarios & Primary Demo
- [`docs/api.md`](file:///d:/TripShield/triprescue/docs/api.md) — Complete REST API Catalog
