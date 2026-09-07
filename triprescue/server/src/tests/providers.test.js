const { describe, it } = require('node:test');
const assert = require('node:assert');
const { getProvider } = require('../providers');

describe('Provider Factory', () => {
  it('should create mock flight provider', () => {
    const provider = getProvider('flight', 'mock');
    assert.strictEqual(provider.name, 'MockFlightProvider');
    assert.strictEqual(provider.type, 'flight');
  });

  it('should create mock train provider', () => {
    const provider = getProvider('train', 'mock');
    assert.strictEqual(provider.name, 'MockTrainProvider');
    assert.strictEqual(provider.type, 'train');
  });

  it('should create mock bus provider', () => {
    const provider = getProvider('bus', 'mock');
    assert.strictEqual(provider.name, 'MockBusProvider');
    assert.strictEqual(provider.type, 'bus');
  });

  it('should create mock hotel provider', () => {
    const provider = getProvider('hotel', 'mock');
    assert.strictEqual(provider.name, 'MockHotelProvider');
    assert.strictEqual(provider.type, 'hotel');
  });

  it('should create mock route provider', () => {
    const provider = getProvider('route', 'mock');
    assert.strictEqual(provider.name, 'MockRouteProvider');
    assert.strictEqual(provider.type, 'route');
  });

  it('mock flight provider search should return empty results', async () => {
    const provider = getProvider('flight', 'mock');
    const result = await provider.search({});
    assert.ok(Array.isArray(result.results));
    assert.strictEqual(result.results.length, 0);
  });

  it('mock route provider should return null duration', async () => {
    const provider = getProvider('route', 'mock');
    const result = await provider.calculateRoute('BLR', 'DEL', 'driving');
    assert.strictEqual(result.duration, null);
    assert.strictEqual(result.origin, 'BLR');
    assert.strictEqual(result.destination, 'DEL');
  });
});
