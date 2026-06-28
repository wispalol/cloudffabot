/**
 * Very small heuristic summarizer: takes search result items (with snippet/title)
 * and builds a short, human-readable answer by selecting the first few sentences
 * from the collected snippets. This is not an AI summarizer but gives quick
 * helpful answers for many queries.
 */
function summarizeFromItems(items, maxChars = 400) {
  if (!items || items.length === 0) return null;

  // Collect snippet-like text from items
  const texts = [];
  for (const it of items) {
    if (it.snippet && it.snippet.length) {
      // Don't include the generic "No instant answer" fallback snippet in the summary
      if (it.snippet.includes('No instant answer found')) continue;
      texts.push(it.snippet);
    }
    else if (it.title && it.title.length) {
      if (it.title.includes('Search for "')) continue;
      texts.push(it.title);
    }
  }

  if (texts.length === 0) return null;

  const combined = texts.join(' ').replace(/\s+/g, ' ').trim();

  // Split into sentences (very basic)
  const sentences = combined.match(/[^.!?\n]+[.!?]?/g) || [combined];

  let out = '';
  for (const s of sentences) {
    if ((out + ' ' + s).trim().length > maxChars) break;
    out = (out + ' ' + s).trim();
  }

  // If still empty, fall back to first snippet truncated
  if (!out) {
    out = texts[0].slice(0, maxChars);
  }

  // Clean and ensure reasonable ending
  out = out.replace(/\s+/g, ' ').trim();
  if (!/[.!?]$/.test(out)) out = out + '...';
  return out;
}

module.exports = { summarizeFromItems };

