import React from "react";
import ResponsiveContainer from "../components/ResponsiveContainer";
import Link from "next/link";

// Sundays in March-May
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
  months2.forEach((month, idx) => {
    const sundays = getSundays(idx + 2, currentYear); // March=2, next calendar year
    events.push(...sundays.map(date => ({ date, venue: venues[(idx + 3) % venues.length] })));
  });

	// Exclude events where the date string starts with "28" (any language, any format)
	let filteredEvents = events.filter(({ date }) => {
	  // Exclude if date starts with 28, or contains 17, 24, or 31 as a whole word (to avoid language issues)
	  return (
		!/^28(\D|$)/.test(date.trim()) &&
		!/\b(1|8|24|31)\b/.test(date)
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
					  ? "Clarinet Trio; Clarinet Sonata Eb major"
					  : i === 1
					  ? "Waltzes - piano four hands"
					  : i === 2
					  ? "String Sextet Bb major"
					  : i === 3
					  ? "No concert, Easter Sunday"
					  : i === 4
					  ? "Horn trio"
					  : i === 5
					  ? "Cello sonata F major"
					  : i === 6
					  ? "Piano quartet C minor; String quartet Bb major"
					  : i === 7
					  ? "Piano trio C minor"
					  : i === 8
					  ? "Piano trio C major; violin sonata A major"
					  : i === 9
					  ? "Piano quartet G minor; violin sonata G major"
					  : "TBC"}
				  </td>
                  <td>
					{ i === 3 ? (
						<span style={{ fontWeight: "bold", color: "red" }}>No concert</span>
					) : (     
              
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
					 )}
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