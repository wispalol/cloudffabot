const config = require('../config/client');
const logger = require('../config/logger');
const { searchWeb } = require('./webSearch');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

function getApiKey() {
  const key = config.ai?.apiKey || process.env.AI_API_KEY;
  return key && key.trim() ? key : null;
}

function getModel() {
  return config.ai?.model || process.env.AI_MODEL || 'claude-3-5-sonnet-20241022';
}

async function callClaude(messages, systemPrompt, maxTokens = 1024) {
  const apiKey = getApiKey();
  if (!apiKey) {
    logger.warn('Claude API key not configured');
    return null;
  }

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  };

  const body = JSON.stringify({
    model: getModel(),
    system: systemPrompt,
    messages,
    max_tokens: maxTokens,
    temperature: 0.7,
  });

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers,
      body,
    });

    if (!res.ok) {
      const errText = await res.text();
      logger.error('Claude API error', { status: res.status, body: errText });
      return null;
    }

    const data = await res.json();
    return data.content?.[0]?.text?.trim() || null;
  } catch (err) {
    logger.error('Claude API request failed:', err);
    return null;
  }
}

async function askClaude(query, searchResults = null) {
  const systemPrompt = `You are a helpful assistant for the CloudFFA Discord server community.
Your role is to answer users' questions clearly, accurately, and conversationally.
Keep answers concise (3-6 sentences) unless the question requires more detail.
Be friendly, professional, and direct.
If you don't know something, say so honestly rather than making up information.
If search results are provided, use them to inform your answer and cite sources naturally.
Do not mention "based on the search results" or "according to the provided links" — just give the answer.`;

  let userMessage;
  if (searchResults && searchResults.length > 0) {
    const context = searchResults
      .map((it, i) => `[${i + 1}] ${it.title}\n${it.snippet}\nSource: ${it.link}`)
      .join('\n\n');

    userMessage = `User Question: "${query}"

Here are some relevant search results to help answer:

${context}

Please answer the user's question based on these results and your own knowledge.`;
  } else {
    userMessage = query;
  }

  return callClaude(
    [{ role: 'user', content: userMessage }],
    systemPrompt,
    1024
  );
}

async function askClaudeWithSearch(query, numResults = 5) {
  const tavilyKey = config.tavily?.apiKey || process.env.TAVILY_API_KEY;
  let searchResults = null;

  if (tavilyKey) {
    try {
      const result = await searchWeb(query, numResults);
      if (result.items && result.items.length > 0) {
        searchResults = result.items;
      }
    } catch (err) {
      logger.warn('Search failed for Claude query, proceeding without search results:', err);
    }
  }

  const answer = await askClaude(query, searchResults);
  return { answer, searchResults };
}

function isConfigured() {
  const provider = config.ai?.provider || process.env.AI_PROVIDER;
  const key = getApiKey();
  return provider === 'claude' && !!key;
}

module.exports = { askClaude, askClaudeWithSearch, callClaude, isConfigured };
