const fs = require("fs");
const path = require("path");

const sourcesPath = path.join(__dirname, "..", "data", "brahms-sources.json");
const outputPath = path.join(__dirname, "..", "public", "data", "brahms-performances.json");

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

function extractWigmoreEvent(html, url) {
  const title = extractHeadingText(html);
  const dateSection = extractSection(html, "Date");
  const programme = extractSection(html, "Programme");
  const overview = extractSection(html, "Overview");
  const artists = extractSection(html, "Artists");
  const date = parseWigmoreDate(dateSection);

  const combinedText = `${title} ${programme} ${overview}`.toLowerCase();
  if (!combinedText.includes("brahms")) {
    return null;
  }

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

async function scrapeWigmoreHall(source) {
  const listingUrl = "https://www.wigmore-hall.org.uk/whats-on";
  const response = await fetch(listingUrl, {
    headers: {
      "user-agent": "brahmsclub-bot/1.0 (+https://github.com/UrsulaDeCastroRobinson/brahmsclub_tickets)"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Wigmore Hall listings: ${response.status}`);
  }

  const listingHtml = await response.text();
  const eventLinks = extractEventLinks(listingHtml);
  const items = [];

  for (const eventUrl of eventLinks.slice(0, 60)) {
    try {
      const eventResponse = await fetch(eventUrl, {
        headers: {
          "user-agent": "brahmsclub-bot/1.0 (+https://github.com/UrsulaDeCastroRobinson/brahmsclub_tickets)"
        }
      });

      if (!eventResponse.ok) {
        continue;
      }

      const eventHtml = await eventResponse.text();
      const event = extractWigmoreEvent(eventHtml, eventUrl);

      if (event && isWithinNextMonth(event.date)) {
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
