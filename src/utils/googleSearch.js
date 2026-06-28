const logger = require('../config/logger');
const config = require('../config/client');

/**
 * Perform a search request. If Google Custom Search credentials are available,
 * use Google; otherwise fall back to DuckDuckGo Instant Answer API.
 * Returns an object: { items, searchInformation }
 */
async function searchGoogle(query, num = 3) {
  const apiKey = config.search?.apiKey || process.env.GOOGLE_API_KEY;
  const cx = config.search?.cx || process.env.GOOGLE_CX;

  // Tavily primary support: if configured, use Tavily API first
  const tavilyKey = config.tavily?.apiKey || process.env.TAVILY_API_KEY;
  const tavilyUrl = config.tavily?.url || process.env.TAVILY_API_URL;
  if (tavilyKey && tavilyUrl) {
    try {
      const tUrl = new URL(tavilyUrl);
      tUrl.searchParams.set('q', query);
      tUrl.searchParams.set('num', String(Math.min(Math.max(num, 1), 10)));

      const headers = { 'Accept': 'application/json' };
      // Prefer Bearer Authorization but some endpoints may accept key param
      headers['Authorization'] = `Bearer ${tavilyKey}`;

      const res = await fetch(tUrl.toString(), { headers });
      if (res.ok) {
        const data = await res.json();
        // Normalize common shapes: items | results | data.results
        const dataItems = data.items || data.results || data.data?.results || [];
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

      const res = await fetch(url.toString());
      if (!res.ok) {
        const text = await res.text();
        logger.error('Google Search API error', { status: res.status, body: text });
      } else {
        const data = await res.json();
        if (data.items && data.items.length > 0) {
          return { items: data.items, searchInformation: { source: 'google', totalResults: data.searchInformation?.totalResults } };
        }
      }
    } catch (err) {
      logger.error('Google Search request failed:', err);
    }
  }

  // Fallback: DuckDuckGo Instant Answer API (no key required)
  try {
    const ddgUrl = new URL('https://api.duckduckgo.com/');
    ddgUrl.searchParams.set('q', query);
    ddgUrl.searchParams.set('format', 'json');
    ddgUrl.searchParams.set('no_html', '1');
    ddgUrl.searchParams.set('no_redirect', '1');

    const res = await fetch(ddgUrl.toString());
    if (!res.ok) {
      const text = await res.text();
      logger.error('DuckDuckGo API error', { status: res.status, body: text });
      throw new Error(`DuckDuckGo API ${res.status}`);
    }

    const json = await res.json();
    const items = [];

    // Parse RelatedTopics and Results (varies depending on query)
    function pushTopic(t) {
      if (!t) return;
      if (t.Text && t.FirstURL) {
        items.push({
          title: t.Text.split(' - ')[0] || t.Text,
          snippet: t.Text,
          link: t.FirstURL,
        });
      }
    }

    if (json.AbstractText && json.AbstractText.length) {
      items.push({
        title: json.Heading || 'Instant Answer',
        snippet: json.AbstractText,
        link: json.AbstractURL || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`
      });
    }

    if (json.Answer && typeof json.Answer === 'string' && json.Answer.length) {
      items.push({
        title: 'Instant Answer',
        snippet: json.Answer,
        link: json.AbstractURL || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`
      });
    }

    if (Array.isArray(json.Results) && json.Results.length) {
      json.Results.forEach((r) => pushTopic(r));
    }

    if (Array.isArray(json.RelatedTopics) && json.RelatedTopics.length) {
      json.RelatedTopics.forEach((t) => {
        if (t.Topics && Array.isArray(t.Topics)) {
          t.Topics.forEach(pushTopic);
        } else {
          pushTopic(t);
        }
      });
    }

    // If nothing found in DDG API, include an entry pointing to the search page
    if (items.length === 0) {
      const ddgSearchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
      items.push({ 
        title: `Search for "${query}"`, 
        snippet: `No instant answer found. Click below to see full results on the web.`, 
        link: ddgSearchUrl 
      });
    }

    return { items: items.slice(0, num), searchInformation: { source: 'duckduckgo', totalResults: items.length } };
  } catch (error) {
    logger.error('Fallback search failed:', error);
    throw error;
  }
}

module.exports = { searchGoogle };

