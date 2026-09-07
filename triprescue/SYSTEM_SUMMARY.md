# TripRescue — TripShield: Complete System Summary (Phases 0 – 5)

Generated on: 2026-09-05
Project: TripRescue — TripShield (Autonomous Travel Disruption Recovery Agent)

---

## 1. Executive Overview

**TripRescue — TripShield** is an autonomous travel disruption recovery agent designed to detect travel disruptions, evaluate downstream impacts, search multimodal alternatives (flights, trains, buses, transfers), enforce hard traveler constraints, score plan feasibility, assess journey risk, reason adaptively, and securely hand off the traveler to an external provider for booking.

### Core Architectural Principles:
1. **Decision & Recovery Layer, NOT a Booking Engine**:
   - TripRescue **never** collects credit card details, never processes payments, and never automatically purchases tickets.
   - All booking and payments take place externally on the provider's official portal.
2. **Deterministic Safety as the Final Authority**:
   - Hard constraints (origin, destination, budget limit, arrival deadline, passenger count) strictly override all scoring and LLM suggestions.
   - An invalid plan receives a score of 0 and can never be selected.
3. **Dual-Mode Operation**:
   - Operates 100% deterministically with zero external API/LLM costs by default (`DEMO_MODE=true`, `LLM_ENABLED=false`).
   - Seamlessly integrates real travel providers and Google Gemini reasoning when keys are configured.

---

## 2. Architecture Diagram

```text
                                  TRAVEL DISRUPTION DETECTED
                                              |
                                              v
                              [ RECOVERY SESSION INITIALIZED ]
                       (Itinerary Snapshot + Recovery Objective + Limits)
                                              |
                                              v
                                 RECOVERY PLANNER AGENT LOOP
       +-----------------------------------------------------------------------------+
       |                                                                             |
       |  1. OBSERVE                                                                 |
       |     * Read current state, budget margin, deadline, previous failures        |
       |                                                                             |
       |  2. DECIDE STRATEGY & ACTION                                                |
       |     * Mode A: LLM Agent (Google Gemini REST API with strict JSON schema)    |
       |     * Mode B: Deterministic DecisionEngine (Active on LLM off / fallback)   |
       |                                                                             |
       |  3. EXECUTE ACTION (FallbackManager)                                        |
       |     * Primary Provider (Live API: Aviationstack / Google Routes)            |
       |     * Fallback Provider -> Deterministic Mock Engine                        |
       |                                                                             |
       |  4. NORMALIZE & CONSTRUCT PLAN                                              |
       |     * Standardized segments tagged with data confidence (LIVE/ESTIMATED/MOCK)|
       |                                                                             |
       |  5. EVALUATE CONSTRAINTS & CONNECTIONS                                      |
       |     * ConstraintValidator (Budget, Deadline, Capacity, Accessibility)       |
       |     * ConnectionValidator (Physical transit duration + 30-min safety buffer)|
       |     * DataFreshnessValidator (Evaluates schedule staleness)                 |
       |                                                                             |
       |  6. ADAPT IF INVALID                                                        |
       |     * Dynamic strategy switching: Direct Flight -> Connecting -> Train -> Bus|
       |                                                                             |
       |  7. SCORE & RISK ASSESSMENT                                                 |
       |     * PlanScorer: Evaluates cost, duration, and convenience                 |
       |     * TripShield RiskEngine: Explainable 0-100 risk indicator               |
       |                                                                             |
       |  8. FINAL VERIFICATION                                                      |
       |     * Status -> PLAN_READY -> AWAITING_APPROVAL                             |
       +-----------------------------------------------------------------------------+
                                              |
                                              v
                             [ TWO-STAGE EXTERNAL HANDOFF ]
                                              |
                     Step 1: Explicit User Approval (POST /api/recovery/:id/approve)
                     Step 2: External Handoff Verification (POST /api/recovery/:id/handoff)
                             * Deeplink protocol check (https only)
                             * Provider domain allowlist match
                             * Status gating (blocks INVALID/STALE/REJECTED plans)
                                              |
                                              v
                              SAFE BROWSER WINDOW REDIRECT
                   (window.open to provider with noopener, noreferrer)
                                              |
                                              v
                           USER COMPLETES PURCHASE EXTERNALLY
```

