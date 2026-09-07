const BaseProvider = require('../BaseProvider');

class BusProvider extends BaseProvider {
  constructor(name = 'BusProvider') {
    super(name, 'bus');
  }
}

module.exports = BusProvider;
