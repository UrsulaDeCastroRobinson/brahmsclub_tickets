import { useState, useEffect } from "react";
import { useRouter } from "next/router";

export default function Booking() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
   const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (router.isReady && router.query.date) {
      setDate(router.query.date);
    }
  }, [router.isReady, router.query.date]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const res = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, quantity, date, amount, email }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to process booking");
      }
      // Direct redirect to Stripe
      window.location.href = "https://buy.stripe.com/aFaeVc2Hj43z3pJ2RzdEs00";
    } catch (err) {
      setError(err.message);
      setIsLoading(false);
    }
  };

  return (
    <div className="booking-root">
      <div className="booking-details">
        <h2 className="club-title">Book Your Ticket</h2>
        <form className="booking-form" onSubmit={handleSubmit}>
          <label>
            Your name:
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
          </label>
          <label>
            Your email:
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Concert date:
            <input
              type="text"
              value={date}
              placeholder="YYYY-MM-DD"
              onChange={e => setDate(e.target.value)}
              required
            />
          </label>
          <label>
            Number of tickets:
            <input
              type="text"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              required
            />
          </label>
          <label>
            Donation amount:
            <input
              type="number"
              value={amount}
              placeholder="£5, £10 or £20. Contact us for season donation"
              min="1"
              onChange={e => setAmount(e.target.value)}
              required
            />
          </label>

         <button
		  type="submit"
		  className="booking-btn"
		  disabled={isLoading}
		  onMouseEnter={() => setIsHovered(true)}
		  onMouseLeave={() => setIsHovered(false)}
		  style={{
			background: isLoading
			  ? "#b7c2cd"
			  : isHovered
			  ? "linear-gradient(90deg, #c9a86a 40%, #3e4a3a 100%)"
			  : "linear-gradient(90deg, #3e4a3a 40%, #4d5660 100%)",
			color: isLoading
			  ? "#7a8794"
			  : isHovered
			  ? "#2a2e26"
			  : "#fff7e1",
			cursor: isLoading ? "not-allowed" : "pointer",
			border: "none",
			borderRadius: "0.4em",
			boxShadow: isLoading
			  ? "none"
			  : "0 1px 4px 0 rgba(77,86,96,0.11)",
			fontFamily: "'Montserrat', 'Arial', sans-serif",
			fontSize: "1.15em",
			letterSpacing: "0.02em",
			padding: "0.8em 1.5em",
			transition:
			  "background 0.2s, color 0.2s, box-shadow 0.2s, cursor 0.2s"
		  }}
		>
		  {isLoading ? "Processing for payment with Stripe" : "Book Now"}
   		</button>
          {error && (
            <div style={{ color: "#f88", marginTop: 8 }}>{error}</div>
          )}
        </form>
        <div className="booking-charity-note">
          <em>
            All proceeds go towards our supported charities: Ilumina Music&nbsp;
            <a href="https://iluminamusic.com/en/about-top" target="_blank" rel="noopener noreferrer">
              (link)
            </a>
            {" , IMS Prussia Cove "}
            <a href="https://www.i-m-s.org.uk/about-us/our-mission/" target="_blank" rel="noopener noreferrer">
              (link)
            </a>
            {" and The Royal Foundation of St Katharine "}
            <a href="https://www.rfsk.org.uk/about" target="_blank" rel="noopener noreferrer">
              (link)
            </a>
            .
          </em>
		  <div>
		   <em>
		   <br />
		   Contact: contact@brahmsclub.org
          </em>
		  </div>
        </div>
      </div>
    </div>
  );
}