---

## 3. Phase-by-Phase Implementation Details

### Phase 0 — Project Foundation
- **Monorepo Structure**:
  - `server/`: Node.js, Express, Mongoose, Jest/Node:test.
  - `client/`: React, Vite, Tailwind CSS.
- **Provider Abstraction Core**:
  - `BaseProvider.js`: Base contract for all external and mock travel services.
  - Domain providers: Flight, Train, Bus, Hotel, Route.
- **Mock Suite**: Fully reproducible deterministic test data for Indian travel corridors (`BLR -> DEL -> JAI`).
- **Core Server Infrastructure**: Error middleware, request logging, environment configurations, and health check routes.

---

### Phase 1 — Trip, Recovery Objective & State Management
- **Domain Data Models**:
  - `Trip`: Traveler details, passenger count, itinerary segments, disruption details, and lifecycle states (`DRAFT`, `ACTIVE`, `DISRUPTED`, `RECOVERING`, `RECOVERED`, `CANCELLED`, `COMPLETED`).
  - `RecoveryObjective`: Hard constraints (destination, budget ceiling, arrival deadline, passenger count) and soft preferences (mode preference, airline, comfort).
  - `RecoverySession`: State-driven recovery session snapshotting objectives, itineraries, candidate plans, rejected plans, failures, agent actions, and timeline events.
- **REST Endpoints**:
  - Full Trip CRUD (`POST /api/trips`, `GET /api/trips/:id`, `PATCH /api/trips/:id`, etc.).
  - Segment addition (`POST /api/trips/:id/segments`).
  - Disruption reporting (`POST /api/trips/:id/disruption`).
  - Session creation (`POST /api/trips/:id/recovery-session`).

---

### Phase 2 & Phase 2 Hardening — Deterministic Recovery Engine + TripShield Core
- **Autonomous Recovery Loop (`RecoveryPlanner`)**:
  - Implements the complete autonomous recovery state loop: `OBSERVE` -> `BUILD OBJECTIVE` -> `SELECT STRATEGY` -> `EXECUTE ACTION` -> `NORMALIZE` -> `EVALUATE` -> `SCORE` -> `TRIPSHIELD` -> `VERIFY` -> `PLAN_READY` -> `AWAITING_APPROVAL`.
- **State-Driven Dynamic Adaptation (`AdaptationEngine`)**:
  - Automatically transitions recovery strategies based on structured failure causes:
    - `BUDGET_EXCEEDED` -> Transitions from air travel to rail/multimodal (`FLIGHT_PLUS_TRAIN`).
    - `INSUFFICIENT_TRANSFER_TIME` -> Switches from tight connections to direct or multimodal routes.
    - `DEADLINE_MISSED`, `CAPACITY_EXCEEDED`, `NO_RESULTS`.
- **Strict Constraint Validation (`ConstraintValidator` & `PlanEvaluator`)**:
  - Enforces hard boundaries before scoring; plans violating hard constraints receive a score of 0 and cannot be selected.
- **TripShield Explainable Risk Engine (`RiskEngine`)**:
  - Generates deterministic 0–100 scores categorized as `LOW`, `MEDIUM`, `HIGH`, or `CRITICAL`.
  - Factors in disruption severity, transfer buffer adequacy, deadline margin, alternative plan count, and mode complexity.
- **What-If Simulation Engine (`SimulationService`)**:
  - Simulates cascading delay impacts (e.g. +60 min delay) to preview downstream connection breakages before committing.

---

