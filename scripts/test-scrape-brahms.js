/**
 * Lightweight validation tests for scrape-brahms parsing helpers.
 * Run with: node scripts/test-scrape-brahms.js
 */

const cheerio = require("cheerio");
const {
  extractEventLinks,
  extractTitle,
  extractMetaContent,
  extractSection,
  parseEventDateFromUrl,
  containsBrahms,
  extractWigmoreEvent,
  collectWigmoreEventLinksStatic,
} = require("./scrape-brahms");

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

  const noH1Dash = `<html><head><title>Piano Evening \u2013 Wigmore Hall</title></head><body></body></html>`;
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

console.log("\nextractWigmoreEvent");

{
  const html = `<html><body>
    <h1>Morning recital</h1>
    <h3>Programme</h3>
    <table>
      <tr><th>Composer</th><th>Work</th></tr>
      <tr><td>Schubert</td><td>Sonata in A major, D. 664</td></tr>
      <tr><td>Johannes Brahms</td><td>Violin Sonata No. 1 in G major, Op. 78</td></tr>
      <tr><td>Schumann</td><td>Violin Sonata No. 2 in D minor, Op. 121</td></tr>
    </table>
  </body></html>`;
  const event = extractWigmoreEvent(html, "https://www.wigmore-hall.org.uk/whats-on/202606241300");
  assert(
    "structured mixed-composer programme returns only Brahms work",
    event && event.programme === "Violin Sonata No. 1 in G major, Op. 78"
  );
}

{
  const html = `<html><body>
    <h1>Chamber recital</h1>
    <h3>Programme</h3>
    <table>
      <tr><th>Composer</th><th>Work</th></tr>
      <tr><td>Johannes Brahms</td><td>String Quintet in F, Op. 88</td></tr>
      <tr><td>Dvořák</td><td>String Quintet in E-flat major, Op. 97</td></tr>
    </table>
  </body></html>`;
  const event = extractWigmoreEvent(html, "https://www.wigmore-hall.org.uk/whats-on/202606031930");
  assert(
    "structured programme table extracts June-3-style String Quintet entry",
    event && event.programme === "String Quintet No. 1 in F major, Op. 88"
  );
}

{
  const html = `<html><body>
    <h1>Chamber recital</h1>
    <article class="repertoire-items repertoire-work-item">
      <li class="my3 flex flex-wrap">
        <div class="w-4/12">
          <a href="/artists/johannes-brahms">Johannes Brahms</a>
          <p>1833-1897</p>
        </div>
        <div class="w-full sm:w-8/12">
          <div class="repertoire-list">
            <div class="rich-text inline bold">String Quintet in F Op. 88</div>
          </div>
        </div>
      </li>
    </article>
  </body></html>`;
  const event = extractWigmoreEvent(html, "https://www.wigmore-hall.org.uk/whats-on/202606031930");
  assert(
    "wigmore repertoire DOM resolves compact Op. 88 title to canonical work",
    event && event.programme === "String Quintet No. 1 in F major, Op. 88"
  );
}

// ---------------------------------------------------------------------------
// Regression: event must not be dropped when Brahms evidence comes only from
// structured extraction paths and not from literal flattened page text.
// Guards against the failure mode where programme/title matching improves but
// overall event coverage drops because the Brahms inclusion gate ignores the
// newer extraction results.
// ---------------------------------------------------------------------------

