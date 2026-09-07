/**
 * LLM factory — returns the configured LLM provider singleton.
 *
 * Currently always returns GeminiProvider.
 * Add additional providers here when needed (e.g. OpenAI, Anthropic).
 */

const GeminiProvider = require('./GeminiProvider');

let _instance = null;

/**
 * Get the singleton LLM provider instance.
 * @returns {GeminiProvider}
 */
function getLLMProvider() {
  if (!_instance) {
    _instance = new GeminiProvider();
  }
  return _instance;
}

module.exports = { getLLMProvider };
