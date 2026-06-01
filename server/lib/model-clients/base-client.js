// Base HTTP client for all model APIs
class BaseModelClient {
  constructor(config) {
    this.apiKey = process.env[config.api_key_env];
    this.baseUrl = config.base_url;
    this.model = config.model;
    this.maxTokens = config.max_tokens;
    this.temperature = config.temperature;
    this.provider = config.provider || 'unknown';
  }

  async chat(messages, options = {}) {
    if (!this.apiKey) {
      throw new Error(`API key not found: ${this.constructor.name} requires env var`);
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: options.max_tokens || this.maxTokens,
        temperature: options.temperature || this.temperature,
        response_format: options.json_mode ? { type: 'json_object' } : undefined,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      const err = new Error(`${this.constructor.name} API error: ${response.status} - ${error}`);
      err.status = response.status;
      err.code = `HTTP_${response.status}`;
      throw err;
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  // Check if error should trigger fallback
  shouldFallback(error) {
    if (!error) return false;
    
    const networkErrors = [
      'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 
      'ECONNRESET', 'EAI_AGAIN', 'ECONNABORTED'
    ];
    
    const isNetworkError = networkErrors.some(code => 
      error.message?.includes(code) || error.code === code
    );
    
    const isHTTPError = error.status >= 500 || 
                       error.status === 401 || 
                       error.status === 429 ||
                       error.status === 408;
    
    return isNetworkError || isHTTPError;
  }

  // Chat with automatic fallback to another client
  async chatWithFallback(messages, options = {}, fallbackClient = null) {
    try {
      const result = await this.chat(messages, options);
      return {
        content: result,
        _fallback: false,
        _model: this.model,
        _provider: this.provider
      };
    } catch (err) {
      console.error(`[${this.constructor.name}] Primary failed:`, err.message);
      
      if (fallbackClient && this.shouldFallback(err)) {
        console.log(`[Fallback] ${this.model} → ${fallbackClient.model}`);
        
        try {
          const result = await fallbackClient.chat(messages, options);
          return {
            content: result,
            _fallback: true,
            _fallback_from: this.model,
            _fallback_to: fallbackClient.model,
            _fallback_reason: err.message,
            _provider: fallbackClient.provider
          };
        } catch (fallbackErr) {
          console.error(`[Fallback] ${fallbackClient.model} also failed:`, fallbackErr.message);
          
          const finalErr = new Error(
            `Both ${this.model} and ${fallbackClient.model} failed. ` +
            `Primary: ${err.message}, Fallback: ${fallbackErr.message}`
          );
          finalErr.primaryError = err;
          finalErr.fallbackError = fallbackErr;
          throw finalErr;
        }
      }
      
      throw err;
    }
  }
}

export default BaseModelClient;