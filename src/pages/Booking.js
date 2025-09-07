import React, { useState } from "react";
import ResponsiveContainer from "../components/ResponsiveContainer";
import { Link, useLocation } from "react-router-dom";

function useQuery() {
  const { search } = useLocation();
  return React.useMemo(() => new URLSearchParams(search), [search]);
}

function Booking() {
  const query = useQuery();
  const date = query.get("date") || "Concert";
  const [amount, setAmount] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
    // Here you’d integrate payment processing, e.g., Stripe or PayPal
  };

  return (
    <ResponsiveContainer>
      <div className="booking-root">
        <h1 className="club-title">Book Tickets</h1>
        <Link className="back-link" to="/schedule">← Back to Schedule</Link>
        <div className="booking-details">
          <h2>{date}</h2>
          <form className="booking-form" onSubmit={handleSubmit}>
            <label>
              Ticket Donation Amount (£, suggested: £10):
              <input
                type="number"
                min={1}
                step="any"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                required
                placeholder="Enter amount"
              />
            </label>
            <button type="submit" className="booking-btn">
              Buy Ticket
            </button>
          </form>
          {submitted && (
            <div className="booking-confirmation">
              <strong>Thank you for your support!</strong><br />
              Your booking has been received (simulated).<br />
              All proceeds go towards our supported charities:<br />
              <ul>
                <li>
                  <a href="https://iluminamusic.com/en/about-top" target="_blank" rel="noopener noreferrer">
                    Ilumina Music
                  </a>
                </li>
                <li>
                  <a href="https://www.i-m-s.org.uk/about-us/our-mission/" target="_blank" rel="noopener noreferrer">
                    IMS Prussia Cove
                  </a>
                </li>
              </ul>
            </div>
          )}
          {!submitted && (
            <div className="booking-charity-note">
              <em>
                All proceeds go towards our supported charities Ilumina Music&nbsp;
                <a href="https://iluminamusic.com/en/about-top" target="_blank" rel="noopener noreferrer">
                  (link)
                </a>
                {" and IMS Prussia Cove "}
                <a href="https://www.i-m-s.org.uk/about-us/our-mission/" target="_blank" rel="noopener noreferrer">
                  (link)
                </a>
                .
              </em>
            </div>
          )}
        </div>
      </div>
    </ResponsiveContainer>
  );
}

export default Booking;