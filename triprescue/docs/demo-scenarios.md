# TripRescue / TripShield — Deterministic Demo Scenarios

## Primary Hackathon Demo Scenario: BLR → DEL → JAI

### Traveler Objective
- **Traveler**: 1 passenger (Ananya Sharma)
- **Origin**: Kempegowda International Airport (BLR)
- **Destination**: Jaipur International Airport (JAI)
- **Original Itinerary**:
  - Leg 1: Flight 6E-101 (BLR → DEL), Departure 10:00, Arrival 12:45
  - Leg 2: Flight AI-404 (DEL → JAI), Departure 14:00, Arrival 15:10
- **Arrival Deadline**: 22:00
- **Maximum Additional Budget**: ₹5,000
- **Priority**: Fastest feasible arrival

### Demo Execution Flow
1. **Disruption Reported**: Leg 1 (6E-101) suffers a 60-minute departure delay at BLR.
2. **Cascade Impact Analyzed**:
   - New BLR → DEL arrival: 13:45.
   - Available transfer buffer at DEL: 15 minutes.
   - MCT requirement at DEL: 60 minutes.
   - `CONNECTION_AT_RISK` detected: transfer window broken.
3. **TripShield Risk Elevated**: Risk score increases from 15 (LOW) to 85 (CRITICAL).
4. **Autonomous Recovery Loop Started**:
   - Agent attempts `DIRECT_FLIGHT` (Air India Express IX 1922 BLR → JAI).
   - Candidate rejected: Cost ₹7,000 exceeds ₹5,000 budget (`BUDGET_EXCEEDED`).
   - Strategy adapted to `FLIGHT_PLUS_TRAIN` (BLR → DEL on flight + Vande Bharat Express 20978 NDLS → JAI).
   - Candidate evaluated: Cost ₹1,600 within ₹5,000 budget; arrives at 17:30 (well before 22:00 deadline); transfer buffer at NDLS verified via Route Provider.
5. **Plan Verified & Revalidated**: Freshness and seat availability revalidated.
6. **User Approval & Secure Handoff**:
   - Plan presented in dashboard with transparent timeline, risk comparison, and cost breakdown.
   - Traveler clicks "Approve & Handoff".
   - Official Indian Railways / IRCTC verified portal link opened securely in a new tab.
   - Audit trail logs `EXTERNAL_HANDOFF_EXECUTED`.

---

## The 10 Deterministic Scenarios

| Scenario | Trigger / Condition | Expected Autonomous Behavior |
|---|---|---|
| **1. Flight Cancellation** | Upstream flight cancelled | Full cascade invalidation, immediate multi-modal search, candidate generation |
| **2. Connection Risk** | Moderate 40–60m delay compresses transfer buffer | `CONNECTION_AT_RISK` alert, connection buffer recalculation, alternative routing |
| **3. Inventory Invalidation** | Preferred alternative becomes sold out during revalidation | Revalidation fails (`AVAILABILITY_CHANGED`), agent automatically adapts to next strategy |
| **4. Budget Exceeded** | Direct flight cost exceeds traveler maximum budget | Candidate rejected with clear audit reason (`BUDGET_EXCEEDED`), cheaper multimodal plan found |
| **5. Insufficient Transfer** | Connecting flight leaves with < MCT | Rejected with `INSUFFICIENT_TRANSFER_TIME`, ground transit legs recalculated |
| **6. Train Corridor Disrupted** | Railway track maintenance on direct rail corridor | Agent automatically switches from `TRAIN_ONLY` to `FLIGHT_PLUS_BUS` |
| **7. Overnight Transit Required** | Disruption forces next available connection to next morning | Agent activates `TRANSIT_HOTEL` strategy, searches airport transit hotel with 60m transfer buffer |
| **8. Tool / Provider Timeout** | Primary provider API times out or errors | FallbackManager routes request to deterministic fallback provider without crashing agent |
| **9. No Feasible Plan** | Impossible deadline (e.g. 30 min to travel 2,000 km) | System accurately reports `NO_FEASIBLE_PLAN` with clear explanation instead of fabricating options |
| **10. Constraint Negotiation** | Budget slightly below all options | System presents interactive constraint relaxation proposals (e.g. "+₹1,200 allows Direct Flight") |
