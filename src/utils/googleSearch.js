const logger = require('../config/logger');
const config = require('../config/client');

/**
 * Perform a search request using Google Custom Search or Tavily.
 * Returns an object: { items, searchInformation }
 */
async function searchGoogle(query, num = 3) {
  const apiKey = config.search?.apiKey || process.env.GOOGLE_API_KEY;
  const cx = config.search?.cx || process.env.GOOGLE_CX;

  logger.debug('Search credentials check', { 
    hasApiKey: !!apiKey, 
    hasCx: !!cx, 
    apiKeyPrefix: apiKey ? apiKey.substring(0, 5) : 'none',
    cxValue: cx
  });

  // Tavily primary support: if configured, use Tavily API first
  const tavilyKey = config.tavily?.apiKey || process.env.TAVILY_API_KEY;
  const tavilyUrl = config.tavily?.url || process.env.TAVILY_API_URL;
  if (tavilyKey) {
    try {
      const headers = { 
        'Content-Type': 'application/json'
      };
      
      const res = await fetch(tavilyUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          api_key: tavilyKey,
          query,
          search_depth: "basic",
          include_answer: false,
          max_results: Math.min(Math.max(num, 1), 10)
        })
      });

      if (res.ok) {
        const data = await res.json();
        const dataItems = data.results || [];
        // Ensure items have title/snippet/link properties if possible
        const items = Array.isArray(dataItems) ? dataItems : [];
        const normalized = items.map((it) => {
          if (!it) return null;
          return {
            title: it.title || it.name || it.heading || '',
            snippet: it.snippet || it.excerpt || it.summary || it.text || '',
            link: it.link || it.url || it.href || it.first_url || '',
          };
        }).filter(Boolean);
        return { items: normalized.slice(0, num), searchInformation: { source: 'tavily' } };
      }
      // fallthrough to next provider if tavily fails
      const txt = await res.text();
      logger.error('Tavily API returned non-OK:', { status: res.status, body: txt });
    } catch (err) {
      logger.error('Tavily API request failed:', err);
      // continue to fallback providers
    }
  }

  // Prefer Google Custom Search when configured
  if (apiKey && cx) {
    try {
      const url = new URL('https://www.googleapis.com/customsearch/v1');
      url.searchParams.set('key', apiKey);
      url.searchParams.set('cx', cx);
      url.searchParams.set('q', query);
      url.searchParams.set('num', String(Math.min(Math.max(num, 1), 10)));

      logger.info('Performing Google Search', { 
        query,
        apiKey: apiKey ? `${apiKey.substring(0, 5)}...${apiKey.substring(apiKey.length - 5)}` : 'none',
        cx
      });
      const res = await fetch(url.toString());
      if (!res.ok) {
        const text = await res.text();
        logger.error('Google Search API error', { status: res.status, body: text });
        // Return a special item to indicate API error if helpful
        return { items: [], searchInformation: { source: 'google', error: res.status, errorText: text } };
      } else {
        const data = await res.json();
        if (data.items && data.items.length > 0) {
          logger.info('Google Search results found', { count: data.items.length });
          return { items: data.items, searchInformation: { source: 'google', totalResults: data.searchInformation?.totalResults } };
        } else {
          logger.info('Google Search returned no items');
        }
      }
    } catch (err) {
      logger.error('Google Search request failed:', err);
    }
  }

  // If nothing found in any provider, return empty items array
  // The consumer (autoResponder/search command) will handle showing the fallback message
  logger.info('No results found in any provider');
  return { items: [], searchInformation: { source: 'none', totalResults: 0 } };
}

module.exports = { searchGoogle };

