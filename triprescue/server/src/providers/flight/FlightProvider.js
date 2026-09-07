const BaseProvider = require('../BaseProvider');

class FlightProvider extends BaseProvider {
  constructor(name = 'FlightProvider') {
    super(name, 'flight');
  }
}

module.exports = FlightProvider;