### Phase 3 — Real Travel Data + Physical Transfer Verification + Provider Fallback
- **Resilient Fallback Pipeline (`FallbackManager`)**:
  - `Primary (Live API) -> Fallback -> Deterministic Mock`.
  - In-memory TTL caching and request quota limiting to protect against API failure or rate limits.
- **Live Providers & Normalizers**:
  - `AviationstackFlightProvider`: Live HTTP flight schedules and status.
  - `GoogleRoutesProvider`: Live driving/transit durations with static physical transfer fallback estimates.
  - `FlightNormalizer` & `RouteNormalizer`: Converts external payloads into standardized segment schemas with confidence stamps (`LIVE`, `CACHED`, `ESTIMATED`, `MOCK`).
- **Physical Transfer Verification (`ConnectionValidator`)**:
  - Evaluates inter-station travel times (e.g. Airport -> Railway Station) and enforces a mandatory **30-minute safety buffer**.
- **Data Freshness Engine (`DataFreshnessValidator`)**:
  - Evaluates data age against thresholds (`FLIGHT_STATUS_MAX_AGE_MINUTES=5`, `ROUTE_MAX_AGE_MINUTES=15`). Stale data elevates risk and prevents unsafe handoffs.

---

### Phase 4 — LLM Agent + Tool Calling + Adaptive Reasoning
- **Google Gemini Reasoning Layer**:
  - `GeminiProvider`: Direct REST API client using native `fetch` (Node 18+), 15-second `AbortController` timeout, and strict JSON output mode.
  - `LLMDecisionService`: Prompt construction, prompt injection defense, schema validation, and tool mapping.
- **Dual-Mode Operation**:
  - `LLM_ENABLED=false` (default): Operates fully deterministically without requiring any LLM API key.
  - `LLM_ENABLED=true`: Uses Gemini for strategy selection and action dispatching, with automatic fallback to deterministic `DecisionEngine` on error, quota limit, or invalid response.
- **Security & Cost Guards**:
  - **Prompt Isolation**: System instructions are immutable; untrusted travel data is placed only in `[CURRENT OBSERVATION]` with header sanitization.
  - **Quota Guard**: `LLM_MAX_CALLS_PER_RECOVERY=5` prevents excessive token consumption.
  - Deterministic validators remain the final authority; the LLM cannot invent flights, prices, or bypass constraints.

---

### Phase 5 — External Deeplink & Secure Provider Handoff
- **Explicit Non-Booking Policy**:
  - TripRescue never collects payment details or issues tickets.
- **Handoff Subsystem (`server/src/handoff/`)**:
  - `deeplinkValidator`: Blocks dangerous protocols (`javascript:`, `data:`, `file:`) and validates hostnames against an authorized provider allowlist (`airindiaexpress.com`, `goindigo.in`, `airvistara.com`, `irctc.co.in`, `demo.example.com`). Arbitrary redirects and phishing domains are rejected.
  - `externalHandoffService`: Enforces plan status gating: only plans that are `VALID` or `SELECTED` and have `FRESH` data can be handed off (`INVALID`, `STALE`, `REJECTED`, or `EXPIRED` plans are blocked).
  - `handoffLogger`: Audits handoffs in `session.agentEvents` without exposing sensitive tokens or credentials.
  - `ExternalHandoff`: Mongoose model tracking handoff lifecycle (`AVAILABLE`, `PENDING_APPROVAL`, `APPROVED`, `OPENED`, `REJECTED`, `INVALID`, `FAILED`).
- **Two-Stage Approval Endpoints**:
  - `POST /api/recovery/:id/approve`: Records traveler approval.
  - `POST /api/recovery/:id/handoff`: Re-validates plan and returns authorized provider link.
- **Frontend Flow**:
  - Interactive "CONTINUE TO PROVIDER" action card with explicit disclaimers.
  - Safe browser opening (`window.open(url, "_blank", "noopener,noreferrer")`).

---

