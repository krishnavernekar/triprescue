# TripRescue / TripShield — Complete Agent Loop Architecture

## Overview

TripRescue implements an autonomous, multi-phase agent loop designed for high-reliability travel disruption recovery. The agent operates under strict safety and governance boundaries: **The LLM reasons and suggests actions, while deterministic engines hold authoritative decision power over all constraints, physics, and state mutations.**

```
               ┌────────────────────────┐
               │    Disruption Event    │
               └───────────┬────────────┘
                           ▼
               ┌────────────────────────┐
               │   1. OBSERVE & INGEST  │
               └───────────┬────────────┘
                           ▼
               ┌────────────────────────┐
               │ 2. PREDICT RISK &      │
               │    CASCADE IMPACT      │
               └───────────┬────────────┘
                           ▼
         ┌─────────────────────────────────────┐
         │ 3. DECIDE NEXT ACTION               │
         │    • LLM Tool Calling (Gemini)      │
         │    • Deterministic Fallback Engine  │
         └─────────────────┬───────────────────┘
                           ▼
         ┌─────────────────────────────────────┐
         │ 4. ACTION VALIDATOR                 │
         │    (Schema, Param, Tool Allowlist)  │
         └─────────────────┬───────────────────┘
                           ▼
         ┌─────────────────────────────────────┐
         │ 5. ACTION EXECUTOR                  │
         │    (Search, Route, Eval, Reval)     │
         └─────────────────┬───────────────────┘
                           ▼
         ┌─────────────────────────────────────┐
         │ 6. DETERMINISTIC CONSTRAINT EVAL    │
         │    (Budget, Deadlines, Transfers)   │
         └─────────────────┬───────────────────┘
                           │
                 [Valid / Invalid?]
                /                  \
          [Valid Plan]         [Violations]
              /                      \
             ▼                        ▼
┌────────────────────────┐  ┌────────────────────────┐
│ 7. VERIFY & SCORE PLAN │  │ 8. ADAPT STRATEGY      │
└────────────┬───────────┘  └────────────┬───────────┘
             │                           │
             │                    [Next Strategy]
             │                           │
             │                           ▼
             │               (Loop back to Step 3)
             ▼
┌────────────────────────┐
│ 9. RECOVERY SUCCESS    │
│    • Candidate Ranking │
│    • User Approval Req │
│    • Secure Handoff    │
└────────────────────────┘
```

---

## The 8-Stage Execution Cycle

### 1. Observe
- Ingests traveler itinerary, disruption alert, deadlines, and budget.
- Captures snapshots into `RecoverySession` to ensure baseline immutability.

### 2. Predict (Cascade Impact & Risk Assessment)
- `CascadeImpactEngine` calculates buffer compression, broken connections, and deadline misses.
- `RiskEngine` calculates a composite 0–100 risk score and structured risk tier (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`).

### 3. Decide (Hybrid Agent Architecture)
- **Primary**: `LLMDecisionService` uses Gemini 1.5/Flash function calling against 11 registered tools.
- **Fallback**: `DecisionEngine` runs deterministic strategy state-machine if LLM is offline or rate-limited.
- **Circuit Breaker**: Degrades gracefully to deterministic reasoning with 0 downtime.

### 4. Act (Validated Tool Execution)
- `ActionValidator` verifies parameters, bounding box, timestamp formats, and permission scopes before invocation.
- `ActionExecutor` routes execution to provider abstraction layers (Flight, Train, Bus, Hotel, Route).

### 5. Evaluate (Deterministic Authority)
- `ConstraintValidator` checks hard constraints (Budget, Arrival Deadline, Passenger Capacity).
- `ConnectionValidator` checks physical transfer buffers (MCT, terminal transfers, inter-station transit).

### 6. Adapt (Strategy Escalation)
- `AdaptationEngine` triggers strategy switches upon candidate failure:
  - `DIRECT_FLIGHT` → `CONNECTING_FLIGHT` → `ALTERNATE_AIRPORT` → `FLIGHT_PLUS_TRAIN` → `TRAIN_ONLY` → `FLIGHT_PLUS_BUS` → `TRANSIT_HOTEL`.

### 7. Verify (Data Freshness & Revalidation)
- `DataFreshnessValidator` enforces status age thresholds (5m for flights, 15m for routes).
- Provider `revalidate()` confirms real-time inventory and pricing before plan finalization.

### 8. Handoff & Governance
- Plan is presented to the user with full transparency, explanation, and cost breakdown.
- User explicitly approves the plan before external provider handoff links are opened.
- **Zero automated booking, zero automated payment, zero fabricated links.**
