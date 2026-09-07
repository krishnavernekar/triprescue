# TripRescue / TripShield — REST API Surface

## Overview

TripRescue provides a RESTful JSON API serving the frontend command center and external integrations. All endpoints adhere to consistent response schemas with error isolation and HTTP status conventions.

---

## Endpoint Catalog

### 1. Trips (`/api/trips`)
- `POST /api/trips` — Create a new trip with traveler objective and original itinerary.
- `GET /api/trips` — List all trips.
- `GET /api/trips/:id` — Retrieve detailed trip status, itinerary, and current disruption.
- `POST /api/trips/:id/disruption` — Report a travel disruption (delay, cancellation, gate change).
- `POST /api/trips/:id/recovery-session` — Initialize a recovery session for the trip.
- `POST /api/trips/:id/recovery/start` — Start autonomous recovery agent.

### 2. Recovery Sessions (`/api/recovery-sessions` & `/api/recovery`)
- `GET /api/recovery-sessions/:id` — Retrieve full session state, candidate plans, and selected plan.
- `POST /api/recovery-sessions/:id/replan` — Trigger on-demand replanning.
- `POST /api/recovery-sessions/:id/simulate` — Execute What-If simulation with cloned state without modifying live DB.
- `POST /api/recovery-sessions/:id/approve` — Traveler explicit approval for selected recovery plan.
- `POST /api/recovery-sessions/:id/handoff` — Execute secure external provider handoff.
- `GET /api/recovery-sessions/:id/events` — Stream or retrieve agent reasoning event logs.

### 3. Monitoring Subsystem (`/api/monitoring` & `/api/recovery/:id/monitor`)
- `POST /api/recovery/:id/monitor/start` — Start bounded interval monitoring.
- `POST /api/recovery/:id/monitor/stop` — Stop monitoring and clear background timers.
- `POST /api/recovery/:id/monitor/pause` — Pause monitoring.
- `GET /api/recovery/:id/monitor/status` — Get current monitoring status, interval, and latest observations.
- `POST /api/recovery/:id/monitor/check` — Execute on-demand monitoring cycle with optional `mockOverride`.

### 4. Notifications (`/api/notifications`)
- `GET /api/notifications` — List traveler notifications.
- `GET /api/notifications/stream` — Real-time Server-Sent Events (SSE) stream.
- `PATCH /api/notifications/:id/read` — Mark notification as read.

### 5. Calendar (`/api/calendar`)
- `GET /api/calendar/events` — Retrieve traveler calendar schedule.
- `POST /api/calendar/check-conflicts` — Check read-only conflicts against candidate arrival times.
- `POST /api/calendar/prepare-update` — Generate non-mutating rescheduling proposal requiring approval.
- `POST /api/calendar/update` — Apply schedule adjustment after explicit user confirmation.

### 6. Insurance & Statutory Compensation (`/api/insurance` & `/api/compensation`)
- `POST /api/insurance/analyze` — Analyze travel insurance policy text against disruption.
- `GET /api/insurance/:tripId` — Get insurance analysis report and claim advisory.
- `POST /api/compensation/check` — Evaluate statutory passenger rights (DGCA CAR / EU261 / US DOT).
- `GET /api/compensation/:tripId` — Get compensation assessment and draft claim notice.

### 7. System Health (`/api/health`)
- `GET /api/health` — Returns system health status, DB connectivity, provider statuses, and memory usage.
