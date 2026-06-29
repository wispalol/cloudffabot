const config = require('../config/client');
const logger = require('../config/logger');

/**
 * AI-powered summarizer that uses OpenAI or Groq to generate a human-readable answer.
 * @param {string} query The original user question.
 * @param {Array} items Search results from the search utility.
 * @returns {Promise<string|null>}
 */
async function aiSummarize(query, items) {
  const { provider, apiKey, model } = config.ai;

  if (!apiKey) {
    logger.debug('AI API key not found, skipping AI summarization');
    return null;
  }

  if (!items || items.length === 0) return null;

  // Prepare context from search results
  const context = items.map((it, idx) => `[${idx + 1}] Title: ${it.title}\nSnippet: ${it.snippet}\nLink: ${it.link}`).join('\n\n');

  const systemPrompt = `You are a helpful assistant for the CloudFFA Discord server. 
Your goal is to answer the user's question based ONLY on the provided search results.
Keep your answer concise (2-4 sentences), professional, and friendly.
If the search results don't contain enough information to answer the question, say you don't know but provide the most relevant information found.
Do not mention "search results" or "provided links" in your answer unless necessary.
Just provide the direct answer.`;

  const userPrompt = `User Question: "${query}"

Search Results:
${context}

Answer the question based on the results above:`;

  try {
    let apiUrl = '';
    let selectedModel = model;
    let headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    };

    if (provider === 'openai') {
      apiUrl = 'https://api.openai.com/v1/chat/completions';
      selectedModel = model || 'gpt-3.5-turbo';
    } else if (provider === 'groq') {
      apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
      selectedModel = model || 'mixtral-8x7b-32768';
    } else if (provider === 'claude') {
      apiUrl = 'https://api.anthropic.com/v1/messages';
      selectedModel = model || 'claude-3-5-sonnet-20240620';
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
      delete headers['Authorization'];
    } else {
      logger.error('Unknown AI provider configured:', provider);
      return null;
    }

    let body;
    if (provider === 'claude') {
      body = JSON.stringify({
        model: selectedModel,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 250,
        temperature: 0.7
      });
    } else {
      body = JSON.stringify({
        model: selectedModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 250,
        temperature: 0.7
      });
    }

    logger.info(`Requesting AI summary from ${provider}`, { query, model: selectedModel });
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: body
    });

    if (!res.ok) {
      const errText = await res.text();
      logger.error(`AI API error (${provider})`, { status: res.status, body: errText });
      return null;
    }

    const data = await res.json();
    let answer;
    if (provider === 'claude') {
      answer = data.content?.[0]?.text?.trim();
    } else {
      answer = data.choices?.[0]?.message?.content?.trim();
    }
    
    if (answer) {
      logger.info(`AI summary generated successfully (${provider})`);
      return answer;
    }

    logger.warn(`AI provider (${provider}) returned an empty answer`);
    return null;
  } catch (err) {
    logger.error(`AI summarization failed (${provider}):`, err);
    return null;
  }
}

module.exports = { aiSummarize };
