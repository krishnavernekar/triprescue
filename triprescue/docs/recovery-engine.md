# TripRescue / TripShield — Deterministic Recovery Engine

## Overview

The Deterministic Recovery Engine is the core decision and safety authority of TripRescue. While LLMs suggest candidate strategies, the Deterministic Recovery Engine evaluates, validates, scores, and verifies all candidate recovery plans against physical, temporal, and monetary constraints.

---

## Core Components

### 1. ConstraintValidator
Evaluates candidate plans against the traveler's explicit objective:
- **Maximum Additional Budget**: Ensures `totalCost <= maxAdditionalBudget`.
- **Arrival Deadline**: Verifies `finalArrivalTime <= arrivalDeadline`.
- **Passenger Capacity**: Verifies `availableSeats >= passengerCount`.
- **Hard Constraint Enforcement**: If any hard constraint fails, the plan is marked `INVALID` and rejection reasons are permanently logged in the audit trail.

### 2. ConnectionValidator
Enforces physical transit and transfer feasibility between itinerary legs:
- **Minimum Connection Time (MCT)**:
  - Intra-terminal flight transfer: 45 minutes
  - Inter-terminal flight transfer: 90 minutes
  - Flight to Train transfer: 120 minutes
  - Flight to Bus transfer: 90 minutes
  - Flight to Hotel transfer: 60 minutes
- **Route Provider Integration**: Validates actual physical transit times across ground transfer legs using Google Routes API / MockRouteProvider.

### 3. CascadeImpactEngine
Performs recursive propagation analysis across all downstream itinerary segments when an upstream disruption occurs:
- Calculates arrival time delays.
- Flags broken downstream connections where `availableBuffer < MCT`.
- Computes deadline overshoot in minutes.
- Emits structured cascade impact summaries for traveler transparency.

### 4. RiskEngine
Calculates a multidimensional TripShield risk score (0–100):
- Factors in buffer compression, remaining transit legs, historical carrier reliability, weather factors, and deadline tightness.
- Classifies risk into tiers: `LOW` (0–25), `MEDIUM` (26–50), `HIGH` (51–75), `CRITICAL` (76–100).
- Provides plain-English explainable risk drivers.

### 5. Strategy Adaptation Matrix
When a candidate plan fails constraint evaluation, `AdaptationEngine` dynamically adapts to the next optimal strategy:

| Current Strategy | Failure Cause | Next Strategy |
|---|---|---|
| `DIRECT_FLIGHT` | Budget Exceeded / No Seats | `CONNECTING_FLIGHT` |
| `CONNECTING_FLIGHT` | Buffer Infeasible / Delayed | `ALTERNATE_AIRPORT` |
| `ALTERNATE_AIRPORT` | No Flights Available | `FLIGHT_PLUS_TRAIN` |
| `FLIGHT_PLUS_TRAIN` | Train Sold Out | `TRAIN_ONLY` |
| `TRAIN_ONLY` | Train Disrupted | `FLIGHT_PLUS_BUS` |
| `FLIGHT_PLUS_BUS` | Arrival After Deadline | `TRANSIT_HOTEL` |
