/**
 * GeminiProvider — Phase 4 Google Gemini LLM provider.
 *
 * Calls the Gemini REST API via native fetch (Node 18+, no SDK required).
 * Enforces:
 *   - 15-second hard timeout
 *   - Structured JSON output (temperature 0.1-0.3 recommended)
 *   - Clear role-separated prompt structure
 *   - No API key exposure outside config
 *
 * Security: provider response content is NEVER used as system instructions.
 * All external data stays in the user prompt section.
 */

const LLMProvider = require('./LLMProvider');
const config = require('../config/environment');

class GeminiProvider extends LLMProvider {
  /**
   * Complete a prompt via Gemini generateContent REST API.
   * @param {string} systemPrompt - Static system instructions
   * @param {string} userPrompt - Dynamic user/observation content (may contain external data)
   * @param {Object} options - { maxTokens, temperature }
   * @returns {Promise<string>} Raw LLM text response
   */
  async complete(systemPrompt, userPrompt, options = {}) {
    const apiKey = config.geminiApiKey;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured. Set GEMINI_API_KEY in your .env file.');
    }

    const model = config.geminiModel || 'gemini-1.5-flash';
    const maxTokens = options.maxTokens || config.llmMaxTokens || 1024;
    const temperature = options.temperature !== undefined ? options.temperature : (config.llmTemperature || 0.2);

    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + apiKey;

    // Gemini API payload — system instruction + user turn separated
    const payload = {
      system_instruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
        // Encourage JSON output
        responseMimeType: 'application/json',
      },
    };

    // 15-second hard timeout using AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('Gemini API request timed out after 15 seconds');
      }
      throw new Error('Gemini API network error: ' + err.message);
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      let errBody = '';
      try {
        const errJson = await response.json();
        errBody = errJson?.error?.message || JSON.stringify(errJson);
      } catch {
        errBody = 'HTTP ' + response.status;
      }
      throw new Error('Gemini API error (' + response.status + '): ' + errBody);
    }

    const data = await response.json();

    // Extract text from Gemini response structure
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Gemini API returned an empty or malformed response (no text content)');
    }

    return text.trim();
  }

  /**
   * Complete a prompt with function declarations for Gemini tool calling.
   * @param {string} systemPrompt
   * @param {string} userPrompt
   * @param {Array<Object>} toolDeclarations - Array of Gemini function declarations
   * @param {Object} options
   * @returns {Promise<{ text?: string, functionCall?: { name: string, args: Object }, raw: Object }>}
   */
  async completeWithTools(systemPrompt, userPrompt, toolDeclarations = [], options = {}) {
    const apiKey = config.geminiApiKey;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured. Set GEMINI_API_KEY in your .env file.');
    }

    const model = config.geminiModel || 'gemini-1.5-flash';
    const maxTokens = options.maxTokens || config.llmMaxTokens || 1024;
    const temperature = options.temperature !== undefined ? options.temperature : (config.llmTemperature || 0.2);

    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + apiKey;

    const payload = {
      system_instruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
      },
    };

    if (toolDeclarations && toolDeclarations.length > 0) {
      payload.tools = [
        {
          functionDeclarations: toolDeclarations,
        },
      ];
    } else {
      payload.generationConfig.responseMimeType = 'application/json';
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('Gemini API request timed out after 15 seconds');
      }
      throw new Error('Gemini API network error: ' + err.message);
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      let errBody = '';
      try {
        const errJson = await response.json();
        errBody = errJson?.error?.message || JSON.stringify(errJson);
      } catch {
        errBody = 'HTTP ' + response.status;
      }
      throw new Error('Gemini API error (' + response.status + '): ' + errBody);
    }

    const data = await response.json();
    const candidate = data?.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    for (const part of parts) {
      if (part.functionCall) {
        return {
          functionCall: {
            name: part.functionCall.name,
            args: part.functionCall.args || {},
          },
          raw: data,
        };
      }
    }

    const textPart = parts.find((p) => p.text);
    return {
      text: textPart ? textPart.text.trim() : '',
      raw: data,
    };
  }

  get name() {
    return 'GeminiProvider';
  }
}

module.exports = GeminiProvider;
