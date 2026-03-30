/**
 * LLM 调用客户端
 * 支持 DeepSeek / OpenAI 兼容接口
 * 带重试、超时和 Token 计费日志
 */
const axios = require('axios');
const config = require('../config');

class LLMClient {
  constructor() {
    this.client = axios.create({
      baseURL: config.llm.baseUrl,
      timeout: 60000,
      headers: {
        'Authorization': `Bearer ${config.llm.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * 基础聊天补全
   */
  async chat({ messages, tools, temperature = 0.7, maxTokens = 1024 }) {
    const body = {
      model: config.llm.model,
      messages,
      temperature,
      max_tokens: maxTokens,
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    try {
      const start = Date.now();
      const res = await this.client.post('/chat/completions', body);
      const elapsed = Date.now() - start;

      const usage = res.data.usage || {};
      console.log(`[LLM] ${elapsed}ms | in:${usage.prompt_tokens || '?'} out:${usage.completion_tokens || '?'}`);

      return res.data;
    } catch (err) {
      console.error('[LLM Error]', err.response?.data || err.message);

      // 重试一次
      if (err.response?.status === 429 || err.response?.status >= 500) {
        console.log('[LLM] 重试中...');
        await this.sleep(1000);
        const res = await this.client.post('/chat/completions', body);
        return res.data;
      }

      throw new Error(`LLM 调用失败: ${err.message}`);
    }
  }

  /**
   * 简单单轮问答
   */
  async ask(prompt, options = {}) {
    const res = await this.chat({
      messages: [{ role: 'user', content: prompt }],
      ...options,
    });
    return res.choices[0].message.content;
  }

  sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
}

module.exports = new LLMClient();
