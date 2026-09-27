import React from "react";
import ResponsiveContainer from "../components/ResponsiveContainer";
import Link from "next/link";

const SCHEDULE_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSEP4_qu1WFQ9JqiKTu_ILKCWmxbzZXL1RO5rOZSYBGjLs0lHgFFz0T4yWJlh7rmagQsLjHqPNV2wTd/pub?output=csv";
const DISPLAY_CUTOFF = new Date(2027, 3, 18);

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

function parseDate(value) {
  const trimmedValue = value.trim();
  const dayFirstMatch = trimmedValue.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/);

  if (dayFirstMatch) {
    const [, day, month, year] = dayFirstMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const parsed = new Date(trimmedValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function splitCellValues(value) {
  return value
    .split(/\r?\n|\s*;\s*/)
    .map(item => item.trim())
    .filter(Boolean);
}

function extractConcerts(rows) {
  if (!rows.length) return [];

  const [header, ...dataRows] = rows;
  const dateIndex = getColumnIndex(header, ["date", "concert date", "concert dates"]);
  const repertoireIndex = getColumnIndex(header, ["repertoire", "work"]);
  const performersIndex = getColumnIndex(header, ["performer", "performers", "artist", "artists"]);
  const resolvedDateIndex = dateIndex >= 0 ? dateIndex : 0;
  const resolvedRepertoireIndex = repertoireIndex >= 0 ? repertoireIndex : 1;
  const resolvedPerformersIndex = performersIndex >= 0 ? performersIndex : 2;
  const groupedConcerts = new Map();
  let currentDate = "";

  dataRows
    .filter(row => row.some(cell => (cell || "").trim() !== ""))
    .forEach(row => {
      const rowDate = getCellValue(row, resolvedDateIndex);
      if (rowDate) currentDate = rowDate;
      if (!currentDate) return;

      const parsedDate = parseDate(currentDate);
      if (!parsedDate || parsedDate > DISPLAY_CUTOFF) return;

      const dateKey = `${parsedDate.getFullYear()}-${parsedDate.getMonth()}-${parsedDate.getDate()}`;
      const concert = groupedConcerts.get(dateKey) || {
        date: currentDate,
        dateKey,
        repertoire: [],
        performers: [],
      };

      concert.repertoire.push(...splitCellValues(getCellValue(row, resolvedRepertoireIndex)));
      concert.performers.push(...splitCellValues(getCellValue(row, resolvedPerformersIndex)));
      groupedConcerts.set(dateKey, concert);
    });

  return Array.from(groupedConcerts.values()).map(concert => ({
    ...concert,
    repertoire: concert.repertoire.length ? [...new Set(concert.repertoire)] : ["TBD"],
    performers: concert.performers.length ? [...new Set(concert.performers)] : ["TBD"],
  }));
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

        {hasLoadError && (
          <p className="club-description" style={{ marginTop: "1em" }}>
            We could not load the latest concert details right now. Please try again later.
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
                concerts.map(({ date, dateKey, repertoire, performers }) => (
                  <tr key={dateKey}>
                    <td>{date} 2pm</td>
                    <td>
                      {repertoire.map((piece, index) => (
                        <React.Fragment key={`${piece}-${index}`}>
                          {index > 0 && <br />}
                          {piece}
                        </React.Fragment>
                      ))}
                    </td>
                    <td>
                      {performers.map((performer, index) => (
                        <React.Fragment key={`${performer}-${index}`}>
                          {index > 0 && <br />}
                          {performer}
                        </React.Fragment>
                      ))}
                    </td>
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
                  <td colSpan={4}>No concert details are available right now.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ResponsiveContainer>
  );
}
