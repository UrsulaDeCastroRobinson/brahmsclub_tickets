import React from "react";
import ResponsiveContainer from "../components/ResponsiveContainer";
import Link from "next/link";

// Sundays in November-December and March-May
const months1 = ["November", "December"];
const months2 = ["March", "April", "May"];
const venues = [
  "The Royal Foundation of St Katharine",
  "The Royal Foundation of St Katharine",
  "The Royal Foundation of St Katharine",
  "The Royal Foundation of St Katharine",
  "The Royal Foundation of St Katharine",
  "The Royal Foundation of St Katharine",
  "The Royal Foundation of St Katharine",
  "The Royal Foundation of St Katharine",
];

function getSundays(month, year) {
  // Get all Sundays in a month
  const sundays = [];
  const date = new Date(year, month, 1);
  while (date.getMonth() === month) {
    if (date.getDay() === 0) {
      sundays.push(new Date(date));
    }
    date.setDate(date.getDate() + 1);
  }
  return sundays.map(d =>
    d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric"
    })
  );
}

export default function Schedule() {
  const currentYear = new Date().getFullYear();
  // Generate all events
  const events = [];
  months1.forEach((month, idx) => {
    const sundays = getSundays(idx + 10, currentYear); // November=10
    events.push(...sundays.map(date => ({ date, venue: venues[idx % venues.length] })));
  });
  months2.forEach((month, idx) => {
    const sundays = getSundays(idx + 2, currentYear + 1); // March=2, next calendar year
    events.push(...sundays.map(date => ({ date, venue: venues[(idx + 3) % venues.length] })));
  });

	// Exclude events where the date string starts with "28" (any language, any format)
	let filteredEvents = events.filter(({ date }) => {
	  // Exclude if date starts with 28, or contains 17, 24, or 31 as a whole word (to avoid language issues)
	  return (
		!/^28(\D|$)/.test(date.trim()) &&
		!/\b(17|24|31)\b/.test(date)
	  );
	});

  return (
    <ResponsiveContainer>
      <div className="schedule-root">
        <h1 className="club-title">Event Schedule</h1>
        <Link className="back-link" href="/">← Back to Home</Link>
        <div className="schedule-table-wrap">
          <table className="schedule-table">
            <thead>
              <tr>
                <th>Date (at 2pm)</th>
                <th>Venue</th>
                <th>Works</th>
                <th>Book Tickets</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.map(({ date, venue }, i) => (
                <tr key={i}>
                  <td>{date}</td>
                  <td>{venue}</td>
                  <td>
				  {i === 0
					? "Piano Trio No. 1 in B major"
					: i === 1
					  ? "Piano Quartet No. 2 in A major"
					  : i === 2
					  ? "Clarinet Quintet"
					  : i === 3
					  ? "Cello Sonata No. 1 in E minor; String Sextet No. 2 in G major"
					   : i === 4
					  ? "Piano Quintet in F minor"
					  : i === 5
					  ? "String Quartet No. 2 in A minor; String Sextet No. 1 in B-flat major"
					   : i === 6
					  ? "Jennifer Stumm and friends"
					  : i === 7
					  ? "String Quintet in F major"
					  : "TBC"}
				  </td>
                  <td>
					//{i === 0 ? (
					//	<span style={{ fontWeight: "bold", color: "red" }}>Fully booked</span>
				//) : (                   
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
					 // )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ResponsiveContainer>
  );
}