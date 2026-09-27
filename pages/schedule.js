import React from "react";
import ResponsiveContainer from "../components/ResponsiveContainer";
import Link from "next/link";

const SCHEDULE_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSEP4_qu1WFQ9JqiKTu_ILKCWmxbzZXL1RO5rOZSYBGjLs0lHgFFz0T4yWJlh7rmagQsLjHqPNV2wTd/pub?output=csv";
const SCHEDULE_SHEET_URL = SCHEDULE_CSV_URL.replace("/pub?output=csv", "/pubhtml");

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

function extractConcerts(rows) {
  if (!rows.length) return [];

  const [header, ...dataRows] = rows;
  const dateColumnIndex = header.findIndex(cell => {
    const normalized = cell.trim().toLowerCase();
    return normalized === "date" || normalized === "concert date" || normalized === "concert dates";
  });
  const rowsToUse = dateColumnIndex >= 0 ? dataRows : rows;
  const dateIndex = dateColumnIndex >= 0 ? dateColumnIndex : 0;

  return rowsToUse
    .map(row => (row[dateIndex] || "").trim())
    .filter(Boolean)
    .map(date => ({ date }));
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
          Concert dates are synced from our published Google Sheet. View the sheet
          for full repertoire and performer details.
        </p>

        <a
          className="book-btn"
          href={SCHEDULE_SHEET_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "inline-block", marginTop: "0.75em", textDecoration: "none" }}
        >
          View Repertoire and Performers
        </a>

        {hasLoadError && (
          <p className="club-description" style={{ marginTop: "1em" }}>
            We could not load the latest concert dates right now. Please use the
            Google Sheet link above.
          </p>
        )}

        <div className="schedule-table-wrap">
          <table className="schedule-table">
            <thead>
              <tr>
                <th>Concert Date</th>
                <th>Book Tickets</th>
              </tr>
            </thead>
            <tbody>
              {concerts.length > 0 ? (
                concerts.map(({ date }, index) => (
                  <tr key={`${date}-${index}`}>
                    <td>{date}</td>
                    <td>
                      <Link
                        href={{
                          pathname: "/booking",
                          query: { date }
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
                  <td colSpan={2}>No concert dates are available right now. Please check the sheet link above.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ResponsiveContainer>
  );
}