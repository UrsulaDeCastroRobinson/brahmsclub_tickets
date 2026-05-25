const {
  collectCanonicalWorksFromText,
  parseToIsoDate,
  extractBachtrackSearchEvents,
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

function getNextMonthIsoDate(day = 15) {
  const now = new Date();
  const dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, day));
  return dt.toISOString().slice(0, 10);
}

console.log("\ncollectCanonicalWorksFromText");

{
  const text = "Programme: Brahms Violin Sonata No. 3 in D minor Op. 108 and Schubert.";
  const works = collectCanonicalWorksFromText(text);
  assert("matches canonical library work", works.includes("Violin Sonata No. 3 in D minor, Op. 108"));
  assert("does not include non-library works", !works.some((work) => work.toLowerCase().includes("schubert")));
}

console.log("\nparseToIsoDate");

{
  assert("parses ISO date-time", parseToIsoDate("2026-06-15T19:30:00Z") === "2026-06-15");
  assert("parses textual UK-style date", parseToIsoDate("15 June 2026") === "2026-06-15");
  assert("returns empty for invalid values", parseToIsoDate("not-a-date") === "");
}

console.log("\nextractBachtrackSearchEvents");

{
  const eventDate = getNextMonthIsoDate(16);
  const html = `<html><body>
    <script type="application/ld+json">
      {
        "@context":"https://schema.org",
        "@graph":[
          {
            "@type":"Event",
            "name":"Brahms recital at Wigmore Hall",
            "startDate":"${eventDate}T19:30:00Z",
            "location":{"@type":"Place","name":"Wigmore Hall"},
            "description":"Programme includes Violin Sonata No. 3 in D minor Op. 108.",
            "url":"/event/brahms-recital-london"
          },
          {
            "@type":"Event",
            "name":"Mozart only programme",
            "startDate":"${eventDate}T19:30:00Z",
            "location":{"@type":"Place","name":"Example Hall"},
            "description":"No listed Brahms work from the approved library.",
            "url":"/event/mozart-only"
          }
        ]
      }
    </script>
  </body></html>`;

  const items = extractBachtrackSearchEvents(html, "https://bachtrack.com/search-events/country=1");
  assert("extracts only one matching event from JSON-LD", items.length === 1);
  assert("includes canonical programme string", items[0].programme === "Violin Sonata No. 3 in D minor, Op. 108");
  assert("resolves relative URL to absolute URL", items[0].url === "https://bachtrack.com/event/brahms-recital-london");
}

{
  const eventDate = getNextMonthIsoDate(18);
  const html = `<html><body>
    <article class="result-card">
      <a href="/event/brahms-quintet-evening">Brahms Quintet Evening</a>
      <time datetime="${eventDate}T19:00:00Z">${eventDate}</time>
      <div class="venue">Kings Place</div>
      <p>Featuring Piano Quintet in F minor, Op. 34</p>
    </article>
  </body></html>`;
  const items = extractBachtrackSearchEvents(html, "https://bachtrack.com/search-events/country=1");
  assert("extracts matching event from fallback event cards", items.length === 1);
  assert("fallback event uses canonical work title", items[0].programme === "Piano Quintet in F minor, Op. 34");
}

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
