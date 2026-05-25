const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const brahmsWorks = require("./data/brahms-works.json");

const sourcesPath = path.join(__dirname, "..", "data", "brahms-generalfinder-sources.json");
const outputPath = path.join(__dirname, "..", "public", "data", "brahms-generalfinder-performances.json");
const DEFAULT_BRITTEN_PEARS_MAX_PAGINATION_PAGES = 200;

const browserHeaders = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
  "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "accept-language": "en-GB,en;q=0.9,en-US;q=0.8",
  "cache-control": "no-cache",
  "pragma": "no-cache",
  "referer": "https://www.google.com/",
};

function getNextMonthDateRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 0, 23, 59, 59, 999));
  return { start, end };
}

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

function isWithinNextMonth(dateString) {
  if (!dateString) return false;
  const parsed = new Date(`${dateString}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  const { start, end } = getNextMonthDateRange();
  return parsed >= start && parsed <= end;
}

function containsBrahms(text) {
  return /\bbrahms\b/i.test(text || "");
}

function normaliseWhitespace(value) {
  return (value || "").replace(/\s+/g, " ").trim();
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

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function extractCanonicalBrahmsWorksFromText(text) {
  const fragments = normaliseWhitespace(text)
    .split(/[|;/\n]/)
    .map((fragment) => normaliseWhitespace(fragment))
    .filter(Boolean);

  const works = [];
  for (const fragment of fragments) {
    const canonical = canonicaliseBrahmsWorkTitle(fragment);
    if (canonical) works.push(canonical);
  }

  const normalisedText = ` ${normaliseForMatch(text)} `;
  for (const work of brahmsWorks) {
    const aliases = [work.canonical_title, ...(work.aliases || [])];
    const hasExplicitMatch = aliases.some((alias) => {
      const normalisedAlias = normaliseForMatch(alias);
      if (!normalisedAlias) return false;
      return normalisedText.includes(` ${normalisedAlias} `);
    });
    if (hasExplicitMatch) works.push(work.canonical_title);
  }

  return [...new Set(works)];
}

function extractBrahmsProgramme(text) {
  if (!containsBrahms(text)) return "";
  return extractCanonicalBrahmsWorksFromText(text).join(" / ");
}

function formatIsoDate(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  const m = String(value).match(/(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/);
  if (!m) return "";
  const fallbackParsed = new Date(`${m[1]} ${m[2]} ${m[3]} 12:00:00 UTC`);
  return Number.isNaN(fallbackParsed.getTime()) ? "" : fallbackParsed.toISOString().slice(0, 10);
}

function toAbsoluteUrl(url, baseUrl) {
  if (!url) return "";
  try {
    return new URL(url, baseUrl).toString();
  } catch (_) {
    return "";
  }
}

function collectJsonLdNodes(node) {
  if (!node) return [];
  if (Array.isArray(node)) return node.flatMap((item) => collectJsonLdNodes(item));
  if (typeof node !== "object") return [];
  if (node["@graph"]) return collectJsonLdNodes(node["@graph"]);
  return [node];
}

function isEventJsonLdNode(node) {
  const nodeType = node["@type"];
  if (Array.isArray(nodeType)) return nodeType.some((value) => String(value).toLowerCase() === "event");
  return String(nodeType || "").toLowerCase() === "event";
}

function stringifyJsonValue(value) {
  if (!value) return "";
  if (Array.isArray(value)) return value.map((item) => stringifyJsonValue(item)).filter(Boolean).join(" ");
  if (typeof value === "object") {
    return [value.name, value.description, value.title, value.text, value.caption]
      .map((item) => normaliseWhitespace(item))
      .filter(Boolean)
      .join(" ");
  }
  return normaliseWhitespace(String(value));
}

function extractBrittenPearsJsonLdEvents(html, baseUrl) {
  const $ = cheerio.load(html);
  const events = [];
  const seen = new Set();

  $("script[type='application/ld+json']").each((_, script) => {
    const raw = $(script).contents().text();
    if (!raw || !raw.trim()) return;

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      return;
    }

    const nodes = collectJsonLdNodes(parsed).filter((node) => typeof node === "object" && isEventJsonLdNode(node));
    for (const node of nodes) {
      const title = normaliseWhitespace(node.name || node.title || "");
      const description = normaliseWhitespace(node.description || "");
      const richText = [
        title,
        description,
        stringifyJsonValue(node.about),
        stringifyJsonValue(node.performer),
        stringifyJsonValue(node.workPerformed),
      ].join(" ");
      if (!containsBrahms(richText)) continue;

      const date = formatIsoDate(node.startDate || node.startDateTime || node.date);
      const venue = normaliseWhitespace(
        node.location?.name || node.location?.address?.name || node.organizer?.name || "Britten Pears Arts"
      );
      const url = toAbsoluteUrl(node.url || node["@id"], baseUrl);
      const key = `${title}|${date}|${url}`;
      if (seen.has(key)) continue;
      seen.add(key);

      events.push({
        title: title || "Britten Pears Arts event",
        date,
        venue: venue || "Britten Pears Arts",
        source: "Britten Pears Arts",
        programme: extractBrahmsProgramme(richText),
        url,
      });
    }
  });

  return events;
}

function extractBrittenPearsCardEvents(html, baseUrl) {
  const $ = cheerio.load(html);
  const events = [];
  const seen = new Set();

  $("a[href*='/whats-on/']").each((_, link) => {
    const href = $(link).attr("href") || "";
    const url = toAbsoluteUrl(href, baseUrl);
    if (!url) return;

    const container = $(link).closest(
      "article, li, div[class*='card'], div[class*='event'], div[class*='listing'], div[class*='result']"
    ).first();
    const context = container.length ? container : $(link).parent();

    const title = normaliseWhitespace(
      context.find("h1, h2, h3, h4").first().text() || $(link).text()
    );
    const description = normaliseWhitespace(context.find("p").map((_, p) => $(p).text()).get().join(" "));
    const dateValue = normaliseWhitespace(
      context.find("time[datetime]").first().attr("datetime")
      || context.find("time").first().text()
      || context.find("[class*='date']").first().text()
    );
    const combinedText = [title, description, context.text()].filter(Boolean).join(" ");
    if (!containsBrahms(combinedText)) return;

    const date = formatIsoDate(dateValue);
    const venue = normaliseWhitespace(
      context.find("[class*='venue'], [class*='location']").first().text() || "Britten Pears Arts"
    );

    const key = `${title}|${date}|${url}`;
    if (seen.has(key)) return;
    seen.add(key);

    events.push({
      title: title || "Britten Pears Arts event",
      date,
      venue: venue || "Britten Pears Arts",
      source: "Britten Pears Arts",
      programme: extractBrahmsProgramme(combinedText),
      url,
    });
  });

  return events;
}

function normalisePathname(pathname) {
  const trimmed = String(pathname || "").replace(/^\/+/, "").replace(/\/+$/, "");
  return trimmed ? `/${trimmed}` : "";
}

function stripUrlHash(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch (_) {
    return "";
  }
}

function isBrittenPearsListingPage(url, listingBaseUrl) {
  try {
    const parsed = new URL(url);
    const listingBase = new URL(listingBaseUrl);
    const pathname = normalisePathname(parsed.pathname);
    const listingPath = normalisePathname(listingBase.pathname);

    if (parsed.origin !== listingBase.origin) return false;
    if (pathname === listingPath) {
      if (!parsed.search) return true;
      if ([...parsed.searchParams.keys()].length !== 1) return false;
      const pageParam = parsed.searchParams.get("page");
      return Number.isInteger(Number(pageParam)) && Number(pageParam) > 0;
    }

    const match = pathname.match(new RegExp(`^${escapeRegex(listingPath)}/page/(\\d+)$`));
    return Boolean(match && Number(match[1]) > 0 && !parsed.search);
  } catch (_) {
    return false;
  }
}

function canonicaliseBrittenPearsListingPageUrl(url, listingBaseUrl) {
  try {
    const parsed = new URL(url, listingBaseUrl);
    if (!isBrittenPearsListingPage(parsed.toString(), listingBaseUrl)) return "";

    const listingBase = new URL(listingBaseUrl);
    const listingPath = normalisePathname(listingBase.pathname);
    const pathname = normalisePathname(parsed.pathname);
    const pageNumber = (() => {
      if (pathname === listingPath && parsed.searchParams.has("page")) {
        return Number(parsed.searchParams.get("page"));
      }
      const match = pathname.match(new RegExp(`^${escapeRegex(listingPath)}/page/(\\d+)$`));
      return match ? Number(match[1]) : 1;
    })();

    const canonicalUrl = new URL(listingBaseUrl);
    canonicalUrl.hash = "";
    canonicalUrl.search = "";
    canonicalUrl.pathname = pageNumber > 1
      ? `${listingPath}/page/${pageNumber}`
      : listingPath;
    return canonicalUrl.toString();
  } catch (_) {
    return "";
  }
}

function extractBrittenPearsListingPageUrls(html, listingBaseUrl) {
  const $ = cheerio.load(html);
  const pages = new Set();
  const baseListingUrl = canonicaliseBrittenPearsListingPageUrl(listingBaseUrl, listingBaseUrl);
  if (baseListingUrl) pages.add(baseListingUrl);

  $("a[href], link[rel='next'][href]").each((_, element) => {
    const href = $(element).attr("href") || "";
    const canonicalUrl = canonicaliseBrittenPearsListingPageUrl(href, listingBaseUrl);
    if (!canonicalUrl) return;
    pages.add(canonicalUrl);
  });

  return [...pages];
}

function isBrittenPearsEventUrl(url, listingBaseUrl) {
  try {
    const parsed = new URL(url);
    const listingBase = new URL(listingBaseUrl);
    const pathname = normalisePathname(parsed.pathname);

    if (parsed.origin !== listingBase.origin) return false;
    return /^\/events\/[^/]+$/i.test(pathname);
  } catch (_) {
    return false;
  }
}

function extractBrittenPearsEventUrls(html, listingBaseUrl) {
  const $ = cheerio.load(html);
  const events = new Set();

  $("a[href]").each((_, link) => {
    const href = $(link).attr("href") || "";
    const absoluteUrl = stripUrlHash(toAbsoluteUrl(href, listingBaseUrl));
    if (!absoluteUrl) return;
    if (!isBrittenPearsEventUrl(absoluteUrl, listingBaseUrl)) return;
    events.add(absoluteUrl);
  });

  return [...events];
}

function extractBrittenPearsMetaListRows($) {
  const rows = [];

  $("dl.c-meta__list").each((_, list) => {
    const items = $(list).find(".c-meta__item");
    if (items.length) {
      items.each((_, item) => {
        const key = normaliseWhitespace($(item).find("dt").first().text());
        const value = normaliseWhitespace($(item).find("dd").first().text());
        const row = normaliseWhitespace([key, value].filter(Boolean).join(" "));
        if (row) rows.push(row);
      });
      return;
    }

    const terms = $(list).find("dt");
    terms.each((_, term) => {
      const key = normaliseWhitespace($(term).text());
      const value = normaliseWhitespace($(term).next("dd").first().text());
      const row = normaliseWhitespace([key, value].filter(Boolean).join(" "));
      if (row) rows.push(row);
    });
  });

  return rows;
}

function extractBrittenPearsEventFromDetailPage(html, eventUrl) {
  const $ = cheerio.load(html);
  const title = normaliseWhitespace(
    $("h1").first().text() ||
    $("meta[property='og:title']").attr("content") ||
    $("title").first().text()
  ) || "Britten Pears Arts event";
  const metaDescription = normaliseWhitespace(
    $("meta[name='description']").attr("content") ||
    $("meta[property='og:description']").attr("content")
  );
  const metaListRows = extractBrittenPearsMetaListRows($);
  const metaListText = metaListRows.join(" | ");

  const dateValue = normaliseWhitespace(
    $("time[datetime]").first().attr("datetime")
    || $("time").first().text()
    || $("dt:contains('Date')").first().next("dd").text()
    || $("dt:contains('When')").first().next("dd").text()
    || $("dt:contains('Time')").first().next("dd").text()
    || $("[class*='date']").first().text()
  );
  const venue = normaliseWhitespace(
    $("dt:contains('Venue')").first().next("dd").text()
    || $("dt:contains('Location')").first().next("dd").text()
    || $("[class*='venue'], [class*='location']").first().text()
    || "Britten Pears Arts"
  );
  const mainText = normaliseWhitespace($("main").first().text() || $("body").text());
  const detailText = normaliseWhitespace(
    [title, metaDescription, metaListText, mainText].filter(Boolean).join(" ")
  );

  if (!containsBrahms(detailText)) return null;
  const canonicalWorks = extractCanonicalBrahmsWorksFromText(detailText);
  if (!canonicalWorks.length) return null;

  return {
    title,
    date: formatIsoDate(dateValue),
    venue: venue || "Britten Pears Arts",
    source: "Britten Pears Arts",
    programme: canonicalWorks.join(" / "),
    url: eventUrl,
  };
}

function dedupeEvents(events) {
  const seen = new Set();
  return events.filter((event) => {
    const key = `${event.title}|${event.date}|${event.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchHtml(url) {
  const response = await fetch(url, { headers: browserHeaders });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.text();
}

async function scrapeBrittenPearsWhatsOn(source) {
  const listingUrl = source.homepage || "https://www.brittenpearsarts.org/whats-on";
  const pendingPages = [listingUrl];
  let nextPageIndex = 0;
  const visitedPages = new Set();
  const discoveredEventUrls = new Set();
  const configuredLimit = Number(source.maxPaginationPages);
  const maxListingPages = Number.isInteger(configuredLimit) && configuredLimit > 0
    ? configuredLimit
    : DEFAULT_BRITTEN_PEARS_MAX_PAGINATION_PAGES;

  while (nextPageIndex < pendingPages.length && visitedPages.size < maxListingPages) {
    const pageUrl = pendingPages[nextPageIndex];
    nextPageIndex += 1;
    const pageKey = stripUrlHash(pageUrl);
    if (!pageKey || visitedPages.has(pageKey)) continue;
    visitedPages.add(pageKey);

    const html = await fetchHtml(pageUrl);
    for (const discoveredPageUrl of extractBrittenPearsListingPageUrls(html, listingUrl)) {
      if (!visitedPages.has(discoveredPageUrl)) {
        pendingPages.push(discoveredPageUrl);
      }
    }
    for (const eventUrl of extractBrittenPearsEventUrls(html, listingUrl)) {
      discoveredEventUrls.add(eventUrl);
    }
  }

  const parsedEvents = [];
  for (const eventUrl of discoveredEventUrls) {
    try {
      const html = await fetchHtml(eventUrl);
      const event = extractBrittenPearsEventFromDetailPage(html, eventUrl);
      if (event) parsedEvents.push(event);
    } catch (error) {
      console.warn(`Failed to parse Britten Pears event ${eventUrl}: ${error.message}`);
    }
  }

  const items = dedupeEvents(parsedEvents)
    .filter((item) => item.date ? isWithinNextMonth(item.date) : true)
    .sort((a, b) => {
      if (a.date && b.date) return a.date.localeCompare(b.date);
      if (!a.date && b.date) return 1;
      if (a.date && !b.date) return -1;
      return a.title.localeCompare(b.title);
    });

  console.log(`Scraped ${items.length} Britten Pears Arts event(s)`);
  return items;
}

async function scrapeSource(source) {
  if (source.id === "britten-pears-arts-whats-on") {
    return scrapeBrittenPearsWhatsOn(source);
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
    items: dedupeEvents(items),
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`Wrote ${output.items.length} items to ${outputPath}`);
}

module.exports = {
  containsBrahms,
  isWithinNextMonth,
  getNextMonthDateRange,
  canonicaliseBrahmsWorkTitle,
  extractCanonicalBrahmsWorksFromText,
  extractBrahmsProgramme,
  formatIsoDate,
  extractBrittenPearsJsonLdEvents,
  extractBrittenPearsCardEvents,
  extractBrittenPearsListingPageUrls,
  extractBrittenPearsEventUrls,
  extractBrittenPearsEventFromDetailPage,
  dedupeEvents,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
