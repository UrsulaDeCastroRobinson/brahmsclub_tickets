import React from "react";
import FadeInImage from "../components/FadeInImage";
import ResponsiveContainer from "../components/ResponsiveContainer";
import Link from "next/link";

const description = (
  <>
    <h1 className="club-title">Brahms Club</h1>
    <h2 className="club-subtitle">
      This season the Brahms Club will again present the complete chamber works of the Great Man: Johannes Brahms. The concerts are in The Chapel of The Royal Foundation of St Katharine, Limehouse on Sundays in October, November, December 2026 and March and April 2027.
    </h2>
    <div className="club-description">
      Brahms grew up in the Gängeviertel district of Hamburg; a docklands district with a bustling residential and entertainment area for thousands of dockworker and seafaring families. Brahms' first audiences as a pianist were in the dockside pubs playing popular music. Brahms went on to create sublime music that has been described as providing "wondrous glimpses of the secret world of spirits" .<br /><br />
      We are honoured to bring the second complete Brahms chamber works cycle to the residents of Limehouse and the wider Docklands area with generous support of The Royal Foundation of St Katharine.
    </div>
    <Link className="schedule-link" href="/schedule">View Event Schedule</Link>
    <div className="club-description">
      <br />
      Contact: contact@brahmsclub.org
    </div>
	</>
);

export default function Landing() {
  return (
    <ResponsiveContainer>
      <div className="landing-root">
        <FadeInImage
          src="/images/wanderer.jpg"
          alt="Wanderer above the Sea of Fog"
          fadeIn={true}
        />
        <div className="landing-content">
          {description}
        </div>
      </div>
    </ResponsiveContainer>
  );
}
