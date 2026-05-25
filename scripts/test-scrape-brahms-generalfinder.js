/**
 * Lightweight validation tests for scrape-brahms-generalfinder parsing helpers.
 * Run with: node scripts/test-scrape-brahms-generalfinder.js
 */

const {
  containsBrahms,
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
} = require("./scrape-brahms-generalfinder");

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

console.log("\ncontainsBrahms");
{
  assert("matches Brahms", containsBrahms("A Brahms evening"));
  assert("does not match non-Brahms text", !containsBrahms("A Schubert evening"));
}

console.log("\ncanonicaliseBrahmsWorkTitle");
{
  assert(
    "canonicalises known work aliases",
    canonicaliseBrahmsWorkTitle("Violin Sonata No. 3 in D minor Op. 108") === "Violin Sonata No. 3 in D minor, Op. 108"
  );
  assert(
    "returns empty for uncertain titles",
    canonicaliseBrahmsWorkTitle("Brahms Sonata") === ""
  );
}

console.log("\nextractCanonicalBrahmsWorksFromText");
{
  const works = extractCanonicalBrahmsWorksFromText(
    "Programme: Brahms Violin Sonata No. 3 in D minor Op. 108; New piece by living composer"
  );
  assert("extracts only works from repository library", works.length === 1);
  assert("extracts canonical work title", works[0] === "Violin Sonata No. 3 in D minor, Op. 108");
}

console.log("\nextractBrahmsProgramme");
{
  const programme = extractBrahmsProgramme(
    "Brahms chamber evening with Piano Quintet in F minor, Op. 34 and Cello Sonata No. 1 in E minor Op. 38"
  );
  assert(
    "joins canonical programme titles",
    programme === "Piano Quintet in F minor, Op. 34 / Cello Sonata No. 1 in E minor, Op. 38"
  );
}

console.log("\nformatIsoDate");
{
  assert("parses ISO date-time", formatIsoDate("2026-06-20T19:00:00+01:00") === "2026-06-20");
  assert("parses textual dates", formatIsoDate("24 June 2026") === "2026-06-24");
  assert("returns empty for unknown date text", formatIsoDate("Soon") === "");
}

console.log("\nextractBrittenPearsJsonLdEvents");
{
  const html = `<html><head>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "Event",
            "name": "Brahms by the Sea",
            "startDate": "2026-06-20T19:00:00+01:00",
            "url": "/whats-on/brahms-by-the-sea",
            "description": "Featuring Piano Quintet in F minor, Op. 34",
            "location": { "name": "Snape Maltings Concert Hall" }
          },
          {
            "@type": "Event",
            "name": "Schubert Evening",
            "startDate": "2026-06-21T19:00:00+01:00",
            "url": "/whats-on/schubert-evening",
            "description": "Schubert and Schumann"
          }
        ]
      }
    </script>
  </head><body></body></html>`;

  const events = extractBrittenPearsJsonLdEvents(html, "https://www.brittenpearsarts.org/whats-on");
  assert("keeps only Brahms JSON-LD events", events.length === 1);
  assert("normalises JSON-LD URL", events[0].url === "https://www.brittenpearsarts.org/whats-on/brahms-by-the-sea");
  assert("parses JSON-LD date", events[0].date === "2026-06-20");
  assert("sets source name", events[0].source === "Britten Pears Arts");
  assert("keeps canonical programme titles", events[0].programme === "Piano Quintet in F minor, Op. 34");
}

console.log("\nextractBrittenPearsCardEvents");
{
  const html = `<html><body>
    <article class="event-card">
      <a href="/whats-on/brahms-summer-recital">Brahms Summer Recital</a>
      <time datetime="2026-06-24T19:00:00+01:00">24 June 2026</time>
      <p>Programme includes Violin Sonata No. 3 in D minor Op. 108.</p>
      <p class="venue">Snape Maltings</p>
    </article>
    <article class="event-card">
      <a href="/whats-on/mozart-night">Mozart Night</a>
      <time datetime="2026-06-25T19:00:00+01:00">25 June 2026</time>
      <p>A Mozart celebration.</p>
    </article>
  </body></html>`;

  const events = extractBrittenPearsCardEvents(html, "https://www.brittenpearsarts.org/whats-on");
  assert("keeps only Brahms card events", events.length === 1);
  assert("normalises card URL", events[0].url === "https://www.brittenpearsarts.org/whats-on/brahms-summer-recital");
  assert("parses card date", events[0].date === "2026-06-24");
  assert("keeps venue text", events[0].venue === "Snape Maltings");
  assert("extracts canonical programme title from card text", events[0].programme === "Violin Sonata No. 3 in D minor, Op. 108");
}