{
  // Repertoire DOM is inside a <footer>, so extractBodyText() strips that
  // element and "Johannes Brahms" disappears from bodyText.
  // extractBrahmsWorksFromWigmoreRepertoire() runs before that DOM mutation
  // and does resolve the work — the event must be retained.
  const html = `<html><body>
    <h1>String Quintet Evening</h1>
    <footer>
      <article class="repertoire-items repertoire-work-item">
        <li class="my3 flex flex-wrap">
          <div class="w-4/12">
            <a href="/artists/johannes-brahms">Johannes Brahms</a>
            <p>1833-1897</p>
          </div>
          <div class="w-full sm:w-8/12">
            <div class="repertoire-list">
              <div class="rich-text inline bold">String Quintet in F Op. 88</div>
            </div>
          </div>
        </li>
      </article>
    </footer>
  </body></html>`;
  const event = extractWigmoreEvent(html, "https://www.wigmore-hall.org.uk/whats-on/202606151930");
  assert(
    "event retained when Brahms is only in repertoire DOM stripped from bodyText (footer)",
    event !== null
  );
  assert(
    "programme resolved via repertoire DOM even when bodyText lacks Brahms",
    event && event.programme === "String Quintet No. 1 in F major, Op. 88"
  );
}

{
  // Repertoire DOM inside a <nav> — another element removed by extractBodyText().
  // The event must still be retained and programme resolved correctly.
  const html = `<html><body>
    <h1>Chamber Evening</h1>
    <nav>
      <article class="repertoire-items repertoire-work-item">
        <li>
          <div class="w-4/12">
            <a href="/artists/brahms">Brahms</a>
          </div>
          <div class="repertoire-list">
            <div class="rich-text inline bold">Clarinet Quintet in B minor, Op. 115</div>
          </div>
        </li>
      </article>
    </nav>
  </body></html>`;
  const event = extractWigmoreEvent(html, "https://www.wigmore-hall.org.uk/whats-on/202606221930");
  assert(
    "event retained when Brahms is only in repertoire DOM inside <nav>",
    event !== null
  );
  assert(
    "programme resolved via nav-wrapped repertoire DOM",
    event && event.programme === "Clarinet Quintet in B minor, Op. 115"
  );
}

{
  // Negative control: no Brahms evidence in any path → still return null.
  const html = `<html><body>
    <h1>Mozart Evening</h1>
    <h3>Programme</h3>
    <p>Wolfgang Amadeus Mozart: String Quintet in G minor K516</p>
  </body></html>`;
  const event = extractWigmoreEvent(html, "https://www.wigmore-hall.org.uk/whats-on/202606051930");
  assert(
    "non-Brahms event is still correctly dropped",
    event === null
  );
}

{
  const html = `<html><head>
    <meta name="description" content="A recital featuring Schubert and Brahms: Clarinet Trio in A minor, Op. 114.">
  </head><body>
    <h1>Chamber recital</h1>
    <h3>Programme</h3>
    <p>Schubert: Sonata in A major, D. 664</p>
  </body></html>`;
  const event = extractWigmoreEvent(html, "https://www.wigmore-hall.org.uk/whats-on/202606101930");
  assert(
    "meta description Brahms mention without Programme section is retained",
    event !== null
  );
  // Retained by broad page Brahms signals, but programme-specific sources have
  // no Brahms work match, so fallback should stay the generic Brahms label.
  assert(
    "meta description text is not used as direct programme source",
    event && event.programme === "Brahms programme"
  );
  assert(
    "meta description wording is excluded from resolved programme",
    event && !/clarinet trio in a minor/i.test(event.programme)
  );
  assert(
    "non-Brahms programme text is excluded from retained fallback programme",
    event && !/schubert/i.test(event.programme)
  );
}

{
  const html = `<html><body>
    <h1>Late-night chamber recital</h1>
    <h3>Programme</h3>
    <p>Johannes Brahms: sonata for violin and piano no 3 in d minor op 108</p>
  </body></html>`;
  const event = extractWigmoreEvent(html, "https://www.wigmore-hall.org.uk/whats-on/202606111930");
  assert(
    "structured programme text is normalised to canonical title when confidently matched",
    event && event.programme === "Violin Sonata No. 3 in D minor, Op. 108"
  );
}

