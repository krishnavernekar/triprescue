# TripRescue Architecture — Phase 0

## Overview

TripRescue follows a modular, layered architecture designed to support the incremental addition of an agentic AI recovery engine, multiple transport providers, and predictive risk analysis.

## Architecture Diagram

```
┌─────────────────────────────────────────┐
│              React Frontend             │
│  (Dashboard, TripShield UI, Controls)   │
├─────────────────────────────────────────┤
│              API Gateway                │
│        (Express REST + SSE)             │
├──────────┬──────────┬───────────────────┤
│  Routes  │  Middle- │   Controllers     │
│          │  ware    │                   │
├──────────┴──────────┴───────────────────┤
│           Agent Layer (future)          │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐  │
│  │ Planner │ │ Decision │ │Adaptation│  │
│  │         │ │  Engine  │ │  Engine  │  │
│  └─────────┘ └──────────┘ └──────────┘  │
├─────────────────────────────────────────┤
│         Provider Abstraction Layer      │
│  ┌───────┐ ┌──────┐ ┌─────┐ ┌───────┐  │
│  │Flight │ │Train │ │ Bus │ │ Hotel │  │
│  └───────┘ └──────┘ └─────┘ └───────┘  │
│  ┌──────────────────────────────────┐   │
│  │         Route Provider           │   │
│  └──────────────────────────────────┘   │
├─────────────────────────────────────────┤
│           Evaluation Layer (future)     │
│  ┌──────────┐ ┌───────────┐ ┌────────┐  │
│  │Constraint│ │Connection │ │  Risk  │  │
│  │Validator │ │ Validator │ │ Engine │  │
│  └──────────┘ └───────────┘ └────────┘  │
├─────────────────────────────────────────┤
│               MongoDB                   │
│  (Trips, Sessions, Plans, Events)       │
└─────────────────────────────────────────┘
```

## Core Principles

### 1. Provider Abstraction
All transport and service providers implement a common interface through `BaseProvider`. This enables:
- Easy swapping between mock and real implementations
- Configuration-driven provider selection
- No vendor lock-in

### 2. Deterministic Validation
The LLM will never be the final authority on:
- Arithmetic (budget calculations)
- Timestamp comparisons (deadline checks)
- Connection feasibility (transfer time validation)
- Availability checks

These will always use deterministic code validators.

### 3. Separation of Concerns
- **Controllers** handle HTTP request/response
- **Models** define data structure and validation
- **Providers** abstract external service interactions
- **Middleware** handles cross-cutting concerns
- **Config** centralizes environment and settings

### 4. No Payment Processing
TripRescue is a decision and recovery layer. It searches, evaluates, and recommends — then hands off to the provider's website for purchase.

## Phase 0 Components

### Implemented
- Express server with error handling and logging
- MongoDB connection with Mongoose
- Trip model with validation
- Health endpoint
- Provider base classes (Flight, Train, Bus, Hotel, Route)
- Mock provider implementations
- Provider factory with configuration-driven selection
- React dashboard with health monitoring
- API service layer

### Planned (Future Phases)
- Agent controller, planner, decision engine
- Constraint validator, connection validator
- TripShield risk engine
- Cascade impact engine
- Adaptation engine
- Recovery plan evaluator
- External handoff service
- Real-time events (SSE)
- Calendar, notification, insurance, compensation services
