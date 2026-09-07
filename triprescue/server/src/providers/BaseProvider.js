class BaseProvider {
  constructor(name, type) {
    this.name = name;
    this.type = type;
  }

  async search(criteria) {
    throw new Error(`${this.name}.search() not implemented`);
  }

  async getDetails(id) {
    throw new Error(`${this.name}.getDetails() not implemented`);
  }

  async revalidate(id) {
    throw new Error(`${this.name}.revalidate() not implemented`);
  }

  async getExternalLink(id) {
    throw new Error(`${this.name}.getExternalLink() not implemented`);
  }
}

module.exports = BaseProvider;
