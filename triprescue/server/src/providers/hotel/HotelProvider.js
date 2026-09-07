const BaseProvider = require('../BaseProvider');

class HotelProvider extends BaseProvider {
  constructor(name = 'HotelProvider') {
    super(name, 'hotel');
  }
}

module.exports = HotelProvider;
