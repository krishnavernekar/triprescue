const BaseProvider = require('../BaseProvider');

class RouteProvider extends BaseProvider {
  constructor(name = 'RouteProvider') {
    super(name, 'route');
  }

  async calculateRoute(origin, destination, mode) {
    throw new Error(`${this.name}.calculateRoute() not implemented`);
  }
}

module.exports = RouteProvider;