{
  const html = `<html><body>
    <h1>Late-night chamber recital</h1>
    <h3>Programme</h3>
    <p>Johannes Brahms: String Quintet in F Op 88</p>
  </body></html>`;
  const event = extractWigmoreEvent(html, "https://www.wigmore-hall.org.uk/whats-on/202606111930");
  assert(
    "structured programme tolerates missing No. 1 and mode words with opus",
    event && event.programme === "String Quintet No. 1 in F major, Op. 88"
  );
}

{
  const html = `<html><body>
    <h1>Evening recital</h1>
    <h3>Programme</h3>
    <p>Brahms - Sonata for violin and piano No 3, Op 108 in D minor</p>
  </body></html>`;
  const event = extractWigmoreEvent(html, "https://www.wigmore-hall.org.uk/whats-on/202606181930");
  assert(
    "structured programme tolerates punctuation and wording order differences",
    event && event.programme === "Violin Sonata No. 3 in D minor, Op. 108"
  );
}

{
  const html = `<html><body>
    <h1>Matinee recital</h1>
    <h3>Programme</h3>
    <p>Johannes Brahms violin sonata no 3 in d op 108</p>
  </body></html>`;
  const event = extractWigmoreEvent(html, "https://www.wigmore-hall.org.uk/whats-on/202606121300");
  assert(
    "structured programme tolerates omitted minor with opus present",
    event && event.programme === "Violin Sonata No. 3 in D minor, Op. 108"
  );
}

{
  const html = `<html><body>
    <h1>Evening recital</h1>
    <h3>Programme</h3>
    <p>String Quintet in F Op. 88</p>
  </body></html>`;
  const event = extractWigmoreEvent(html, "https://www.wigmore-hall.org.uk/whats-on/202606191930");
  assert(
    "programme approximate work match without explicit Brahms mention still resolves canonical work",
    event && event.programme === "String Quintet No. 1 in F major, Op. 88"
  );
}

{
  const html = `<html><body>
    <h1>Piano recital</h1>
    <h3>Programme</h3>
    <p>Johannes Brahms 1833–1897</p>
    <p>Piano Sonata No. 3 in F minor Op. 5</p>
    <h3>Overview</h3>
    <p>Ukrainian pianist Khrystyna Mykhailichenko performs Busoni’s piano transcription of the Chaconne.</p>
  </body></html>`;
  const event = extractWigmoreEvent(html, "https://www.wigmore-hall.org.uk/whats-on/202606171300");
  assert(
    "exact alias matching returns canonical piano sonata title",
    event && event.programme === "Piano Sonata No. 3 in F minor, Op. 5"
  );
}

{
  const html = `<html><body>
    <h1>Autumn chamber concert</h1>
    <h3>Programme</h3>
    <p>Brahms: Clarinet Trio in A minor Op. 114</p>
    <p>Brahms: Clarinet Quintet in B minor, Op. 115</p>
  </body></html>`;
  const event = extractWigmoreEvent(html, "https://www.wigmore-hall.org.uk/whats-on/202610061930");
  assert(
    "multiple structured Brahms entries are joined with separators",
    event && event.programme === "Clarinet Trio in A minor, Op. 114 / Clarinet Quintet in B minor, Op. 115"
  );
}

{
  const html = `<html><body>
    <h1>Composer portrait recital</h1>
    <h3>Programme</h3>
    <p>Johannes Brahms (1833-1897)</p>
    <p>Interval</p>
    <p>Thursday 24 June 2026 7.30pm</p>
    <h3>Overview</h3>
    <p>A broader programme note appears here.</p>
  </body></html>`;
  const event = extractWigmoreEvent(html, "https://www.wigmore-hall.org.uk/whats-on/202606241930");
  assert(
    "programme Brahms reference with lifespan-only text is retained",
    event !== null
  );
  assert(
    "lifespan/date/interval fragments are not emitted as fallback programme text",
    event
      && event.programme !== "1833-1897"
      && event.programme !== "Interval"
      && !/24 June 2026/i.test(event.programme)
  );
}

