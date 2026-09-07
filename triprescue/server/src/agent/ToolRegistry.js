/**
 * ToolRegistry — Phase 8 Tool Calling Registry & Schema Definitions.
 *
 * Defines the executable tools available to the LLM agent and deterministic engine,
 * along with JSON Schema definitions (Gemini-compatible functionDeclarations)
 * and parameter validation.
 */

const TOOL_DEFINITIONS = [
  {
    name: 'search_flights',
    actionType: 'SEARCH_FLIGHTS',
    toolType: 'flight',
    description: 'Search available commercial flights between origin and destination with real-time or mock schedules and pricing.',
    parameters: {
      type: 'OBJECT',
      properties: {
        origin: {
          type: 'STRING',
          description: '3-letter IATA departure airport code (e.g. BLR, DEL, BOM)',
        },
        destination: {
          type: 'STRING',
          description: '3-letter IATA arrival airport code (e.g. JAI, DEL, BOM)',
        },
        strategy: {
          type: 'STRING',
          description: 'Recovery strategy: DIRECT_FLIGHT or CONNECTING_FLIGHT',
        },
        departureTime: {
          type: 'STRING',
          description: 'Earliest ISO 8601 departure timestamp',
        },
        maxBudget: {
          type: 'NUMBER',
          description: 'Maximum allowable budget in INR',
        },
      },
      required: ['origin', 'destination'],
    },
  },
  {
    name: 'search_trains',
    actionType: 'SEARCH_TRAINS',
    toolType: 'train',
    description: 'Search available intercity trains between origin and destination railway stations.',
    parameters: {
      type: 'OBJECT',
      properties: {
        origin: {
          type: 'STRING',
          description: 'Departure railway station code or city (e.g. NDLS, SBC)',
        },
        destination: {
          type: 'STRING',
          description: 'Arrival railway station code or city (e.g. JP, CSMT)',
        },
        strategy: {
          type: 'STRING',
          description: 'Recovery strategy: TRAIN_ONLY or FLIGHT_PLUS_TRAIN',
        },
        departureTime: {
          type: 'STRING',
          description: 'Earliest ISO 8601 departure timestamp',
        },
      },
      required: ['origin', 'destination'],
    },
  },
  {
    name: 'search_buses',
    actionType: 'SEARCH_BUSES',
    toolType: 'bus',
    description: 'Search intercity bus routes and schedules between origin and destination.',
    parameters: {
      type: 'OBJECT',
      properties: {
        origin: {
          type: 'STRING',
          description: 'Departure city or bus terminus',
        },
        destination: {
          type: 'STRING',
          description: 'Arrival city or bus terminus',
        },
        strategy: {
          type: 'STRING',
          description: 'Recovery strategy: BUS_ONLY',
        },
      },
      required: ['origin', 'destination'],
    },
  },
  {
    name: 'search_hotels',
    actionType: 'SEARCH_HOTELS',
    toolType: 'hotel',
    description: 'Search emergency transit hotel accommodations for stranded passengers at transit hubs.',
    parameters: {
      type: 'OBJECT',
      properties: {
        location: {
          type: 'STRING',
          description: 'Transit hub airport code or city (e.g. DEL, BOM)',
        },
        checkInDate: {
          type: 'STRING',
          description: 'ISO 8601 check-in date or timestamp',
        },
      },
      required: ['location'],
    },
  },
  {
    name: 'calculate_route',
    actionType: 'CALCULATE_ROUTE',
    toolType: 'route',
    description: 'Calculate driving or transit travel times and distance between hubs to verify physical transfer feasibility.',
    parameters: {
      type: 'OBJECT',
      properties: {
        origin: {
          type: 'STRING',
          description: 'Origin hub code or address (e.g. DEL, NDLS, lat/lng)',
        },
        destination: {
          type: 'STRING',
          description: 'Destination hub code or address (e.g. NDLS, DEL)',
        },
        mode: {
          type: 'STRING',
          description: 'Travel mode: DRIVE or TRANSIT',
        },
      },
      required: ['origin', 'destination'],
    },
  },
  {
    name: 'evaluate_plan',
    actionType: 'EVALUATE_PLAN',
    toolType: 'evaluator',
    description: 'Evaluate a candidate recovery plan against traveler hard constraints and physical connection safety buffers.',
    parameters: {
      type: 'OBJECT',
      properties: {
        plan: {
          type: 'OBJECT',
          description: 'The candidate RecoveryPlan object',
        },
        objective: {
          type: 'OBJECT',
          description: 'Traveler RecoveryObjective constraints',
        },
      },
      required: ['plan'],
    },
  },
  {
    name: 'revalidate_plan',
    actionType: 'REVALIDATE_PLAN',
    toolType: 'revalidator',
    description: 'Revalidate live availability of flight/train segments in a candidate recovery plan against real-time provider state.',
    parameters: {
      type: 'OBJECT',
      properties: {
        segments: {
          type: 'ARRAY',
          description: 'Array of itinerary segments to revalidate',
        },
      },
      required: ['segments'],
    },
  },
  {
    name: 'adapt_strategy',
    actionType: 'ADAPT_STRATEGY',
    toolType: 'adaptation',
    description: 'Adapt the active recovery strategy when a plan fails evaluation or provider returns no results.',
    parameters: {
      type: 'OBJECT',
      properties: {
        currentStrategy: {
          type: 'STRING',
          description: 'Currently active recovery strategy',
        },
        failureReason: {
          type: 'STRING',
          description: 'Structured failure reason code',
        },
      },
      required: ['currentStrategy', 'failureReason'],
    },
  },
  {
    name: 'verify_plan',
    actionType: 'VERIFY_PLAN',
    toolType: 'verifier',
    description: 'Perform final verification of candidate plan before traveler approval and external handoff.',
    parameters: {
      type: 'OBJECT',
      properties: {
        plan: {
          type: 'OBJECT',
          description: 'Candidate recovery plan to verify',
        },
      },
      required: ['plan'],
    },
  },
  {
    name: 'check_calendar_conflict',
    actionType: 'CHECK_CALENDAR_CONFLICT',
    toolType: 'calendar',
    description: 'Check whether a candidate recovery arrival time conflicts with traveler calendar commitments.',
    parameters: {
      type: 'OBJECT',
      properties: {
        arrivalTime: {
          type: 'STRING',
          description: 'ISO 8601 recovery arrival timestamp to check against calendar events',
        },
      },
      required: ['arrivalTime'],
    },
  },
  {
    name: 'analyze_insurance',
    actionType: 'ANALYZE_INSURANCE',
    toolType: 'insurance',
    description: 'Analyze policy document text against disruption facts to identify potentially relevant clauses and evidence checklist.',
    parameters: {
      type: 'OBJECT',
      properties: {
        policyText: {
          type: 'STRING',
          description: 'Policy document text to analyze',
        },
        disruptionFacts: {
          type: 'OBJECT',
          description: 'Disruption details (delayMinutes, disruptionType, carrier)',
        },
      },
      required: ['policyText'],
    },
  },
  {
    name: 'check_compensation',
    actionType: 'CHECK_COMPENSATION',
    toolType: 'compensation',
    description: 'Evaluate passenger disruption facts against statutory compensation guidelines and generate draft claim.',
    parameters: {
      type: 'OBJECT',
      properties: {
        disruptionFacts: {
          type: 'OBJECT',
          description: 'Disruption details (carrier, flightNumber, disruptionType, delayMinutes)',
        },
      },
      required: ['disruptionFacts'],
    },
  },
  {
    name: 'run_simulation',
    actionType: 'RUN_SIMULATION',
    toolType: 'simulation',
    description: 'Simulate what-if travel disruptions (e.g. additional delay, segment cancellation, budget changes) on a cloned recovery state without mutating real active trip data.',
    parameters: {
      type: 'OBJECT',
      properties: {
        sessionId: {
          type: 'STRING',
          description: 'Recovery session ID to simulate against',
        },
        scenario: {
          type: 'OBJECT',
          description: 'Hypothetical scenario parameters (type, delayMinutes, affectedSegmentId, additionalBudget)',
        },
      },
      required: ['sessionId'],
    },
  },
];

