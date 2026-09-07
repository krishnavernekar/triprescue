# TripRescue / TripShield — Provider Architecture

## Overview

TripRescue utilizes an extensible, unified provider abstraction architecture across all transit, accommodation, routing, and communication services. All providers implement abstract base classes enforcing uniform schemas, error isolation, credential protection, and fallback safety.

---

## Provider Registry & Modalities

```
                     ┌───────────────────────────────┐
                     │       Provider Registry       │
                     │    `getProvider(modality)`    │
                     └───────────────┬───────────────┘
                                     │
     ┌──────────────┬────────────────┼──────────────┬──────────────┐
     ▼              ▼                ▼              ▼              ▼
┌─────────┐   ┌───────────┐    ┌───────────┐  ┌───────────┐  ┌───────────┐
│ Flight  │   │   Train   │    │    Bus    │  │   Hotel   │  │   Route   │
│Provider │   │  Provider │    │  Provider │  │  Provider │  │  Provider │
└────┬────┘   └─────┬─────┘    └─────┬─────┘  └─────┬─────┘  └─────┬─────┘
     │              │                │              │              │
 ┌───┴───┐      ┌───┴───┐        ┌───┴───┐      ┌───┴───┐      ┌───┴───┐
 │ Mock  │      │ Mock  │        │ Mock  │      │ Mock  │      │ Mock  │
 │ Live* │      │ Live* │        │ Live* │      │ Live* │      │ Live* │
 └───────┘      └───────┘        └───────┘      └───────┘      └───────┘
```

*Live providers active when API keys and configuration enabled; otherwise falls back automatically to deterministic mock fixtures.

---

## Supported Modalities & Implementations

| Modality | Base Class | Implementations | Primary Features |
|---|---|---|---|
| **Flight** | `FlightProvider` | `MockFlightProvider`, `AviationstackFlightProvider` | Direct & connecting flight search, real-time schedule lookup, status revalidation, airport coordinates |
| **Train** | `TrainProvider` | `MockTrainProvider` | Vande Bharat, Rajdhani, Shatabdi intercity corridors, seat availability, station code mapping |
| **Bus** | `BusProvider` | `MockBusProvider` | Volvo / Electric intercity express coach lines, pickup/drop-off station validation |
| **Hotel** | `HotelProvider` | `MockHotelProvider` | Emergency transit hotels near airports/stations, hourly transit rooms, room availability revalidation |
| **Route / Transfer** | `RouteProvider` | `MockRouteProvider`, `GoogleRoutesProvider` | Inter-terminal & inter-station physical transit duration, traffic-aware driving/transit times |
| **Notifications** | `NotificationProvider` | `MockNotificationProvider` | Real-time SSE event streaming, structured dashboard notifications, offline email logs |
| **Calendar** | `CalendarProvider` | `MockCalendarProvider` | Read-only calendar conflict inspection, non-mutating rescheduling proposals |
| **Insurance** | `InsuranceProvider` | `MockInsuranceProvider` | Policy clause parsing, delay threshold classification (>=4h), uncertainty disclaimers |
| **Compensation** | `CompensationProvider` | `MockCompensationProvider` | Statutory regulation analysis (DGCA CAR, EU261, US DOT), formal claim notice generation |

---

## Provider Safety Guarantees

1. **Deterministic Authority**: All raw provider outputs are normalized through dedicated normalizer classes (`FlightNormalizer`, `TrainNormalizer`, `BusNormalizer`, `HotelNormalizer`, `RouteNormalizer`).
2. **Zero Fabricated URLs**: Links are strictly generated from verified official domain templates or flagged as `DEEPLINK_UNAVAILABLE`.
3. **Graceful Fallback**: If a live API returns an error, rate limit, or timeout, `FallbackManager` logs a warning and cleanly switches to the deterministic fallback fixture.
4. **Credential Isolation**: API keys and tokens are strictly kept in server environment variables and never logged or serialized into client responses.