console.log("\nextractBrittenPearsListingPageUrls and extractBrittenPearsEventUrls");
{
  const html = `<html><body>
    <a href="/whats-on?page=1">Page 1 query form</a>
    <a href="/whats-on/page/1">Page 1 path form</a>
    <a href="/whats-on?page=2">Next</a>
    <a href="/whats-on/page/3">Page 3</a>
    <a href="/whats-on?page=2&view=grid">Invalid page variant with extra params</a>
    <a href="/whats-on/page/2?view=grid">Invalid path variant with query params</a>
    <a href="/whats-on?page=abc">Invalid non-numeric page</a>
    <a href="/whats-on/page/two">Invalid non-numeric path page</a>
    <a href="/whats-on/cello-sonata-recital">Cello recital</a>
    <a href="/whats-on/cello-sonata-recital#tickets">Cello recital duplicate with hash</a>
    <a href="/whats-on/chamber-evening">Chamber evening</a>
    <a href="/news/article">News</a>
  </body></html>`;
  const baseUrl = "https://www.brittenpearsarts.org/whats-on";

  const listingPages = extractBrittenPearsListingPageUrls(html, baseUrl);
  const eventUrls = extractBrittenPearsEventUrls(html, baseUrl);
  const listingPageSet = new Set(listingPages);
  const eventUrlSet = new Set(eventUrls);

  assert("canonicalises query pagination URL to /page/N form", listingPageSet.has("https://www.brittenpearsarts.org/whats-on/page/2"));
  assert("keeps /page/N listing pages", listingPageSet.has("https://www.brittenpearsarts.org/whats-on/page/3"));
  assert("canonicalises page 1 variants to base listing URL", listingPages.filter((url) => url === "https://www.brittenpearsarts.org/whats-on").length === 1);
  assert("does not keep non-canonical listing URL variants", !listingPages.includes("https://www.brittenpearsarts.org/whats-on?page=2&view=grid"));
  assert("rejects non-numeric listing page variants", !listingPages.some((url) => url.includes("page=abc") || url.includes("/page/two")));
  assert("deduplicates canonical listing pages", listingPages.filter((url) => url === "https://www.brittenpearsarts.org/whats-on/page/2").length === 1);
  assert("collects event detail URLs", eventUrlSet.has("https://www.brittenpearsarts.org/whats-on/cello-sonata-recital"));
  assert("deduplicates repeated event URLs", eventUrls.filter((url) => url === "https://www.brittenpearsarts.org/whats-on/cello-sonata-recital").length === 1);
  assert("ignores listing page URLs when collecting events", !eventUrls.some((url) => url.includes("/whats-on/page/")));
}

console.log("\nextractBrittenPearsEventFromDetailPage");
{
  const html = `<html><head>
      <meta name="description" content="An evening programme for cello and piano.">
    </head><body>
      <main>
        <h1>Cello and Piano Recital</h1>
        <time datetime="2026-06-27T19:00:00+01:00">27 June 2026</time>
        <dl class="c-meta__list">
          <div class="c-meta__item">
            <dt class="c-meta__key">Venue:</dt>
            <dd class="c-meta__value">Snape Maltings Concert Hall</dd>
          </div>
          <div class="c-meta__item">
            <dt class="c-meta__key">Brahms:</dt>
            <dd class="c-meta__value">Cello Sonata No.1 in E minor, Op.38 (25')</dd>
          </div>
          <div class="c-meta__item">
            <dt class="c-meta__key">Bartók:</dt>
            <dd class="c-meta__value">Sonata for Violin and Piano No.1</dd>
          </div>
        </dl>
      </main>
    </body></html>`;

  const event = extractBrittenPearsEventFromDetailPage(
    html,
    "https://www.brittenpearsarts.org/whats-on/cello-and-piano-recital"
  );

  assert("extracts detail-page event", Boolean(event));
  assert("parses detail-page date", event?.date === "2026-06-27");
  assert("parses venue from c-meta definition list", event?.venue === "Snape Maltings Concert Hall");
  assert("canonicalises Brahms work from event detail metadata", event?.programme === "Cello Sonata No. 1 in E minor, Op. 38");
}

console.log("\ndedupeEvents");
{
  const deduped = dedupeEvents([
    { title: "Brahms A", date: "2026-06-20", url: "https://example.com/a" },
    { title: "Brahms A", date: "2026-06-20", url: "https://example.com/a" },
    { title: "Brahms B", date: "2026-06-21", url: "https://example.com/b" },
  ]);
  assert("removes duplicates by title+date+url", deduped.length === 2);
}

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
