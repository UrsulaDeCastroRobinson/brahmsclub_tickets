import React, { useEffect, useState, useRef, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';

const DATA_REFRESH_MS = 20 * 60 * 1000; // refetch tide data every 20 min
const TICK_MS = 1000;                   // visual update every second

/**
 * Given a sorted array of tide events and the current time (ms since epoch),
 * find the bracketing prev/next events and compute fill progress [0..1]
 * and direction ('rising' | 'falling' | null).
 */
function computeTideState(events, nowMs) {
  if (!events || events.length < 2) return { progress: null, direction: null, prev: null, next: null };

  const times = events.map((e) => ({ ...e, ms: new Date(e.timeISO).getTime() }));

  // Find the last event <= now
  let prevIdx = -1;
  for (let i = 0; i < times.length; i++) {
    if (times[i].ms <= nowMs) prevIdx = i;
  }

  if (prevIdx === -1 || prevIdx === times.length - 1) {
    // Before first event or after last — can't interpolate
    return { progress: null, direction: null, prev: null, next: null };
  }

  const prev = times[prevIdx];
  const next = times[prevIdx + 1];
  const span = next.ms - prev.ms;
  if (span <= 0) return { progress: null, direction: null, prev, next };

  const raw = (nowMs - prev.ms) / span;
  const progress = Math.min(1, Math.max(0, raw));

  let direction;
  if (prev.type === 'low' && next.type === 'high') {
    direction = 'rising';
  } else if (prev.type === 'high' && next.type === 'low') {
    direction = 'falling';
  } else {
    direction = null;
  }

  // Adjust fill: rising → 0→1, falling → 1→0
  const fill = direction === 'falling' ? 1 - progress : progress;

  return { fill, direction, prev, next };
}

function formatTime(isoString) {
  if (!isoString) return '--:--';
  return new Date(isoString).toLocaleTimeString('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatHeight(heightM) {
  if (heightM == null) return '';
  return `${heightM.toFixed(1)}m`;
}

export default function TidePage() {
  const [events, setEvents] = useState(null);
  const [fetchedAt, setFetchedAt] = useState(null);
  const [error, setError] = useState(null);
  const [tideState, setTideState] = useState({ fill: null, direction: null, prev: null, next: null });
  const tickRef = useRef(null);
  const fetchRef = useRef(null);

  const tick = useCallback(
    (evts) => {
      const nowMs = Date.now();
      setTideState(computeTideState(evts, nowMs));
    },
    [],
  );

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/tide');
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setEvents(data.events);
      setFetchedAt(data.fetchedAt);
      setError(data.stale ? 'Using cached data' : null);
      return data.events;
    } catch (e) {
      setError(e.message);
      return null;
    }
  }, []);

  useEffect(() => {
    let evts = null;

    const startTick = (e) => {
      evts = e;
      clearInterval(tickRef.current);
      tickRef.current = setInterval(() => tick(evts), TICK_MS);
      tick(evts);
    };

    fetchData().then((e) => {
      if (e) startTick(e);
    });

    fetchRef.current = setInterval(async () => {
      const e = await fetchData();
      if (e) startTick(e);
    }, DATA_REFRESH_MS);

    return () => {
      clearInterval(tickRef.current);
      clearInterval(fetchRef.current);
    };
  }, [fetchData, tick]);

  const { fill, direction, next } = tideState;

  const fillPercent = fill != null ? Math.round(fill * 100) : null;

  // Water fill height as percentage of viewport
  const fillHeight = fill != null ? `${fill * 100}vh` : '0vh';

  const arrowChar = direction === 'rising' ? '↑' : direction === 'falling' ? '↓' : '–';
  const arrowLabel =
    direction === 'rising' ? 'Tide rising' : direction === 'falling' ? 'Tide falling' : 'Tide direction unknown';

  const nextLabel = next
    ? `${next.type === 'high' ? 'High' : 'Low'} tide at ${formatTime(next.timeISO)}${next.heightM != null ? ' · ' + formatHeight(next.heightM) : ''}`
    : '';

  const unavailable = fill == null;

  return (
    <>
      <Head>
        <title>Thames Tide – Brahms Club</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="tide-root">
        {/* Water fill layer — rises from bottom */}
        <div
          className="tide-fill"
          style={{ height: unavailable ? '0' : fillHeight }}
          aria-hidden="true"
        />

        {/* Main content */}
        <div className="tide-content">
          {unavailable ? (
            <div className="tide-unavailable">
              <span className="tide-arrow tide-arrow--neutral">~</span>
              <p className="tide-error">{error || 'Loading tide data…'}</p>
            </div>
          ) : (
            <>
              <span className="tide-arrow" aria-label={arrowLabel}>
                {arrowChar}
              </span>
              <p className="tide-percent">{fillPercent}%</p>
            </>
          )}
        </div>

        {/* Footer info strip */}
        <div className="tide-footer">
          <span className="tide-footer__next">{nextLabel}</span>
          {fetchedAt && (
            <span className="tide-footer__updated">
              Updated {formatTime(fetchedAt)}
            </span>
          )}
          <a
            className="tide-footer__source"
            href="https://www.bbc.co.uk/weather/coast-and-sea/tide-tables/2/113"
            target="_blank"
            rel="noopener noreferrer"
          >
            Source: BBC Tides · Tower Bridge
          </a>
          <Link href="/" className="tide-footer__home">
            ← Home
          </Link>
        </div>
      </div>
    </>
  );
}