class ToolRegistry {
  constructor() {
    this._tools = new Map();
    this._actionMap = new Map();

    for (const tool of TOOL_DEFINITIONS) {
      this._tools.set(tool.name, tool);
      this._actionMap.set(tool.actionType, tool);
    }
  }

  /**
   * Get registered tool definitions.
   * By default returns the 9 core recovery agent tools to preserve Phase 8 contract.
   * Pass { all: true } to include all tools.
   * @param {Object} [options]
   * @returns {Array<Object>}
   */
  listTools(options = {}) {
    if (options.all || options.includeCalendar || options.includePhase12 || options.includeSimulation) {
      return Array.from(this._tools.values());
    }
    return Array.from(this._tools.values()).filter((t) =>
      t.name !== 'check_calendar_conflict' &&
      t.name !== 'analyze_insurance' &&
      t.name !== 'check_compensation' &&
      t.name !== 'run_simulation'
    );
  }

  /**
   * Get a tool by function name (e.g. search_flights).
   * @param {string} name
   * @returns {Object|null}
   */
  getToolByName(name) {
    return this._tools.get(name) || null;
  }

  /**
   * Get a tool by ActionExecutor action type (e.g. SEARCH_FLIGHTS).
   * @param {string} actionType
   * @returns {Object|null}
   */
  getToolByActionType(actionType) {
    return this._actionMap.get(actionType) || null;
  }

  /**
   * Check if a tool name is registered.
   * @param {string} name
   * @returns {boolean}
   */
  hasTool(name) {
    return this._tools.has(name);
  }

  /**
   * Export Gemini-compatible function declarations for tool calling API.
   * @param {Object} [options]
   * @returns {Array<Object>}
   */
  getFunctionDeclarations(options = {}) {
    return this.listTools(options).map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }

  /**
   * Convert a function call from LLM into a standard ActionExecutor action object.
   * @param {string} functionName
   * @param {Object} args
   * @param {string} strategy
   * @returns {Object} Action object
   */
  createActionFromCall(functionName, args = {}, strategy = 'DIRECT_FLIGHT') {
    const tool = this.getToolByName(functionName);
    if (!tool) {
      throw new Error(`Unknown tool: ${functionName}`);
    }

    return {
      actionId: `ACT-LLM-${Date.now()}`,
      type: tool.actionType,
      strategy,
      tool: tool.toolType,
      parameters: { ...args },
      reason: `LLM tool call to ${functionName}`,
      createdAt: new Date(),
    };
  }
}

module.exports = new ToolRegistry();
