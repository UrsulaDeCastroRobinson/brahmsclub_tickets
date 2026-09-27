import React from "react";
import ResponsiveContainer from "../components/ResponsiveContainer";
import Link from "next/link";

const SCHEDULE_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSEP4_qu1WFQ9JqiKTu_ILKCWmxbzZXL1RO5rOZSYBGjLs0lHgFFz0T4yWJlh7rmagQsLjHqPNV2wTd/pub?output=csv";
const SCHEDULE_SHEET_URL = SCHEDULE_CSV_URL.replace("/pub?output=csv", "/pubhtml");

function normalizeHeader(value = "") {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      row.push(field);
      if (row.some(cell => cell.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      field = "";
      if (char === "\r" && text[i + 1] === "\n") {
        i += 1;
      }
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some(cell => cell.trim() !== "")) {
    rows.push(row);
  }

  return rows;
}

function getColumnIndex(header, keywords) {
  return header.findIndex(cell => {
    const normalized = normalizeHeader(cell);
    return keywords.some(keyword => normalized.includes(keyword));
  });
}

function getCellValue(row, index) {
  if (index < 0 || index >= row.length) return "";
  return (row[index] || "").trim();
}

function extractConcerts(rows) {
  if (!rows.length) return [];

  const [header, ...dataRows] = rows;
  const normalizedHeader = header.map(normalizeHeader);

  const dateIndex = getColumnIndex(header, ["date", "concert date", "concert dates"]) >= 0
    ? getColumnIndex(header, ["date", "concert date", "concert dates"])
    : 0;

  const repertoireIndex = getColumnIndex(header, ["repertoire", "work"]) >= 0
    ? getColumnIndex(header, ["repertoire", "work"])
    : Math.min(1, Math.max(0, normalizedHeader.length - 1));

  const performersIndex = getColumnIndex(header, ["performer", "performers", "artist", "artists"]) >= 0
    ? getColumnIndex(header, ["performer", "performers", "artist", "artists"])
    : Math.min(2, Math.max(0, normalizedHeader.length - 1));

  return dataRows
    .filter(row => row.some(cell => (cell || "").trim() !== ""))
    .map(row => {
      const date = getCellValue(row, dateIndex) || "TBD";
      const repertoire = getCellValue(row, repertoireIndex) || "TBD";
      const performers = getCellValue(row, performersIndex) || "TBD";

      return {
        date,
        repertoire,
        performers,
      };
    });
}

export async function getStaticProps() {
  try {
    const response = await fetch(SCHEDULE_CSV_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch CSV: ${response.status}`);
    }

    const csvText = await response.text();
    const concerts = extractConcerts(parseCsv(csvText));

    return {
      props: {
        concerts,
        hasLoadError: false
      },
      revalidate: 3600
    };
  } catch (error) {
    return {
      props: {
        concerts: [],
        hasLoadError: true
      },
      revalidate: 3600
    };
  }
}

export default function Schedule({ concerts, hasLoadError }) {
  return (
    <ResponsiveContainer>
      <div className="schedule-root">
        <h1 className="club-title">Concert Schedule</h1>
        <Link className="back-link" href="/">← Back to Home</Link>

        <p className="club-description">
          Concert details are synced from our published Google Sheet. View the sheet
          for the full programme details.
        </p>

        <a
          className="book-btn"
          href={SCHEDULE_SHEET_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "inline-block", marginTop: "0.75em", textDecoration: "none" }}
        >
          View Google Sheet
        </a>

        {hasLoadError && (
          <p className="club-description" style={{ marginTop: "1em" }}>
            We could not load the latest concert details right now. Please use the
            Google Sheet link above.
          </p>
        )}

        <div className="schedule-table-wrap">
          <table className="schedule-table">
            <thead>
              <tr>
                <th>Date of Concert</th>
                <th>Name of Repertoire</th>
                <th>Name of Performers</th>
                <th>Book Tickets</th>
              </tr>
            </thead>
            <tbody>
              {concerts.length > 0 ? (
                concerts.map(({ date, repertoire, performers }, index) => (
                  <tr key={`${date}-${repertoire}-${performers}-${index}`}>
                    <td>{date || "TBD"}</td>
                    <td>{repertoire || "TBD"}</td>
                    <td>{performers || "TBD"}</td>
                    <td>
                      <Link
                        href={{
                          pathname: "/booking",
                          query: { date: date || "TBD" }
                        }}
                        className="book-btn"
                        style={{ display: "inline-block", textDecoration: "none" }}
                      >
                        Book Tickets
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>No concert details are available right now. Please check the sheet link above.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ResponsiveContainer>
  );
}
