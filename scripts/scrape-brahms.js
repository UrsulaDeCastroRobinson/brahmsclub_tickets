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

const debugEventUrl = "https://www.wigmore-hall.org.uk/whats-on/202606131930";

function getNextMonthDateRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 2, 0);
  return { start, end };
}

function getNextMonthLabel() {
  const { start } = getNextMonthDateRange();
  return start.toLocaleString("en-GB", { month: "long", year: "numeric" });
}

function stripTags(value) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
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

function parseWigmoreDate(raw) {
  const match = raw.match(/([A-Za-z]{3})\s+(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
  if (!match) return "";

  const [, , day, month, year] = match;
  const parsed = new Date(`${day} ${month} ${year} 12:00:00 UTC`);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
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

function normaliseWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function logDebugForKnownEvent(html, url) {
  if (url !== debugEventUrl) {
    return;
  }

  const lowerHtml = html.toLowerCase();
  const brahmsIndex = lowerHtml.indexOf("brahms");
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);

  console.log(`[wigmore-debug] url: ${url}`);
  console.log(`[wigmore-debug] html length: ${html.length}`);
  console.log(`[wigmore-debug] title tag: ${titleMatch ? stripTags(titleMatch[1]) : "(none)"}`);
  console.log(`[wigmore-debug] contains brahms: ${brahmsIndex !== -1}`);

  if (brahmsIndex !== -1) {
    const start = Math.max(0, brahmsIndex - 250);
    const end = Math.min(html.length, brahmsIndex + 350);
    console.log(`[wigmore-debug] snippet around brahms:`);
    console.log(html.slice(start, end));
  }

  if (jsonLdMatch) {
    console.log(`[wigmore-debug] json-ld snippet:`);
    console.log(jsonLdMatch[1].slice(0, 1200));
  } else {
    console.log(`[wigmore-debug] json-ld snippet: (none)`);
  }
}

function extractWigmoreEvent(html, url) {
  logDebugForKnownEvent(html, url);

  const title = extractHeadingText(html);
  const dateSection = extractSection(html, "Date");
  const programme = extractSection(html, "Programme");
  const overview = extractSection(html, "Overview");
  const artists = extractSection(html, "Artists");
  const date = parseWigmoreDate(dateSection);

  const combinedText = `${title} ${programme} ${overview}`.toLowerCase();
  if (!combinedText.includes("brahms")) {
    console.log(`[wigmore] skip no brahms: ${url}`);
    return null;
  }

  console.log(`[wigmore] brahms match: ${title || "(untitled)"} | ${date || "(no-date)"}`);

  return {
    title: title || "Wigmore Hall event",
    date,
    venue: "Wigmore Hall",
    source: "Wigmore Hall",
    programme: normaliseWhitespace(programme || overview || artists || "Brahms programme"),
    url
  };
}

function isWithinNextMonth(dateString) {
  if (!dateString) return false;
  const parsed = new Date(`${dateString}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  const { start, end } = getNextMonthDateRange();
  return parsed >= start && parsed <= end;
}

async function fetchHtml(url) {
  const response = await fetch(url, { headers: browserHeaders });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.text();
}

async function scrapeWigmoreHall(source) {
  const listingUrls = [
    "https://www.wigmore-hall.org.uk/whats-on",
    "https://www.wigmore-hall.org.uk/whats-on?page=1",
    "https://www.wigmore-hall.org.uk/whats-on?page=2",
    "https://www.wigmore-hall.org.uk/whats-on?page=3",
    "https://www.wigmore-hall.org.uk/whats-on?page=4",
    "https://www.wigmore-hall.org.uk/whats-on?page=5",
    "https://www.wigmore-hall.org.uk/whats-on?page=6"
  ];

  const eventLinkSet = new Set();

  for (const listingUrl of listingUrls) {
    try {
      console.log(`[wigmore] fetching listing: ${listingUrl}`);
      const listingHtml = await fetchHtml(listingUrl);
      console.log(`[wigmore] fetched listing (${listingHtml.length} chars)`);
      const pageLinks = extractEventLinks(listingHtml);
      console.log(`[wigmore] found ${pageLinks.length} candidate links on ${listingUrl}`);
      pageLinks.forEach((link) => eventLinkSet.add(link));
    } catch (error) {
      console.log(`[wigmore] listing fetch failed: ${listingUrl} -> ${error.message}`);
    }
  }

  const eventLinks = [...eventLinkSet].sort();
  console.log(`[wigmore] total unique event links: ${eventLinks.length}`);
  console.log(`[wigmore] sample links: ${eventLinks.slice(0, 10).join(", ") || "(none)"}`);

  const items = [];

  for (const eventUrl of eventLinks.slice(0, 200)) {
    try {
      console.log(`[wigmore] fetching event: ${eventUrl}`);
      const eventHtml = await fetchHtml(eventUrl);
      const event = extractWigmoreEvent(eventHtml, eventUrl);

      if (!event) {
        continue;
      }

      if (!event.date) {
        console.log(`[wigmore] skip no parsed date: ${eventUrl}`);
        continue;
      }

      if (!isWithinNextMonth(event.date)) {
        console.log(`[wigmore] skip outside next month: ${event.title} | ${event.date}`);
        continue;
      }

      console.log(`[wigmore] keep event: ${event.title} | ${event.date}`);
      items.push(event);
    } catch (error) {
      console.error(`Failed to fetch Wigmore Hall event ${eventUrl}:`, error.message);
    }
  }

  console.log(`[wigmore] kept ${items.length} events after filtering`);
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
