const logger = require('../config/logger');
const config = require('../config/client');
const { filterSearchResults } = require('./safetyFilter');

/**
 * Perform a search request using the Tavily search engine.
 * Returns an object: { items, searchInformation }
 */
async function searchWeb(query, num = 3) {
  // Preference: Use Tavily
  const tavilyKey = config.tavily?.apiKey || process.env.TAVILY_API_KEY;
  const tavilyUrl = config.tavily?.url || process.env.TAVILY_API_URL;
  
  if (tavilyKey) {
    logger.info('Performing Tavily Search', { query });
    try {
      const res = await fetch(tavilyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        
        logger.info('Tavily Search raw response summary', { 
          resultsCount: dataItems.length,
          query: data.query,
          responseTime: data.response_time
        });

        const normalized = dataItems.map((it) => ({
          title: it.title || it.name || '',
          snippet: it.snippet || it.content || '',
          link: it.url || it.link || '',
        })).filter(it => it.title && it.link);

        const filtered = filterSearchResults(normalized);
        const removed = normalized.length - filtered.length;
        if (removed > 0) logger.info('Safety filter removed search results', { removed });

        if (filtered.length > 0) {
          logger.info('Tavily Search results found', { count: filtered.length });
          return { items: filtered.slice(0, num), searchInformation: { source: 'tavily' } };
        } else {
          logger.warn('Tavily returned items but they were filtered out during normalization', { rawCount: dataItems.length });
        }
      } else {
        const txt = await res.text();
        logger.error('Tavily API returned non-OK:', { status: res.status, body: txt });
      }
    } catch (err) {
      logger.error('Tavily API request failed:', err);
    }
  } else {
    logger.warn('Tavily API key is not configured. Search will return no results.');
  }

  // Google Search fallback has been removed per user request to "get rid of google".
  logger.info('No results found (Tavily not configured or returned no results)');
  return { items: [], searchInformation: { source: 'none', totalResults: 0 } };
}

module.exports = { searchWeb };

