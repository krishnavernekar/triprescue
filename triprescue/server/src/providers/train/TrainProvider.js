const BaseProvider = require('../BaseProvider');

class TrainProvider extends BaseProvider {
  constructor(name = 'TrainProvider') {
    super(name, 'train');
  }
}

module.exports = TrainProvider;
