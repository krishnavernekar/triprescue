/**
 * LLMProvider — Abstract base class for LLM provider abstraction.
 *
 * All concrete LLM providers must extend this class and implement `complete()`.
 * This abstraction allows swapping Gemini for any other provider in the future
 * without modifying LLMDecisionService or RecoveryPlanner.
 */

class LLMProvider {
  /**
   * Send a completion request to the underlying LLM.
   * @param {string} systemPrompt - The system-level instruction (immutable, role-separated)
   * @param {string} userPrompt - The user/observation prompt (may contain external data)
   * @param {Object} options - { maxTokens, temperature }
   * @returns {Promise<string>} Raw text response from the LLM
   */
  async complete(systemPrompt, userPrompt, options = {}) {
    throw new Error('LLMProvider.complete() not implemented by ' + this.name);
  }

  /**
   * Send a completion request with tool declarations for function calling.
   * @param {string} systemPrompt
   * @param {string} userPrompt
   * @param {Array<Object>} toolDeclarations
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  // eslint-disable-next-line no-unused-vars
  async completeWithTools(systemPrompt, userPrompt, toolDeclarations = [], options = {}) {
    throw new Error('LLMProvider.completeWithTools() not implemented by ' + this.name);
  }

  /**
   * Human-readable name of the provider (used in logs).
   * @returns {string}
   */
  get name() {
    return 'LLMProvider';
  }
}

module.exports = LLMProvider;
