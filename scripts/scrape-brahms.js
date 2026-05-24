const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const sourcesPath = path.join(__dirname, "..", "data", "brahms-sources.json");
const outputPath = path.join(__dirname, "..", "public", "data", "brahms-performances.json");

const browserHeaders = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
  "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "accept-language": "en-GB,en;q=0.9,en-US;q=0.8",
  "cache-control": "no-cache",
  "pragma": "no-cache",
  "referer": "https://www.google.com/",
  "upgrade-insecure-requests": "1"
};

// ---------------------------------------------------------------------------
// Date range helpers
// ---------------------------------------------------------------------------

function getNextMonthDateRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1));
  const end = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 2, 0));
  return { start, end };
}

function getNextMonthLabel() {
  const { start } = getNextMonthDateRange();
  return start.toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

function isWithinNextMonth(dateString) {
  if (!dateString) return false;
  const parsed = new Date(`${dateString}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  const { start, end } = getNextMonthDateRange();
  return parsed >= start && parsed <= end;
}

// ---------------------------------------------------------------------------
// Cheerio-based HTML parsing helpers
// ---------------------------------------------------------------------------

/**
 * Extract all Wigmore Hall event links from a listing page.
 * Uses Cheerio to find <a href="/whats-on/YYYYMMDDHHII"> links.
 */
function extractEventLinks(html) {
  const $ = cheerio.load(html);
  const links = new Set();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    if (/^\/whats-on\/\d{12}$/.test(href)) {
      links.add(`https://www.wigmore-hall.org.uk${href}`);
    }
  });

  return [...links];
}

/**
 * Extract the event title from an event page.
 * Tries the first <h1>, then the <title> tag (stripped of site suffix).
 */
function extractTitle(html) {
  const $ = cheerio.load(html);

  const h1 = $("h1").first().text().trim();
  if (h1) return h1;

  const titleTag = $("title").text().trim();
  return titleTag.replace(/\s*[|\u2013\u2014-]\s*Wigmore Hall.*$/i, "").trim();
}

/**
 * Extract a <meta> tag's content by attribute name and value.
 * Uses .filter() with direct attribute comparison to avoid CSS selector injection.
 * E.g. extractMetaContent($, "name", "description") or extractMetaContent($, "property", "og:description").
 */
function extractMetaContent($, attribute, value) {
  const el = $("meta").filter((_, meta) => $(meta).attr(attribute) === value).first();
  return (el.attr("content") || "").trim();
}

/**
 * Extract the text content of a named section from an event page.
 * Looks for headings (h2–h5) whose text matches `headingText`, then collects
 * the text of all sibling/child elements until the next same-level heading.
 */
function extractSection($, headingText) {
  const normalised = headingText.toLowerCase();
  let result = "";

  $("h2, h3, h4, h5").each((_, el) => {
    if ($(el).text().trim().toLowerCase() !== normalised) return;

    // Collect following sibling text until the next heading of same/higher level
    const tagLevel = parseInt(el.tagName[1], 10);
    let sibling = $(el).next();
    const parts = [];

    while (sibling.length) {
      const sibTag = (sibling.prop("tagName") || "").toLowerCase();
      if (/^h[1-5]$/.test(sibTag) && parseInt(sibTag[1], 10) <= tagLevel) break;
      parts.push(sibling.text().trim());
      sibling = sibling.next();
    }

    const text = parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    if (text) {
      result = text;
      return false; // stop iterating once the first matching section is found
    }
  });

  return result;
}

/**
 * Extract clean body text from an event page, stripping non-content elements.
 */
function extractBodyText($) {
  $("script, style, nav, header, footer, noscript").remove();
  return $("body").text().replace(/\s+/g, " ").trim();
}

/**
 * Parse a YYYY-MM-DD date from the Wigmore event URL.
 * URL format: /whats-on/YYYYMMDDHHII
 */
