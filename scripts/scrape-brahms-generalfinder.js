const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const brahmsWorks = require("./data/brahms-works.json");
const { canonicaliseBrahmsWorkTitle, isWithinNextMonth } = require("./scrape-brahms");

const sourcesPath = path.join(__dirname, "..", "data", "brahms-generalfinder-sources.json");
const outputPath = path.join(__dirname, "..", "public", "data", "brahms-generalfinder-performances.json");

const browserHeaders = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
  "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "accept-language": "en-GB,en;q=0.9,en-US;q=0.8",
  "cache-control": "no-cache",
  "pragma": "no-cache",
  "referer": "https://www.google.com/",
  "upgrade-insecure-requests": "1"
};

function getNextMonthLabel() {
  const now = new Date();
  const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const sameYear = currentMonthStart.getUTCFullYear() === nextMonthStart.getUTCFullYear();
  if (sameYear) {
    const month1 = currentMonthStart.toLocaleString("en-GB", { month: "long", timeZone: "UTC" });
    const month2 = nextMonthStart.toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
    return `${month1}–${month2}`;
  }
  const label1 = currentMonthStart.toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const label2 = nextMonthStart.toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  return `${label1}–${label2}`;
}

function normaliseForMatch(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function buildAliasPairs() {
  const pairs = [];
  for (const work of brahmsWorks) {
    const options = [work.canonical_title, ...(work.aliases || [])];
    for (const alias of options) {
      const normalisedAlias = normaliseForMatch(alias);
      if (!normalisedAlias) continue;
      if (normalisedAlias.split(" ").length < 3) continue;
      pairs.push([normalisedAlias, work.canonical_title]);
    }
  }
  return pairs;
}

const canonicalAliasPairs = buildAliasPairs();
const workOrder = new Map(brahmsWorks.map((work, index) => [work.canonical_title, index]));

function collectCanonicalWorksFromText(text) {
  const rawText = String(text || "");
  if (!rawText.trim()) return [];

  const found = new Set();
  const normalisedText = normaliseForMatch(rawText);

  for (const [normalisedAlias, canonicalTitle] of canonicalAliasPairs) {
    if (normalisedText.includes(normalisedAlias)) {
      found.add(canonicalTitle);
    }
  }

  const segments = rawText
    .split(/[\n;|•]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (const segment of segments) {
    const canonical = canonicaliseBrahmsWorkTitle(segment);
    if (canonical) found.add(canonical);
  }

  return [...found].sort((a, b) => (workOrder.get(a) || 9999) - (workOrder.get(b) || 9999));
}

function parseToIsoDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const direct = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (direct) {
    return `${direct[1]}-${direct[2]}-${direct[3]}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  const dayMonthYear = raw.match(/(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/);
  if (dayMonthYear) {
    const fallback = new Date(`${dayMonthYear[1]} ${dayMonthYear[2]} ${dayMonthYear[3]} 12:00:00 UTC`);
    if (!Number.isNaN(fallback.getTime())) {
      return fallback.toISOString().slice(0, 10);
    }
  }

  return "";
}

function absoluteUrl(baseUrl, maybeRelative) {
  const raw = String(maybeRelative || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw, baseUrl).toString();
  } catch (_) {
    return "";
  }
}

function flattenJsonLd(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (typeof value !== "object") return [];
  const nested = [];
  if (Array.isArray(value["@graph"])) nested.push(...value["@graph"]);
  if (Array.isArray(value.itemListElement)) {
    for (const item of value.itemListElement) {
      if (item && typeof item === "object") {
        nested.push(item.item || item);
      }
    }
  }
  nested.push(value);
  return nested.flatMap(flattenJsonLdNode);
}

function flattenJsonLdNode(node) {
  if (!node || typeof node !== "object") return [];
  const result = [node];
  if (Array.isArray(node["@graph"])) result.push(...node["@graph"]);
  if (Array.isArray(node.itemListElement)) {
    for (const item of node.itemListElement) {
      if (item && typeof item === "object") {
        result.push(item.item || item);
      }
    }
  }
  return result;
}

function isEventType(value) {
  const type = value && value["@type"];
  if (!type) return false;
  if (Array.isArray(type)) return type.some((entry) => String(entry).toLowerCase() === "event");
  return String(type).toLowerCase() === "event";
}

function normaliseVenueName(location) {
  if (!location) return "";
  if (typeof location === "string") return location.trim();
  if (typeof location !== "object") return "";
  return String(location.name || location.alternateName || "").trim();
}

function toGeneralFinderItem(candidate) {
  const date = parseToIsoDate(candidate.date);
  if (!date || !isWithinNextMonth(date)) return null;

  const works = collectCanonicalWorksFromText(candidate.textForMatching);
  if (!works.length) return null;

  return {
    title: candidate.title || "Bachtrack event",
    date,
    venue: candidate.venue || "Unknown venue",
    source: "Bachtrack",
    programme: works.join(" / "),
    url: candidate.url || ""
  };
}

function extractFromJsonLd(html, baseUrl) {
  const $ = cheerio.load(html);
  const items = [];

  $("script[type='application/ld+json']").each((_, scriptTag) => {
    const raw = $(scriptTag).html() || "";
    if (!raw.trim()) return;

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      return;
    }

    for (const node of flattenJsonLd(parsed)) {
      if (!isEventType(node)) continue;
      const title = String(node.name || "").trim();
      const description = String(node.description || "").trim();
      const date = node.startDate || node.startTime || "";
      const venue = normaliseVenueName(node.location);
      const url = absoluteUrl(baseUrl, node.url || "");
      const textForMatching = [title, description].filter(Boolean).join(" ");

      const mapped = toGeneralFinderItem({ title, date, venue, url, textForMatching });
      if (mapped) items.push(mapped);
    }
  });

  return items;
}

function extractFromEventCards(html, baseUrl) {
  const $ = cheerio.load(html);
  const items = [];
  const seenUrls = new Set();

  $("a[href*='/event']").each((_, link) => {
    const href = $(link).attr("href") || "";
    const url = absoluteUrl(baseUrl, href);
    if (!url || seenUrls.has(url)) return;

    const card = $(link).closest("article, li, div");
    const cardText = card.text().replace(/\s+/g, " ").trim();
    const title = $(link).text().replace(/\s+/g, " ").trim();
    const dateValue = card.find("time").first().attr("datetime")
      || card.find("time").first().text()
      || "";
    const venue = card.find("[class*='venue'], [class*='location']").first().text().replace(/\s+/g, " ").trim();

    const mapped = toGeneralFinderItem({
      title,
      date: dateValue,
      venue,
      url,
      textForMatching: cardText,
    });

    if (mapped) {
      seenUrls.add(url);
      items.push(mapped);
    }
  });

  return items;
}

function dedupeAndSort(items) {
  const byKey = new Map();
  for (const item of items) {
    const key = `${item.source}::${item.url || ""}::${item.title}::${item.date}`;
    if (!byKey.has(key)) byKey.set(key, item);
  }

  return [...byKey.values()].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.title.localeCompare(b.title);
  });
}

function extractBachtrackSearchEvents(html, baseUrl = "https://bachtrack.com/search-events/country=1") {
  const fromJsonLd = extractFromJsonLd(html, baseUrl);
  const fromCards = extractFromEventCards(html, baseUrl);
  return dedupeAndSort([...fromJsonLd, ...fromCards]);
}

async function fetchHtml(url) {
  const response = await fetch(url, { headers: browserHeaders });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.text();
}

async function scrapeSource(source) {
  if (source.id !== "bachtrack-search-uk") return [];
  const url = source.searchUrl || "https://bachtrack.com/search-events/country=1";
  const html = await fetchHtml(url);
  return extractBachtrackSearchEvents(html, url);
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
    items: dedupeAndSort(items),
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`Wrote ${output.items.length} items to ${outputPath}`);
}

module.exports = {
  collectCanonicalWorksFromText,
  parseToIsoDate,
  extractBachtrackSearchEvents,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
