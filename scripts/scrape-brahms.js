const fs = require("fs");
const path = require("path");

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

function decodeEntities(value) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripTags(value) {
  return decodeEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function extractEventLinks(html) {
  const links = new Set();
  const regex = /href="(\/whats-on\/[^"]+)"/g;
  let match;

  while ((match = regex.exec(html)) !== null) {
    const href = match[1];
    if (/^\/whats-on\/\d{12}$/.test(href)) {
      links.add(`https://www.wigmore-hall.org.uk${href}`);
    }
  }

  return [...links];
}

function parseEventDateFromUrl(url) {
  const urlMatch = url.match(/\/whats-on\/(\d{4})(\d{2})(\d{2})\d{4}$/);
  if (!urlMatch) return "";
  const [, year, month, day] = urlMatch;
  return `${year}-${month}-${day}`;
}

function parseWigmoreDate(raw, url) {
  const match = raw.match(/([A-Za-z]{3})\s+(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
  if (match) {
    const [, , day, month, year] = match;
    const parsed = new Date(`${day} ${month} ${year} 12:00:00 UTC`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  return parseEventDateFromUrl(url);
}

function extractSection(html, heading) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`#### ${escapedHeading}([\\s\\S]*?)(?:####|$)`, "i");
  const match = html.match(regex);
  return match ? stripTags(match[1]) : "";
}

function extractHeadingText(html) {
  const match = html.match(/#\s+(.+)/);
  return match ? stripTags(match[1]) : "";
}

function extractTitleTag(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripTags(match[1]) : "";
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractMetaContent(html, attribute, value) {
  const escapedAttr = escapeRegex(attribute);
  const escapedValue = escapeRegex(value);
  const tagMatches = html.match(/<meta\b[^>]*>/gi) || [];

  for (const tag of tagMatches) {
    const attrPattern = new RegExp(`\b${escapedAttr}\s*=\s*(["'])${escapedValue}\\1`, "i");
    if (!attrPattern.test(tag)) {
      continue;
    }

    const contentMatch = tag.match(/\bcontent\s*=\s*(["'])([\s\S]*?)\1/i);
    if (contentMatch) {
      return decodeEntities(contentMatch[2]).trim();
    }
  }

  return "";
}

function normaliseWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function isWithinNextMonth(dateString) {
  if (!dateString) return false;
  const parsed = new Date(`${dateString}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  const { start, end } = getNextMonthDateRange();
  return parsed >= start && parsed <= end;
}

function isAfterNextMonth(dateString) {
  if (!dateString) return false;
  const parsed = new Date(`${dateString}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  const { end } = getNextMonthDateRange();
  return parsed > end;
}

function containsBrahms(text) {
  return /\bbrahms\b/i.test(text);
}

function extractWigmoreEvent(html, url) {
  const title = extractHeadingText(html);
  const titleTag = extractTitleTag(html);
  const metaDescription = extractMetaContent(html, "name", "description");
  const ogDescription = extractMetaContent(html, "property", "og:description");
  const dateSection = extractSection(html, "Date");
  const programme = extractSection(html, "Programme");
  const overview = extractSection(html, "Overview");
  const artists = extractSection(html, "Artists");
  const bodyText = stripTags(html);
  const date = parseWigmoreDate(dateSection, url);

  const combinedText = [title, titleTag, metaDescription, ogDescription, programme, overview, artists, bodyText]
    .filter(Boolean)
    .join(" ");

  if (!containsBrahms(combinedText)) {
    return null;
  }

  const resolvedTitle = title || titleTag || "Wigmore Hall event";
  const resolvedProgramme = normaliseWhitespace(programme || overview || metaDescription || ogDescription || artists || bodyText || "Brahms programme");

  return {
    title: resolvedTitle,
    date,
    venue: "Wigmore Hall",
    source: "Wigmore Hall",
    programme: resolvedProgramme,
    url
  };
}

async function fetchHtml(url) {
  const response = await fetch(url, { headers: browserHeaders });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.text();
}

async function collectWigmoreEventLinks() {
  const eventLinkSet = new Set();
  let stalePages = 0;

  for (let page = 0; page < 15; page += 1) {
    const listingUrl = page === 0
      ? "https://www.wigmore-hall.org.uk/whats-on"
      : `https://www.wigmore-hall.org.uk/whats-on?page=${page}`;

    try {
      const listingHtml = await fetchHtml(listingUrl);
      const pageLinks = extractEventLinks(listingHtml);
      const newLinks = pageLinks.filter((link) => !eventLinkSet.has(link));

      pageLinks.forEach((link) => eventLinkSet.add(link));

      if (newLinks.length === 0) {
        stalePages += 1;
      } else {
        stalePages = 0;
      }

      const linkDates = newLinks
        .map(parseEventDateFromUrl)
        .filter(Boolean)
        .sort();

      if (linkDates.length > 0 && linkDates.every(isAfterNextMonth)) {
        break;
      }

      if (stalePages >= 2) {
        break;
      }
    } catch (error) {
      console.error(`Failed to fetch Wigmore Hall listing ${listingUrl}:`, error.message);
    }
  }

  return [...eventLinkSet].sort();
}

async function scrapeWigmoreHall(source) {
  const eventLinks = await collectWigmoreEventLinks();
  const items = [];

  for (const eventUrl of eventLinks) {
    try {
      const eventDate = parseEventDateFromUrl(eventUrl);
      if (eventDate && isAfterNextMonth(eventDate)) {
        break;
      }

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
    return scrapeWigmoreHall(source);
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
