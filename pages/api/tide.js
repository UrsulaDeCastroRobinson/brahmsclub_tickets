import * as cheerio from 'cheerio';

const BBC_TIDE_URL = 'https://www.bbc.co.uk/weather/coast-and-sea/tide-tables/2/113';
const STATION_NAME = 'Tower Bridge, Thames';

const FETCH_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'accept-language': 'en-GB,en;q=0.9,en-US;q=0.8',
  'cache-control': 'no-cache',
  pragma: 'no-cache',
  referer: 'https://www.google.com/',
  'upgrade-insecure-requests': '1',
};

// Simple in-memory cache to avoid hammering BBC on every page render
let cache = null;
let cacheTime = 0;
const CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes

// ─────────────────────────────── date helpers ─────────────────────────────

/** Return the UTC offset in whole hours that London uses on a given date. */
function getLondonOffsetHours(date) {
  // Compare UTC noon against London noon to determine BST (+1) vs GMT (0)
  const utcNoon = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0));
  const londonHour = parseInt(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      hour: '2-digit',
      hour12: false,
    }).format(utcNoon),
    10,
  );
  return londonHour - 12; // +1 for BST, 0 for GMT
}

/** Convert HH:MM London local time on year-month-day to a UTC Date. */
function londonTimeToUTC(year, month, day, hours, minutes) {
  const refDate = new Date(Date.UTC(year, month - 1, day));
  const offsetHours = getLondonOffsetHours(refDate);
  return new Date(Date.UTC(year, month - 1, day, hours - offsetHours, minutes, 0));
}

/** Return { year, month, day } objects for today and tomorrow in London time. */
function getLondonDates() {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  function parseParts(date) {
    const parts = fmt.formatToParts(date);
    return {
      year: parseInt(parts.find((p) => p.type === 'year').value, 10),
      month: parseInt(parts.find((p) => p.type === 'month').value, 10),
      day: parseInt(parts.find((p) => p.type === 'day').value, 10),
    };
  }

  const today = parseParts(now);
  const tomorrowDate = new Date(Date.UTC(today.year, today.month - 1, today.day + 1));
  const tomorrow = parseParts(tomorrowDate);
  return { today, tomorrow };
}

// ─────────────────────────────── BBC parser ───────────────────────────────

const MONTH_MAP = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

/**
 * Try to parse a date like "Monday 14 July" or "Today, Tuesday 15 July 2025"
 * or "14 Jul" from a string. Returns { day, month } (1-based) or null.
 */
