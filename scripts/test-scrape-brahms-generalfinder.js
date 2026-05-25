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