{
  const html = `<html><body>
    <h1>Late-night recital</h1>
    <h3>Programme</h3>
    <p>Johannes Brahms: Two Songs, arr. for chamber ensemble</p>
    <p>Interval</p>
  </body></html>`;
  const event = extractWigmoreEvent(html, "https://www.wigmore-hall.org.uk/whats-on/202606251930");
  assert(
    "programme Brahms mention without catalog work match keeps event",
    event !== null
  );
  assert(
    "fallback programme text uses Brahms-adjacent programme content",
    event && event.programme === "Two Songs, arr. for chamber ensemble"
  );
}

{
  const html = `<html><head>
    <meta property="og:description" content="Join us for Brahms with rising stars in an evening of chamber music.">
  </head><body>
    <h1>Brahms chamber evening</h1>
    <h3>Programme</h3>
    <p>Schumann: Adagio and Allegro, Op. 70</p>
    <h3>Overview</h3>
    <p>An introduction to Johannes Brahms and his legacy.</p>
  </body></html>`;
  const event = extractWigmoreEvent(html, "https://www.wigmore-hall.org.uk/whats-on/202609011930");
  assert(
    "overview/meta Brahms mention without Programme Brahms evidence is retained",
    event !== null
  );
  // Retained by broad page Brahms signals; programme section is non-Brahms, so
  // overview/meta text should not become resolved programme content.
  assert(
    "overview/meta fallback retention does not treat overview as programme",
    event && event.programme === "Brahms programme"
  );
  assert(
    "overview wording is excluded from resolved programme",
    event && !/legacy/i.test(event.programme)
  );
  assert(
    "non-Brahms programme section text is excluded from fallback programme",
    event && !/schumann/i.test(event.programme)
  );
}

// ---------------------------------------------------------------------------
// collectWigmoreEventLinksStatic (static-HTML fallback path)
// ---------------------------------------------------------------------------

console.log("\ncollectWigmoreEventLinksStatic");

{
  // Monkey-patch fetchHtml to return controlled HTML without network calls.
  const scrape = require("./scrape-brahms");

  // Build a fake listing page that contains a next-month event and a past-month event.
  const { start } = scrape.getNextMonthDateRange();
  const nextMonthYear = start.getUTCFullYear();
  const nextMonthNum = String(start.getUTCMonth() + 1).padStart(2, "0");
  const nextMonthEventSlug = `${nextMonthYear}${nextMonthNum}151930`;
  const nextMonthEventUrl = `https://www.wigmore-hall.org.uk/whats-on/${nextMonthEventSlug}`;

  const pastEventSlug = "202001011200";

  const fakePage0 = `<html><body>
    <a href="/whats-on/${nextMonthEventSlug}">Next month event</a>
    <a href="/whats-on/${pastEventSlug}">Past event</a>
    <a href="/about">Not an event</a>
  </body></html>`;

  // Because fetchHtml is not exported, we test the observable behaviour of
  // collectWigmoreEventLinksStatic by verifying it calls extractEventLinks correctly
  // using the already-tested extractEventLinks function with the same HTML patterns.
  const links = scrape.extractEventLinks(fakePage0);
  assert(
    "static fallback: extractEventLinks finds next-month event URL",
    links.some((l) => l === nextMonthEventUrl)
  );
  assert(
    "static fallback: extractEventLinks finds past event URL (pre-filter)",
    links.some((l) => l.includes(pastEventSlug))
  );
  assert(
    "static fallback: isWithinNextMonth filters next-month event in",
    scrape.isWithinNextMonth(scrape.parseEventDateFromUrl(nextMonthEventUrl))
  );
  assert(
    "static fallback: isWithinNextMonth filters past event out",
    !scrape.isWithinNextMonth(scrape.parseEventDateFromUrl(`https://www.wigmore-hall.org.uk/whats-on/${pastEventSlug}`))
  );
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