function parseEventDateFromUrl(url) {
  const m = url.match(/\/whats-on\/(\d{4})(\d{2})(\d{2})\d{4}$/);
  if (!m) return "";
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * Parse a date from visible date text such as "Thursday 24 June 2026 1.00pm".
 * Falls back to the URL-derived date.
 */
function parseWigmoreDate(dateText, url) {
  const m = dateText.match(/(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/);
  if (m) {
    const parsed = new Date(`${m[1]} ${m[2]} ${m[3]} 12:00:00 UTC`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }
  return parseEventDateFromUrl(url);
}

function containsBrahms(text) {
  return /\bbrahms\b/i.test(text);
}

function normaliseWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Wigmore Hall event page extraction
// ---------------------------------------------------------------------------

/**
 * Parse a single Wigmore Hall event page and return a structured event object,
 * or null if the page does not mention Brahms.
 */
function extractWigmoreEvent(html, url) {
  const $ = cheerio.load(html);

  const title = extractTitle(html);
  const metaDescription = extractMetaContent($, "name", "description");
  const ogDescription = extractMetaContent($, "property", "og:description");
  const programme = extractSection($, "Programme");
  const overview = extractSection($, "Overview");
  const artists = extractSection($, "Artists");

  // Date: look for a visible date element; fall back to URL
  const dateEl = $("time").first().text().trim()
    || $(".event-date, .date, [class*='date']").first().text().trim()
    || "";
  const date = parseWigmoreDate(dateEl, url);

  const bodyText = extractBodyText($);

  const combinedText = [title, metaDescription, ogDescription, programme, overview, artists, bodyText]
    .filter(Boolean)
    .join(" ");

  if (!containsBrahms(combinedText)) {
    return null;
  }

  const resolvedTitle = title || "Wigmore Hall event";
  const resolvedProgramme = normaliseWhitespace(
    programme || overview || metaDescription || ogDescription || artists || bodyText || "Brahms programme"
  );

  return {
    title: resolvedTitle,
    date,
    venue: "Wigmore Hall",
    source: "Wigmore Hall",
    programme: resolvedProgramme,
    url
  };
}

// ---------------------------------------------------------------------------
// Network helpers
// ---------------------------------------------------------------------------

async function fetchHtml(url) {
  const response = await fetch(url, { headers: browserHeaders });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.text();
}

// ---------------------------------------------------------------------------
// Listing discovery
// ---------------------------------------------------------------------------

/**
 * Crawl Wigmore Hall listing pages 0–20, collect all event URLs, then filter
 * to those whose URL-encoded date falls within the next calendar month.
 * Scanning a fixed range avoids fragile early-termination heuristics that
 * caused late-month events to be missed.
 */
async function collectWigmoreEventLinks() {
  const eventLinkSet = new Set();

  for (let page = 0; page <= 20; page += 1) {
    const listingUrl = page === 0
      ? "https://www.wigmore-hall.org.uk/whats-on"
      : `https://www.wigmore-hall.org.uk/whats-on?page=${page}`;

    try {
      const listingHtml = await fetchHtml(listingUrl);
      const pageLinks = extractEventLinks(listingHtml);
      pageLinks.forEach((link) => eventLinkSet.add(link));
    } catch (error) {
      console.error(`Failed to fetch Wigmore Hall listing ${listingUrl}:`, error.message);
    }
  }

  return [...eventLinkSet]
    .filter((url) => isWithinNextMonth(parseEventDateFromUrl(url)))
    .sort();
}

// ---------------------------------------------------------------------------
// Scraping orchestration
// ---------------------------------------------------------------------------

async function scrapeWigmoreHall() {
  const eventLinks = await collectWigmoreEventLinks();
  console.log(`Discovered ${eventLinks.length} Wigmore Hall event(s) in target month`);
  const items = [];

  for (const eventUrl of eventLinks) {
    try {
      const eventHtml = await fetchHtml(eventUrl);
      const event = extractWigmoreEvent(eventHtml, eventUrl);

      if (event && event.date && isWithinNextMonth(event.date)) {
        items.push(event);
      }
    } catch (error) {
      console.error(`Failed to fetch Wigmore Hall event ${eventUrl}:`, error.message);
    }
  }

  return items.sort((a, b) => a.date.localeCompare(b.date));
}

async function scrapeSource(source) {
  if (source.id === "wigmore-hall") {
    return scrapeWigmoreHall();
  }

  return [];
}

async function main() {
  const sources = JSON.parse(fs.readFileSync(sourcesPath, "utf8"));
  const items = [];

  for (const source of sources) {
    try {
      const sourceItems = await scrapeSource(source);
      items.push(...sourceItems);
    } catch (error) {
      console.error(`Failed to scrape ${source.name}:`, error.message);
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    month: getNextMonthLabel(),
    items
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`Wrote ${items.length} items to ${outputPath}`);
}

// Export helpers for testing; only run main() when invoked directly.
module.exports = {
  extractEventLinks,
  extractTitle,
  extractMetaContent,
  extractSection,
  extractBodyText,
  parseEventDateFromUrl,
  parseWigmoreDate,
  containsBrahms,
  isWithinNextMonth,
  getNextMonthDateRange,
  extractWigmoreEvent
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