## 4. Summary of API Endpoints

| Method | Endpoint | Phase | Purpose |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/health` | Phase 0 | Service health check |
| `POST` | `/api/trips` | Phase 1 | Create a new trip with objective & constraints |
| `GET` | `/api/trips` | Phase 1 | List all trips |
| `GET` | `/api/trips/:id` | Phase 1 | Get trip details and current recovery session |
| `POST` | `/api/trips/:id/segments` | Phase 1 | Add itinerary segment |
| `POST` | `/api/trips/:id/disruption` | Phase 1 | Report travel disruption |
| `POST` | `/api/trips/:id/recovery-session` | Phase 1 | Create recovery session for disrupted trip |
| `POST` | `/api/trips/:id/recovery/start` | Phase 2 | Start autonomous recovery agent loop |
| `POST` | `/api/recovery-sessions/:id/replan` | Phase 2 | Re-run recovery loop with strategy reset |
| `POST` | `/api/recovery-sessions/:id/simulate` | Phase 2 | Run what-if cascade delay simulation |
| `GET` | `/api/recovery-sessions/:id/events` | Phase 2 | Get agent event activity timeline |
| `GET` | `/api/recovery-sessions/:id/plans` | Phase 2 | Get candidate and selected recovery plans |
| `POST` | `/api/recovery-sessions/:id/approve` | Phase 5 | Record explicit user approval for handoff |
| `POST` | `/api/recovery-sessions/:id/handoff` | Phase 5 | Validate and retrieve authorized provider link |
| `POST` | `/api/recovery/:id/approve` | Phase 5 | Alias for recovery plan approval |
| `POST` | `/api/recovery/:id/handoff` | Phase 5 | Alias for external provider handoff |

---

## 5. Automated Test Suite Metrics

```text
Ran 8 test suites:
- health.test.js       (2 tests)  -> Phase 0 Foundation
- trip.test.js         (5 tests)  -> Phase 1 Trip Model & Constraints
- providers.test.js    (7 tests)  -> Phase 0 Provider Abstraction
- phase1.test.js       (11 tests) -> Phase 1 Disruption & Objectives
- phase2.test.js       (12 tests) -> Phase 2 Deterministic Recovery & TripShield
- phase3.test.js       (11 tests) -> Phase 3 Real Data, Fallback & Transfers
- phase4.test.js       (12 tests) -> Phase 4 Gemini LLM Reasoning & Security
- phase5.test.js       (13 tests) -> Phase 5 Deeplink & Secure Handoff

Test Result: 73 PASS / 0 FAIL (100% Passing)
Frontend Build: Vite production build succeeds in ~790ms with 0 errors
```

---

## 6. Frontend Components Overview

- **`Dashboard.jsx`**: Displays trip cards, disruption indicators, and active recovery statuses.
- **`TripDetail.jsx`**: View complete multimodal itinerary segments, disruptions, and recovery objective summary.
- **`RecoveryPanel.jsx`**: Autonomous recovery control center (`START AUTONOMOUS RECOVERY`, `Re-run Recovery`, `What-If Simulation`).
- **`CandidatePlansView.jsx`**: Detailed candidate plan comparisons, segment timelines, physical transfer verifications, TripShield scores, and Phase 5 **CONTINUE TO PROVIDER** handoff flow.
- **`TripShieldRiskCard.jsx`**: Visual explainable risk indicator breakdown (0–100 risk score, risk level badge, and factor chips).
- **`AgentTimeline.jsx`**: Real-time agent event timeline with badges (`OBSERVE`, `STRATEGY`, `ACT`, `PLAN`, `EVALUATE`, `TRIPSHIELD`, `VERIFIED`, `APPROVED`, `HANDOFF`, `LLM REASONING`, `LLM DECISION`, `AI FALLBACK`).
- **`SimulationModal.jsx`**: Interactive modal to test what-if cascading delay scenarios.