function parseDateHeading(text) {
  const clean = text.toLowerCase().replace(/today,?\s*/i, '').trim();
  // "14 july 2025" or "14 jul" or "monday 14 july"
  const m = clean.match(/(\d{1,2})\s+([a-z]{3,9})/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = MONTH_MAP[m[2]] || MONTH_MAP[m[2].slice(0, 3)];
  return month ? { day, month } : null;
}

function normalizeText(text) {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[↑⇧]/g, 'high')
    .replace(/[↓⇩]/g, 'low')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractEventFromText(text) {
  const clean = normalizeText(text).toLowerCase();

  const typeMatch = clean.match(/\b(high|low)\b(?:\s+tide)?/i);
  const timeMatch = clean.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  const heightMatch = clean.match(/\b(\d+(?:\.\d+)?)\s*(m|metres?)\b/i);

  if (!typeMatch || !timeMatch) return null;

  return {
    type: typeMatch[1].toLowerCase() === 'high' ? 'high' : 'low',
    hours: parseInt(timeMatch[1], 10),
    minutes: parseInt(timeMatch[2], 10),
    heightM: heightMatch ? parseFloat(heightMatch[1]) : null,
  };
}

function sectionDate(section, $, today, tomorrow) {
  const headingText = normalizeText(
    $(section).find('[class*="date"], [class*="heading"], h1, h2, h3, h4').first().text(),
  );
  const parsed = parseDateHeading(headingText);
  if (!parsed) return null;

  const isToday = parsed.day === today.day && parsed.month === today.month;
  const isTomorrow = parsed.day === tomorrow.day && parsed.month === tomorrow.month;
  if (!isToday && !isTomorrow) return null;

  return isToday ? today : tomorrow;
}

function pushEvent(allEvents, extracted, dateParts) {
  if (!extracted || !dateParts) return;
  allEvents.push({
    type: extracted.type,
    timeISO: londonTimeToUTC(
      dateParts.year,
      dateParts.month,
      dateParts.day,
      extracted.hours,
      extracted.minutes,
    ).toISOString(),
    heightM: extracted.heightM,
  });
}

/** Extract all tide events from the BBC tide HTML. */
function parseBBCTideHTML(html, today, tomorrow) {
  const $ = cheerio.load(html);
  const allEvents = [];

  // Strategy 1: BBC tide sections with local heading date context
  const sections = $('section, article, div').filter((_, el) => {
    const cls = ($(el).attr('class') || '').toLowerCase();
    return cls.includes('tide') || cls.includes('wr-c-tide-extremes');
  });

  if (sections.length > 0) {
    sections.each((_, section) => {
      const dateParts = sectionDate(section, $, today, tomorrow);
      if (!dateParts) return;

      // Prefer row/list based parsing inside a dated section
      $(section)
        .find('tr, li, p, div')
        .each((__, node) => {
          const text = normalizeText($(node).text());
          const extracted = extractEventFromText(text);
          pushEvent(allEvents, extracted, dateParts);
        });
    });
  }

  if (allEvents.length === 0) {
    // Strategy 2: Generic table/list scan without section classes
    $('table tr, li').each((_, node) => {
      const text = normalizeText($(node).text());
      const extracted = extractEventFromText(text);
      if (!extracted) return;

      // If no explicit date context, assign to today (sufficient for interpolation window)
      pushEvent(allEvents, extracted, today);
    });
  }

  if (allEvents.length === 0) {
    // Strategy 3: Full text regex fallback
    $('script, style, noscript, nav, header, footer').remove();
    const fullText = normalizeText($('body').text());

    const pattern = /(high|low)(?:\s+tide)?\s+([01]?\d|2[0-3]):([0-5]\d)(?:\s*(?:bst|gmt))?(?:[^\d]{0,20}(\d+(?:\.\d+)?)\s*(?:m|metres?))?/gi;
    let m;
    while ((m = pattern.exec(fullText)) !== null) {
      pushEvent(
        allEvents,
        {
          type: m[1].toLowerCase() === 'high' ? 'high' : 'low',
          hours: parseInt(m[2], 10),
          minutes: parseInt(m[3], 10),
          heightM: m[4] != null ? parseFloat(m[4]) : null,
        },
        today,
      );
    }
  }

  // Dedupe and sort by type+timeISO to avoid dropping alternating same-time entries
  const seen = new Set();
  return allEvents
    .sort((a, b) => a.timeISO.localeCompare(b.timeISO))
    .filter((e) => {
      const key = `${e.type}|${e.timeISO}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

// ─────────────────────────────── handler ──────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=300');

  // Return cached result if still fresh
  if (cache && Date.now() - cacheTime < CACHE_TTL_MS) {
    return res.status(200).json(cache);
  }

  const { today, tomorrow } = getLondonDates();

  try {
    const response = await fetch(BBC_TIDE_URL, { headers: FETCH_HEADERS });
    if (!response.ok) {
      throw new Error(`BBC returned HTTP ${response.status}`);
    }
    const html = await response.text();
    const events = parseBBCTideHTML(html, today, tomorrow);

    if (events.length === 0) {
      throw new Error('No tide events parsed from BBC page');
    }

    // Sort chronologically and deduplicate by timeISO
    const seen = new Set();
    const uniqueEvents = events
      .sort((a, b) => a.timeISO.localeCompare(b.timeISO))
      .filter((e) => {
        if (seen.has(e.timeISO)) return false;
        seen.add(e.timeISO);
        return true;
      });

    const result = {
      station: STATION_NAME,
      source: BBC_TIDE_URL,
      fetchedAt: new Date().toISOString(),
      events: uniqueEvents,
    };

    cache = result;
    cacheTime = Date.now();
    return res.status(200).json(result);
  } catch (err) {
    console.error('[tide api] fetch/parse error:', err.message);

    // Return stale cache if available, otherwise 503
    if (cache) {
      return res.status(200).json({ ...cache, stale: true });
    }
    return res.status(503).json({ error: 'Tide data temporarily unavailable', detail: err.message });
  }
}
