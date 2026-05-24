const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const sourcesPath = path.join(__dirname, "..", "data", "brahms-sources.json");
const outputPath = path.join(__dirname, "..", "public", "data", "brahms-performances.json");
const brahmsWorksPath = path.join(__dirname, "data", "brahms-works.json");

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
    const headingTag = String(el.tagName || "").toLowerCase();
    const tagLevel = parseInt(headingTag[1], 10);
    if (Number.isNaN(tagLevel)) return;
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

function extractStructuredProgrammeItems($) {
  const items = [];

  $("h2, h3, h4, h5").each((_, el) => {
    if ($(el).text().trim().toLowerCase() !== "programme") return;

    const headingTag = String(el.tagName || "").toLowerCase();
    const tagLevel = parseInt(headingTag[1], 10);
    if (Number.isNaN(tagLevel)) return;
    let sibling = $(el).next();

    while (sibling.length) {
      const sibTag = (sibling.prop("tagName") || "").toLowerCase();
      if (/^h[1-5]$/.test(sibTag) && parseInt(sibTag[1], 10) <= tagLevel) break;

      if (sibTag === "table") {
        sibling.find("tr").each((_, row) => {
          const cells = $(row).find("th, td").map((_, cell) => normaliseWhitespace($(cell).text())).get().filter(Boolean);
          if (cells.length > 0) items.push(cells);
        });
      } else if (sibTag === "ul" || sibTag === "ol") {
        sibling.find("li").each((_, item) => {
          const text = normaliseWhitespace($(item).text());
          if (text) items.push([text]);
        });
      } else {
        const text = normaliseWhitespace(sibling.text());
        if (text) items.push([text]);
      }

      sibling = sibling.next();
    }

    return false;
  });

  return items;
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
  // Some extraction paths can collapse adjacent tokens (e.g. "BrahmsViolin" or
  // "Brahms1833" when element text is concatenated without spaces), so split on
  // both lowercase→uppercase and letter→digit boundaries before word-boundary matching.
  const value = (text || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2");
  return /\bbrahms\b/i.test(value);
}

function normaliseWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function normaliseForMatch(value) {
  return normaliseWhitespace(
    value
      .toLowerCase()
      .replace(/[’']/g, "")
      .replace(/opus/g, "op")
      .replace(/op\./g, "op")
      .replace(/no\./g, "no")
      .replace(/[–—-]/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
  );
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textContainsTerm(normalisedText, term) {
  if (!term) return false;
  return new RegExp(`\\b${escapeRegex(term)}\\b`).test(normalisedText);
}

function getBrahmsWorksLibrary() {
  try {
    return JSON.parse(fs.readFileSync(brahmsWorksPath, "utf8"));
  } catch (_) {
    return [];
  }
}

const brahmsWorksLibrary = getBrahmsWorksLibrary();

function findBrahmsProgrammeMatches(text) {
  const normalisedText = normaliseForMatch(text);
  if (!normalisedText) return [];

  const matches = [];

  for (const work of brahmsWorksLibrary) {
    const aliases = (work.aliases || []).map(normaliseForMatch).filter(Boolean);
    const requiredTerms = (work.required_terms || []).map(normaliseForMatch).filter(Boolean);
    const optionalTerms = (work.optional_terms || []).map(normaliseForMatch).filter(Boolean);
    const opusTerm = work.opus ? normaliseForMatch(`op ${work.opus}`) : "";

    const aliasIndexes = aliases
      .map((alias) => normalisedText.indexOf(alias))
      .filter((index) => index >= 0);
    const hasAliasMatch = aliasIndexes.length > 0;
    const requiredTermsMatched = requiredTerms.every((term) => textContainsTerm(normalisedText, term));
    const optionalMatches = optionalTerms.filter((term) => textContainsTerm(normalisedText, term)).length;
    const hasOpusMatch = opusTerm ? textContainsTerm(normalisedText, opusTerm) : false;

    const isConfidentMatch =
      (hasAliasMatch && (requiredTerms.length === 0 || requiredTermsMatched))
      || (requiredTermsMatched && hasOpusMatch)
      || (requiredTermsMatched && optionalMatches >= 2);

    if (!isConfidentMatch) continue;

    const position =
      (hasAliasMatch ? Math.min(...aliasIndexes) : Infinity) !== Infinity
        ? Math.min(...aliasIndexes)
        : requiredTerms.reduce((minIndex, term) => {
          const index = normalisedText.indexOf(term);
          return index >= 0 ? Math.min(minIndex, index) : minIndex;
        }, Infinity);

    matches.push({
      work,
      position: Number.isFinite(position) ? position : Number.MAX_SAFE_INTEGER,
    });
  }

  const deduped = new Map();
  matches
    .sort((a, b) => a.position - b.position)
    .forEach(({ work }) => {
      if (!deduped.has(work.id)) {
        deduped.set(work.id, work.canonical_title);
      }
    });

  return [...deduped.values()];
}

function extractInlineBrahmsTitle(text) {
  const match = normaliseWhitespace(text).match(/\bbrahms\b\s*[:\-–—]\s*(.+)$/i);
  return match ? normaliseWhitespace(match[1]) : "";
}

function cleanStructuredWorkTitle(text) {
  return normaliseWhitespace(
    text
      .replace(/^johannes\s+brahms\b\s*[:\-–—]?\s*/i, "")
      .replace(/^brahms\b\s*[:\-–—]?\s*/i, "")
      .replace(/^[\s:–—-]+/, "")
  );
}

/**
 * Add a comma before "Op." when not already preceded by a comma.
 * E.g. "String Quintet in F Op. 88" → "String Quintet in F, Op. 88".
 */
function normaliseWorkTitleOpComma(title) {
  return title.replace(/([^,])\s+([Oo]p\.)/, "$1, $2");
}

/**
 * Extract Brahms work titles from Wigmore Hall's native repertoire item markup.
 * Targets .repertoire-work-item elements where the composer name appears in the
 * left-side artist link and performed work titles appear in the right-side
 * .repertoire-list .rich-text.inline.bold elements.
 * Returns an array of work title strings, canonicalised through the catalog where
 * a confident match exists, otherwise lightly normalised.
 */
function extractBrahmsWorksFromWigmoreRepertoire($) {
  const titles = [];

  $(".repertoire-work-item").each((_, item) => {
    const composerText = $(item).find("a[href^='/artists/']").first().text().trim();
    if (!containsBrahms(composerText)) return;

    $(item).find(".repertoire-list .rich-text.inline.bold").each((_, workEl) => {
      const rawTitle = normaliseWhitespace($(workEl).text());
      if (!rawTitle) return;

      const matched = findBrahmsProgrammeMatches(rawTitle);
      if (matched.length >= 1) {
        matched.forEach((t) => titles.push(t));
      } else {
        titles.push(normaliseWorkTitleOpComma(rawTitle));
      }
    });
  });

  const deduped = new Map();
  titles.forEach((title) => {
    const key = normaliseForMatch(title);
    if (key && !deduped.has(key)) {
      deduped.set(key, title);
    }
  });

  return [...deduped.values()];
}

function extractBrahmsWorksFromStructuredProgramme(items) {
  const titles = [];

  items.forEach((item) => {
    const parts = item.map((value) => normaliseWhitespace(value)).filter(Boolean);
    if (parts.length === 0 || !parts.some((part) => containsBrahms(part))) return;

    const candidates = [];
    const nonBrahmsParts = parts.filter((part) => !containsBrahms(part));
    candidates.push(...nonBrahmsParts);
    parts.filter((part) => containsBrahms(part)).forEach((part) => {
      const inlineTitle = extractInlineBrahmsTitle(part);
      if (inlineTitle) candidates.push(inlineTitle);
    });

    candidates
      .map(cleanStructuredWorkTitle)
      .filter(Boolean)
      .filter((title) => !containsBrahms(title))
      .forEach((title) => {
        const matchedTitles = findBrahmsProgrammeMatches(title);
        if (matchedTitles.length === 1) {
          titles.push(matchedTitles[0]);
        } else {
          titles.push(title);
        }
      });
  });

  const deduped = new Map();
  titles.forEach((title) => {
    const key = normaliseForMatch(title);
    if (key && !deduped.has(key)) {
      deduped.set(key, title);
    }
  });

  return [...deduped.values()];
}

function resolveWigmoreProgramme({
  programme,
  overview,
  metaDescription,
  ogDescription,
  artists,
  bodyText,
  structuredProgrammeItems,
  wigmoreRepertoireWorks
}) {
  const fallback = normaliseWhitespace(
    programme || overview || metaDescription || ogDescription || artists || bodyText || "Brahms programme"
  );

  // Priority 1: Wigmore-specific repertoire item markup (.repertoire-work-item)
  if ((wigmoreRepertoireWorks || []).length > 0) {
    return wigmoreRepertoireWorks.join(" / ");
  }

  // Priority 2: Generic structured Programme section parsing
  const structuredMatches = extractBrahmsWorksFromStructuredProgramme(structuredProgrammeItems || []);
  if (structuredMatches.length > 0) {
    return structuredMatches.join(" / ");
  }

  const candidateText = [programme, overview, metaDescription, ogDescription, artists, bodyText]
    .filter(Boolean)
    .join(" ");
  const workMatches = findBrahmsProgrammeMatches(candidateText);

  if (workMatches.length > 0) {
    return workMatches.join(" / ");
  }

  return fallback;
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
  const structuredProgrammeItems = extractStructuredProgrammeItems($);
  const wigmoreRepertoireWorks = extractBrahmsWorksFromWigmoreRepertoire($);
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
  const resolvedProgramme = resolveWigmoreProgramme({
    programme,
    overview,
    metaDescription,
    ogDescription,
    artists,
    bodyText,
    structuredProgrammeItems,
    wigmoreRepertoireWorks,
  });

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
 * Extract event links from the currently rendered Playwright page DOM.
 * @param {import('playwright').Page} page
 * @returns {Promise<string[]>}
 */
async function extractRenderedEventLinks(page) {
  return page.$$eval("a[href]", (els) =>
    els
      .map((el) => el.getAttribute("href") || "")
      .filter((href) => /^\/whats-on\/\d{12}$/.test(href))
      .map((href) => `https://www.wigmore-hall.org.uk${href}`)
  );
}

/**
 * Discover Wigmore Hall event links by rendering the listing page with a
 * headless browser and scrolling to trigger lazy-loaded / infinite-scroll content.
 * @returns {Promise<string[]>} Array of full event URLs within the next calendar month, sorted.
 */
async function collectWigmoreEventLinksWithBrowser() {
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch (_) {
    throw new Error(
      "playwright is not installed. Run: npm install && npm run playwright:install"
    );
  }

  const eventLinkSet = new Set();
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ userAgent: browserHeaders["user-agent"] });
    const page = await context.newPage();

    await page.goto("https://www.wigmore-hall.org.uk/whats-on", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // Scroll repeatedly to trigger lazy loading; stop once the link count stabilises
    // across three consecutive scroll attempts (no new links loaded).
    // 30 scrolls provides enough headroom to load a full month of events from a
    // typical Wigmore Hall listing page without waiting indefinitely.
    const MAX_SCROLLS = 30;
    let previousCount = 0;
    let stableRounds = 0;

    for (let i = 0; i < MAX_SCROLLS; i++) {
      const links = await extractRenderedEventLinks(page);
      links.forEach((l) => eventLinkSet.add(l));

      if (eventLinkSet.size === previousCount) {
        stableRounds++;
        if (stableRounds >= 3) break;
      } else {
        stableRounds = 0;
        previousCount = eventLinkSet.size;
      }

      // Scroll to bottom and wait for new content to render
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      // Wait for network activity from lazy loading to settle before extracting new links
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    }

    // Final pass after all scrolling is complete
    const finalLinks = await extractRenderedEventLinks(page);
    finalLinks.forEach((l) => eventLinkSet.add(l));

    console.log(`Browser discovery: found ${eventLinkSet.size} total Wigmore event link(s)`);
  } finally {
    await browser.close();
  }

  return [...eventLinkSet]
    .filter((url) => isWithinNextMonth(parseEventDateFromUrl(url)))
    .sort();
}

/**
 * Fallback: crawl Wigmore Hall listing pages 0–20 using plain HTTP fetches.
 * This works for statically-rendered events but may miss lazy-loaded content.
 * @returns {Promise<string[]>} Array of full event URLs within the next calendar month, sorted.
 */
async function collectWigmoreEventLinksStatic() {
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

/**
 * Discover Wigmore Hall event links for the next calendar month.
 * Attempts browser-based rendering first to handle lazy-loaded listing pages;
 * falls back to static HTML fetching if Playwright is unavailable.
 * @returns {Promise<string[]>}
 */
async function collectWigmoreEventLinks() {
  try {
    return await collectWigmoreEventLinksWithBrowser();
  } catch (err) {
    console.warn(`Browser-based listing discovery failed (${err.message}); falling back to static HTML fetching.`);
    return collectWigmoreEventLinksStatic();
  }
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
  extractWigmoreEvent,
  collectWigmoreEventLinksStatic,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
