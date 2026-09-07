const { describe, it } = require('node:test');
const assert = require('node:assert');
const Trip = require('../models/Trip');

describe('Trip Model', () => {
  it('should have correct schema fields', () => {
    const trip = new Trip({
      passengerName: 'Test User',
      passengerCount: 1,
      origin: 'BLR',
      destination: 'JAI',
      departureTime: new Date(),
    });

    assert.strictEqual(trip.passengerName, 'Test User');
    assert.strictEqual(trip.passengerCount, 1);
    assert.strictEqual(trip.origin, 'BLR');
    assert.strictEqual(trip.destination, 'JAI');
    assert.strictEqual(trip.status, 'draft');
    assert.strictEqual(trip.disruptionType, 'none');
    assert.strictEqual(trip.priority, 'balanced');
    assert.strictEqual(trip.maxAdditionalBudget, 0);
  });

  it('should require passengerName', () => {
    const trip = new Trip({
      origin: 'BLR',
      destination: 'JAI',
      departureTime: new Date(),
    });
    const error = trip.validateSync();
    assert.ok(error);
    assert.ok(error.errors.passengerName);
  });

  it('should require origin', () => {
    const trip = new Trip({
      passengerName: 'Test',
      destination: 'JAI',
      departureTime: new Date(),
    });
    const error = trip.validateSync();
    assert.ok(error);
    assert.ok(error.errors.origin);
  });

  it('should enforce valid status enum', () => {
    const trip = new Trip({
      passengerName: 'Test',
      origin: 'BLR',
      destination: 'JAI',
      departureTime: new Date(),
      status: 'invalid_status',
    });
    const error = trip.validateSync();
    assert.ok(error);
    assert.ok(error.errors.status);
  });

  it('should enforce minimum passenger count', () => {
    const trip = new Trip({
      passengerName: 'Test',
      origin: 'BLR',
      destination: 'JAI',
      departureTime: new Date(),
      passengerCount: 0,
    });
    const error = trip.validateSync();
    assert.ok(error);
    assert.ok(error.errors.passengerCount);
  });
});
