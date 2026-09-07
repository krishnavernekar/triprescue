const { describe, it } = require('node:test');
const assert = require('node:assert');
const app = require('../app');
const http = require('http');

describe('Health endpoint', () => {
  let server;
  let port;

  it('should return health status', async () => {
    // Create a simple test using http module against the express app
    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, () => {
        port = server.address().port;
        resolve();
      });
    });

    const response = await fetch(`http://localhost:${port}/api/health`);
    const data = await response.json();

    assert.strictEqual(response.status, 200);
    assert.strictEqual(data.status, 'ok');
    assert.ok(data.timestamp);
    assert.ok(data.version || data.phase);
    assert.ok(data.providers);
    assert.ok(data.providers.flight);

    server.close();
  });

  it('should return 404 for unknown routes', async () => {
    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, () => {
        port = server.address().port;
        resolve();
      });
    });

    const response = await fetch(`http://localhost:${port}/api/nonexistent`);
    assert.strictEqual(response.status, 404);

    server.close();
  });
});
