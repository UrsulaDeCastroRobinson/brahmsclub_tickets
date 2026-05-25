const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const brahmsWorks = require("./data/brahms-works.json");

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

function getSixMonthDateRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 7, 0, 23, 59, 59, 999));
  return { start, end };
}

function getSixMonthLabel() {
  const now = new Date();
  const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const sixthMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 6, 1));
  const sameYear = currentMonthStart.getUTCFullYear() === sixthMonthStart.getUTCFullYear();
  if (sameYear) {
    const month1 = currentMonthStart.toLocaleString("en-GB", { month: "long", timeZone: "UTC" });
    const month2 = sixthMonthStart.toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
    return `${month1}–${month2}`;
  }
  const label1 = currentMonthStart.toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const label2 = sixthMonthStart.toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  return `${label1}–${label2}`;
}

function isWithinSixMonthRange(dateString) {
  if (!dateString) return false;
  const parsed = new Date(`${dateString}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  const { start, end } = getSixMonthDateRange();
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

function normaliseForMatch(value) {
  return normaliseWhitespace(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const brahmsAliasMap = new Map(
  brahmsWorks.flatMap((work) =>
    [work.canonical_title, ...(work.aliases || [])].map((alias) => [normaliseForMatch(alias), work.canonical_title])
  )
);

function canonicaliseBrahmsWorkTitle(title) {
  const normalisedTitle = normaliseForMatch(title);
  if (!normalisedTitle) return "";

  if (brahmsAliasMap.has(normalisedTitle)) {
    return brahmsAliasMap.get(normalisedTitle);
  }

  const candidates = brahmsWorks
    .map((work) => ({
      work,
      matchesRequired: (work.required_terms || []).every((term) => normalisedTitle.includes(normaliseForMatch(term))),
      optionalMatches: (work.optional_terms || []).filter((term) => normalisedTitle.includes(normaliseForMatch(term))).length,
    }))
    .filter((candidate) => candidate.matchesRequired);

  if (!candidates.length) return "";

  const bestOptionalMatches = Math.max(...candidates.map((candidate) => candidate.optionalMatches));
  if (bestOptionalMatches === 0) return "";

  const bestCandidates = candidates.filter((candidate) => candidate.optionalMatches === bestOptionalMatches);
  return bestCandidates.length === 1 ? bestCandidates[0].work.canonical_title : "";
}

function isBrahmsRepertoireBlock($, block) {
  const hasBrahmsComposerLink = $(block)
    .find("a[href]")
    .toArray()
    .some((link) => /\/artists\/johannes-brahms\/?$/i.test($(link).attr("href") || ""));

  if (hasBrahmsComposerLink) return true;

  const composerText = [
    $(block).find("[class*='composer']").text(),
    $(block).find('a[href*="/artists/"]').map((_, link) => $(link).text()).get().join(" "),
  ].join(" ");

  return containsBrahms(composerText);
}

function extractWigmoreRepertoireProgramme($) {
  const titles = [];

  $("article.repertoire-work-item, div.repertoire-work-item").each((_, block) => {
    if (!isBrahmsRepertoireBlock($, block)) return;

    const blockTitles = $(block)
      .find(".repertoire-list .rich-text.inline.bold, .repertoire-list .rich-text.bold, .repertoire-list .bold")
      .map((_, node) => normaliseWhitespace($(node).text()))
      .get()
      .filter(Boolean);

    for (const rawTitle of [...new Set(blockTitles)]) {
      titles.push(canonicaliseBrahmsWorkTitle(rawTitle) || rawTitle);
    }
  });

  return [...new Set(titles)].join(" / ");
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
  const resolvedProgramme = extractWigmoreRepertoireProgramme($);

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
 * @returns {Promise<string[]>} Array of full event URLs from today through end of the sixth month after the current month, sorted.
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
    .filter((url) => isWithinSixMonthRange(parseEventDateFromUrl(url)))
    .sort();
}

/**
 * Fallback: crawl Wigmore Hall listing pages 0–20 using plain HTTP fetches.
 * This works for statically-rendered events but may miss lazy-loaded content.
 * @returns {Promise<string[]>} Array of full event URLs from today through end of the sixth month after the current month, sorted.
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
    .filter((url) => isWithinSixMonthRange(parseEventDateFromUrl(url)))
    .sort();
}

/**
 * Discover Wigmore Hall event links from today through end of the sixth month after the current month.
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
  console.log(`Discovered ${eventLinks.length} Wigmore Hall event(s) in target range`);
  const items = [];

  for (const eventUrl of eventLinks) {
    try {
      const eventHtml = await fetchHtml(eventUrl);
      const event = extractWigmoreEvent(eventHtml, eventUrl);

      if (event && event.date && isWithinSixMonthRange(event.date)) {
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
    month: getSixMonthLabel(),
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
  isWithinSixMonthRange,
  getSixMonthDateRange,
  canonicaliseBrahmsWorkTitle,
  extractWigmoreRepertoireProgramme,
  extractWigmoreEvent,
  collectWigmoreEventLinksStatic,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
