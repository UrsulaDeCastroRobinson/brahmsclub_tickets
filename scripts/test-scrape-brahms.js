/**
 * Lightweight validation tests for scrape-brahms parsing helpers.
 * Run with: node scripts/test-scrape-brahms.js
 */

const cheerio = require("cheerio");

// ---------------------------------------------------------------------------
// Import helpers under test (duplicated here so the test has no side effects)
// ---------------------------------------------------------------------------

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

function extractTitle(html) {
  const $ = cheerio.load(html);
  const h1 = $("h1").first().text().trim();
  if (h1) return h1;
  const titleTag = $("title").text().trim();
  return titleTag.replace(/\s*[|\u2013\u2014-]\s*Wigmore Hall.*$/i, "").trim();
}

function extractMetaContent($, attribute, value) {
  return ($(`meta[${attribute}="${value}"]`).attr("content") || "").trim();
}

function extractSection($, headingText) {
  const normalised = headingText.toLowerCase();
  let result = "";
  $("h2, h3, h4, h5").each((_, el) => {
    if ($(el).text().trim().toLowerCase() !== normalised) return;
    const tagLevel = parseInt(el.tagName[1], 10);
    let sibling = $(el).next();
    const parts = [];
    while (sibling.length) {
      const sibTag = sibling.prop("tagName");
      if (sibTag && /^h[1-5]$/i.test(sibTag) && parseInt(sibTag[1], 10) <= tagLevel) break;
      parts.push(sibling.text().trim());
      sibling = sibling.next();
    }
    const text = parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    if (text) { result = text; return false; }
  });
  return result;
}

function parseEventDateFromUrl(url) {
  const m = url.match(/\/whats-on\/(\d{4})(\d{2})(\d{2})\d{4}$/);
  if (!m) return "";
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function containsBrahms(text) {
  return /\bbrahms\b/i.test(text);
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(description, condition) {
  if (condition) {
    console.log(`  ✓ ${description}`);
    passed += 1;
  } else {
    console.error(`  ✗ ${description}`);
    failed += 1;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

console.log("\nextractEventLinks");

{
  const html = `<html><body>
    <a href="/whats-on/202606241300">Event</a>
    <a href="/whats-on/202606131930">Another</a>
    <a href="/whats-on/not-a-date">Skip</a>
    <a href="/about">Skip</a>
  </body></html>`;
  const links = extractEventLinks(html);
  const june24 = "https://www.wigmore-hall.org.uk/whats-on/202606241300";
  const june13 = "https://www.wigmore-hall.org.uk/whats-on/202606131930";
  const notADate = "https://www.wigmore-hall.org.uk/whats-on/not-a-date";
  assert("finds 12-digit event URLs", links.length === 2);
  assert("includes June 24 event", links.some((l) => l === june24));
  assert("includes June 13 event", links.some((l) => l === june13));
  assert("excludes non-event links", links.every((l) => l !== notADate));
}

console.log("\nextractTitle");

{
  const withH1 = `<html><body><h1>Alina Ibragimova violin</h1></body></html>`;
  assert("returns h1 text", extractTitle(withH1) === "Alina Ibragimova violin");

  const noH1 = `<html><head><title>Brahms Recital | Wigmore Hall</title></head><body></body></html>`;
  assert("strips site suffix from title tag", extractTitle(noH1) === "Brahms Recital");

  const noH1Dash = `<html><head><title>Piano Evening – Wigmore Hall</title></head><body></body></html>`;
  assert("strips em-dash site suffix from title tag", extractTitle(noH1Dash) === "Piano Evening");
}

console.log("\nextractMetaContent");

{
  const html = `<html><head>
    <meta name="description" content="A programme including Brahms.">
    <meta property="og:description" content="Brahms Sonata and more.">
  </head></html>`;
  const $ = cheerio.load(html);
  assert("extracts name=description", extractMetaContent($, "name", "description") === "A programme including Brahms.");
  assert("extracts property=og:description", extractMetaContent($, "property", "og:description") === "Brahms Sonata and more.");
  assert("returns empty string for missing meta", extractMetaContent($, "name", "keywords") === "");
}

console.log("\nextractSection");

{
  const html = `<html><body>
    <h3>Programme</h3>
    <p>Brahms Violin Sonata No. 1</p>
    <p>Schubert Fantasy</p>
    <h3>Artists</h3>
    <p>Alina Ibragimova violin</p>
  </body></html>`;
  const $ = cheerio.load(html);
  assert("extracts Programme section text", extractSection($, "Programme").includes("Brahms Violin Sonata No. 1"));
  assert("stops Programme at next heading", !extractSection($, "Programme").includes("Alina Ibragimova"));
  assert("extracts Artists section", extractSection($, "Artists").includes("Alina Ibragimova violin"));
  assert("returns empty for missing section", extractSection($, "Overview") === "");
}

console.log("\nparseEventDateFromUrl");

{
  assert("parses date from 12-digit URL", parseEventDateFromUrl("https://www.wigmore-hall.org.uk/whats-on/202606241300") === "2026-06-24");
  assert("parses evening event URL", parseEventDateFromUrl("https://www.wigmore-hall.org.uk/whats-on/202606131930") === "2026-06-13");
  assert("returns empty for non-matching URL", parseEventDateFromUrl("https://example.com/foo") === "");
}

console.log("\ncontainsBrahms");

{
  assert("matches Brahms", containsBrahms("A concert featuring Brahms Violin Sonata"));
  assert("matches brahms (lowercase)", containsBrahms("featuring brahms"));
  assert("matches BRAHMS (uppercase)", containsBrahms("BRAHMS Piano Quartet"));
  assert("does not match partial word", !containsBrahms("Abrahmson conducts"));
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
