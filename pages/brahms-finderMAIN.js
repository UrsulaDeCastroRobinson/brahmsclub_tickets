import React, { useEffect, useState } from "react";
import Link from "next/link";
import ResponsiveContainer from "../components/ResponsiveContainer";
import { BRAHMS_LIBRARY_PROGRAMMES } from "../lib/brahms-library-programmes";

const FEEDS = [
  { label: "Brahms Finder", url: "/data/brahms-performances.json" },
  { label: "Brahms General Finder", url: "/data/brahms-generalfinder-performances.json" },
];

const INITIAL_DATA = { generatedAt: "", month: "", items: [] };
const LIBRARY_PROGRAMMES = new Set(
  BRAHMS_LIBRARY_PROGRAMMES.map((title) => String(title || "").trim().toLowerCase()).filter(Boolean)
);

function splitProgramme(programme = "") {
  return String(programme)
    .split("/")
    .map((work) => work.trim().toLowerCase())
    .filter(Boolean);
}

function normaliseItem(item = {}) {
  return {
    title: item.title || "",
    date: item.date || "",
    venue: item.venue || "",
    programme: item.programme || "",
    url: item.url || "",
  };
}

function buildItemKey(item) {
  return [item.url, item.title, item.date]
    .map((value) => String(value || "").trim().toLowerCase())
    .join("|");
}

function hasRenderableContent(item) {
  return Boolean(item.title || item.date || item.venue || item.programme || item.url);
}

function isInLibrary(item) {
  const programmeWorks = splitProgramme(item.programme);
  if (programmeWorks.length === 0) return false;
  return programmeWorks.some((work) => LIBRARY_PROGRAMMES.has(work));
}

function parseTimestamp(value) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function aggregateFeedPayloads(payloads) {
  const combinedItems = [];
  const seenKeys = new Set();

  payloads.forEach((payload) => {
    const items = Array.isArray(payload.items) ? payload.items : [];

    items.forEach((rawItem) => {
      const item = normaliseItem(rawItem);
      if (!hasRenderableContent(item)) return;
      if (!isInLibrary(item)) return;
      const key = buildItemKey(item);
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      combinedItems.push(item);
    });
  });

  const generatedAtCandidates = payloads
    .map((payload) => payload.generatedAt)
    .filter(Boolean)
    .map((generatedAt) => ({ value: generatedAt, timestamp: parseTimestamp(generatedAt) }))
    .sort((a, b) => {
      if (a.timestamp === null && b.timestamp === null) return 0;
      if (a.timestamp === null) return 1;
      if (b.timestamp === null) return -1;
      return b.timestamp - a.timestamp;
    });

  const generatedAt = generatedAtCandidates.length > 0 ? generatedAtCandidates[0].value : "";
  const month = payloads.map((payload) => payload.month).find(Boolean) || "";

  return {
    generatedAt,
    month,
    items: combinedItems,
  };
}

export default function BrahmsFinderMain() {
  const [data, setData] = useState(INITIAL_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState([]);

  useEffect(() => {
    Promise.allSettled(
      FEEDS.map(async (feed) => {
        const response = await fetch(feed.url);
        if (!response.ok) {
          throw new Error(`Could not load ${feed.label}.`);
        }

        const json = await response.json();
        return { feed, json };
      })
    )
      .then((results) => {
        const loaded = results
          .filter((result) => result.status === "fulfilled")
          .map((result) => result.value.json);

        const failedWarnings = results
          .map((result, index) => {
            if (result.status === "fulfilled") return "";
            return `${FEEDS[index].label} is temporarily unavailable.`;
          })
          .filter(Boolean);

        setWarnings(failedWarnings);

        if (loaded.length === 0) {
          throw new Error("Could not load any Brahms performance feeds.");
        }

        setData(aggregateFeedPayloads(loaded));
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return (
    <ResponsiveContainer>
      <main className="page page--brahms-finder">
        <section className="container">
          <h1 className="club-title">Brahms Chamber Music Listings (excludes Brahms Club)</h1>

          <Link className="back-link" href="/">Back to Home</Link>

          {loading && <p>Loading performances…</p>}
          {error && <p role="alert">{error}</p>}

          {!loading && !error && (
            <>
              {warnings.length > 0 && (
                <div role="alert" aria-live="polite">
                  {warnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              )}

              {data.items.length === 0 ? (
                <p>No performances found yet.</p>
              ) : (
                <ul className="brahms-performance-list">
                  {data.items.map((item) => (
                    <li key={buildItemKey(item)} className="brahms-performance-card">
                      <h2>{item.title}</h2>
                      <p><strong>Date:</strong> {item.date}</p>
                      <p><strong>Venue:</strong> {item.venue}</p>
                      <p><strong>Programme:</strong> {item.programme}</p>
                      {item.url && (
                        <p>
                          <a href={item.url} target="_blank" rel="noreferrer">
                            View event
                          </a>
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </main>
    </ResponsiveContainer>
  );
}
