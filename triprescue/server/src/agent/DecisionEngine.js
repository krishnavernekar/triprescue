/**
 * DecisionEngine — Phase 2 Deterministic Decision Making.
 *
 * Chooses the concrete action(s) to execute based on:
 * - Current recovery strategy
 * - Active observation
 * - Goal origin and destination
 */

class DecisionEngine {
  /**
   * Decide the primary action for the current strategy.
   * @param {string} strategy - Active recovery strategy (e.g. DIRECT_FLIGHT, CONNECTING_FLIGHT, FLIGHT_PLUS_TRAIN)
   * @param {Object} observation - Situational observation
   * @returns {Object} Structured action ready for validation
   */
  selectAction(strategy, observation) {
    const origin = observation.origin;
    const destination = observation.destination;
    const departureTime = observation.departureTime;

    switch (strategy) {
      case 'DIRECT_FLIGHT':
        return {
          actionId: `ACT-DIR-${Date.now()}`,
          type: 'SEARCH_FLIGHTS',
          strategy,
          tool: 'flight',
          parameters: {
            origin,
            destination,
            strategy,
            departureTime,
          },
          reason: `Searching direct flight options from ${origin} to ${destination}`,
          createdAt: new Date(),
        };

      case 'CONNECTING_FLIGHT':
        return {
          actionId: `ACT-CONN-${Date.now()}`,
          type: 'SEARCH_FLIGHTS',
          strategy,
          tool: 'flight',
          parameters: {
            origin,
            destination,
            strategy,
            departureTime,
          },
          reason: `Searching 1-stop connecting flight options from ${origin} to ${destination}`,
          createdAt: new Date(),
        };

      case 'FLIGHT_PLUS_TRAIN':
      case 'FLIGHT_PLUS_BUS':
        // For multimodal, the initial action searches the long-haul flight leg to the hub (DEL)
        return {
          actionId: `ACT-MM-FLIGHT-${Date.now()}`,
          type: 'SEARCH_FLIGHTS',
          strategy,
          tool: 'flight',
          parameters: {
            origin,
            destination: 'DEL', // Hub
            strategy,
            departureTime,
          },
          reason: `Searching flight leg to transit hub DEL for multimodal journey`,
          createdAt: new Date(),
        };

      case 'TRAIN_ONLY':
        return {
          actionId: `ACT-TR-${Date.now()}`,
          type: 'SEARCH_TRAINS',
          strategy,
          tool: 'train',
          parameters: {
            origin,
            destination,
            strategy,
            departureTime,
          },
          reason: `Searching direct train options from ${origin} to ${destination}`,
          createdAt: new Date(),
        };

      case 'BUS_ONLY':
        return {
          actionId: `ACT-BUS-${Date.now()}`,
          type: 'SEARCH_BUSES',
          strategy,
          tool: 'bus',
          parameters: {
            origin,
            destination,
            strategy,
            departureTime,
          },
          reason: `Searching bus options from ${origin} to ${destination}`,
          createdAt: new Date(),
        };

      case 'FLIGHT_PLUS_HOTEL':
        return {
          actionId: `ACT-MM-FLIGHT-${Date.now()}`,
          type: 'SEARCH_FLIGHTS',
          strategy,
          tool: 'flight',
          parameters: {
            origin,
            destination: 'DEL',
            strategy,
            departureTime,
          },
          reason: `Searching flight leg to transit hub DEL for flight+hotel recovery`,
          createdAt: new Date(),
        };

      case 'TRANSIT_HOTEL':
        return {
          actionId: `ACT-HTL-${Date.now()}`,
          type: 'SEARCH_HOTELS',
          strategy,
          tool: 'hotel',
          parameters: {
            location: origin || 'DEL',
            checkInDate: departureTime,
            strategy,
          },
          reason: `Searching transit hotel accommodation at ${origin || 'DEL'}`,
          createdAt: new Date(),
        };

      default:
        return {
          actionId: `ACT-DEF-${Date.now()}`,
          type: 'SEARCH_FLIGHTS',
          strategy: 'DIRECT_FLIGHT',
          tool: 'flight',
          parameters: {
            origin,
            destination,
            departureTime,
          },
          reason: `Defaulting to direct flight search`,
          createdAt: new Date(),
        };
    }
  }

  /**
   * Decide the secondary action for composite strategies like FLIGHT_PLUS_TRAIN.
   */
  selectComplementaryAction(strategy, primaryResult, observation) {
    if (strategy === 'FLIGHT_PLUS_TRAIN') {
      const flightArrival = primaryResult?.segments?.[0]?.arrival || observation.departureTime;

      return {
        actionId: `ACT-MM-TRAIN-${Date.now()}`,
        type: 'SEARCH_TRAINS',
        strategy,
        tool: 'train',
        parameters: {
          origin: 'NDLS',
          destination: observation.destination,
          strategy,
          departureTime: flightArrival,
        },
        reason: `Searching connecting train from transit hub NDLS to ${observation.destination}`,
        createdAt: new Date(),
      };
    }

    if (strategy === 'FLIGHT_PLUS_BUS') {
      const flightArrival = primaryResult?.segments?.[0]?.arrival || observation.departureTime;

      return {
        actionId: `ACT-MM-BUS-${Date.now()}`,
        type: 'SEARCH_BUSES',
        strategy,
        tool: 'bus',
        parameters: {
          origin: 'DEL',
          destination: observation.destination,
          strategy,
          departureTime: flightArrival,
        },
        reason: `Searching connecting bus from transit hub DEL to ${observation.destination}`,
        createdAt: new Date(),
      };
    }

    if (strategy === 'FLIGHT_PLUS_HOTEL') {
      const flightArrival = primaryResult?.segments?.[0]?.arrival || observation.departureTime;
      const hub = primaryResult?.segments?.[0]?.destination?.code || 'DEL';

      return {
        actionId: `ACT-MM-HOTEL-${Date.now()}`,
        type: 'SEARCH_HOTELS',
        strategy,
        tool: 'hotel',
        parameters: {
          location: hub,
          checkInDate: flightArrival,
          strategy,
        },
        reason: `Searching transit hotel accommodation at hub ${hub}`,
        createdAt: new Date(),
      };
    }

    return null;
  }
}

module.exports = new DecisionEngine();
