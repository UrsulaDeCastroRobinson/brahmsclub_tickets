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

function addOneDay(dateParts) {
  const d = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day));
  d.setUTCDate(d.getUTCDate() + 1);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function resolveDateParts(parsed, today, tomorrow) {
  if (!parsed) return null;
  if (parsed.day === today.day && parsed.month === today.month) return today;
  if (parsed.day === tomorrow.day && parsed.month === tomorrow.month) return tomorrow;
  return { year: today.year, month: parsed.month, day: parsed.day };
}

function getLondonWeekdayAbbrev(dateParts) {
  const d = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, 12, 0, 0));
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short' }).format(d).toLowerCase();
}

function inferDateFromDay(day, weekdayAbbrev, today, tomorrow) {
  const normalizedWeekday = String(weekdayAbbrev || '').toLowerCase().slice(0, 3);
  const candidates = [today, tomorrow];

  const exact = candidates.find(
    (candidate) => candidate.day === day && getLondonWeekdayAbbrev(candidate).startsWith(normalizedWeekday),
  );
  if (exact) return exact;

  const dayOnly = candidates.find((candidate) => candidate.day === day);
  if (dayOnly) return dayOnly;

  const weekdayOnly = candidates.find((candidate) => getLondonWeekdayAbbrev(candidate).startsWith(normalizedWeekday));
  if (weekdayOnly) return weekdayOnly;

  return today;
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

  // Strategy 1: Semantic table parsing by header meanings
  $('table').each((_, table) => {
    const rows = $(table).find('tr');
    if (rows.length === 0) return;

    let headerIndex = -1;
    let typeIdx = -1;
    let timeIdx = -1;
    let heightIdx = -1;

    rows.each((rowIndex, row) => {
      if (headerIndex !== -1) return;

      const headers = $(row)
        .find('th, td')
        .map((__, cell) => normalizeText($(cell).text()).toLowerCase())
        .get();
      if (headers.length === 0) return;

      headers.forEach((h, idx) => {
        if (typeIdx === -1 && h.includes('type') && h.includes('tide')) typeIdx = idx;
        if (timeIdx === -1 && h.includes('time')) timeIdx = idx;
        if (heightIdx === -1 && h.includes('height')) heightIdx = idx;
      });

      if (typeIdx !== -1 && timeIdx !== -1) {
        headerIndex = rowIndex;
      } else {
        typeIdx = -1;
        timeIdx = -1;
        heightIdx = -1;
      }
    });

    if (headerIndex === -1) return;

    const headingText = normalizeText(
      `${$(table).find('caption').first().text()} ${$(table).prevAll('h1,h2,h3,h4,p').slice(0, 2).text()} ${$(table)
        .closest('section, article, div')
        .find('h1,h2,h3,h4')
        .first()
        .text()}`,
    );
    const parsedHeadingDate = parseDateHeading(headingText);
    let currentDate = resolveDateParts(parsedHeadingDate, today, tomorrow) || today;
    let previousMinutes = null;

    rows.slice(headerIndex + 1).each((__, row) => {
      const cells = $(row)
        .find('th, td')
        .map((___, cell) => normalizeText($(cell).text()))
        .get();
      if (cells.length === 0) return;

      const typeText = cells[typeIdx] || '';
      const timeText = cells[timeIdx] || '';
      const heightText = heightIdx >= 0 ? cells[heightIdx] || '' : '';

      const typeMatch = typeText.match(/\b(high|low)\b/i);
      const timeMatch = timeText.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
      if (!typeMatch || !timeMatch) return;

      const totalMinutes = parseInt(timeMatch[1], 10) * 60 + parseInt(timeMatch[2], 10);
      if (previousMinutes != null && totalMinutes < previousMinutes) {
        currentDate = addOneDay(currentDate);
      }
      previousMinutes = totalMinutes;

      const heightMatch = heightText.match(/(\d+(?:\.\d+)?)/);
      pushEvent(
        allEvents,
        {
          type: typeMatch[1].toLowerCase() === 'high' ? 'high' : 'low',
          hours: parseInt(timeMatch[1], 10),
          minutes: parseInt(timeMatch[2], 10),
          heightM: heightMatch ? parseFloat(heightMatch[1]) : null,
        },
        currentDate,
      );
    });
  });

  if (allEvents.length === 0) {
    // Strategy 2: BBC tide sections with local heading date context
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
  }

  if (allEvents.length === 0) {
    // Strategy 3: Generic table/list scan without section classes
    $('table tr, li').each((_, node) => {
      const text = normalizeText($(node).text());
      const extracted = extractEventFromText(text);
      if (!extracted) return;

      // If no explicit date context, assign to today (sufficient for interpolation window)
      pushEvent(allEvents, extracted, today);
    });
  }

  if (allEvents.length === 0) {
    // Strategy 4: Parse summary cards like "Next High tide ... (Wed 15th 03:00 BST)"
    $('script, style, noscript, nav, header, footer').remove();
    const fullText = normalizeText($('body').text());

    const nextPattern =
      /next\s+(high|low)\s+tide[^()]*\(([a-z]{3})\s+(\d{1,2})(?:st|nd|rd|th)\s+([01]?\d|2[0-3]):([0-5]\d)\s+(bst|gmt)\)/gi;
    let nextMatch;
    while ((nextMatch = nextPattern.exec(fullText)) !== null) {
      pushEvent(
        allEvents,
        {
          type: nextMatch[1].toLowerCase() === 'high' ? 'high' : 'low',
          hours: parseInt(nextMatch[4], 10),
          minutes: parseInt(nextMatch[5], 10),
          heightM: null,
        },
        inferDateFromDay(parseInt(nextMatch[3], 10), nextMatch[2], today, tomorrow),
      );
    }
  }

  if (allEvents.length === 0) {
    // Strategy 5: Full text regex fallback
    $('script, style, noscript, nav, header, footer').remove();
    const fullText = normalizeText($('body').text());

    const patterns = [
      /(high|low)(?:\s+tide)?\s+([01]?\d|2[0-3]):([0-5]\d)(?:\s*(?:bst|gmt))?(?:[^\d]{0,20}(\d+(?:\.\d+)?)\s*(?:m|metres?))?/gi,
      /([01]?\d|2[0-3]):([0-5]\d)(?:\s*(?:bst|gmt))?\s+(high|low)(?:\s+tide)?(?:[^\d]{0,20}(\d+(?:\.\d+)?)(?:\s*(?:m|metres?))?)?/gi,
    ];

    patterns.forEach((pattern, idx) => {
      let m;
      while ((m = pattern.exec(fullText)) !== null) {
        const type = idx === 0 ? m[1] : m[3];
        const hours = idx === 0 ? m[2] : m[1];
        const minutes = idx === 0 ? m[3] : m[2];
        const height = m[4];
        pushEvent(
          allEvents,
          {
            type: String(type).toLowerCase() === 'high' ? 'high' : 'low',
            hours: parseInt(hours, 10),
            minutes: parseInt(minutes, 10),
            heightM: height != null ? parseFloat(height) : null,
          },
          today,
        );
      }
    });
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

function parserDiagnosticSnippet(html) {
  const $ = cheerio.load(html);
  $('script, style, noscript').remove();
  return normalizeText($('body').text()).slice(0, 500);
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
      console.error('[tide api] parse failed after successful fetch', {
        status: response.status,
        url: response.url || BBC_TIDE_URL,
        htmlBytes: html.length,
        textSnippet: parserDiagnosticSnippet(html),
      });
      throw new Error('No tide events parsed from BBC page');
    }

    // Sort chronologically and deduplicate by event identity
    const seen = new Set();
    const uniqueEvents = events
      .sort((a, b) => a.timeISO.localeCompare(b.timeISO))
      .filter((e) => {
        const key = `${e.type}|${e.timeISO}|${e.heightM ?? ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
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
