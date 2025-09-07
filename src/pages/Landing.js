import React, { useEffect, useState } from "react";
import FadeInImage from "../components/FadeInImage";
import ResponsiveContainer from "../components/ResponsiveContainer";
import { Link } from "react-router-dom";

const initialQuote = "'My voice - it is becoming majestic.'";

const description = (
  <>
    <h1 className="club-title">Brahms Club</h1>
    <h2 className="club-subtitle">
      This season the Brahms Club will host the complete chamber works of the Great Man: Johannes Brahms. The concerts are free and in Limehouse historic buildings every Sunday from November through December and March through May. 
    </h2>
    <div className="club-description">
      Brahms grew up in the Gängeviertel district of Hamburg; a docklands district with a bustling residential and entertainment area for thousands of dockworker and seafaring families. Brahms' first audiences as a pianist were in the dockside pubs playing popular and folk music. Brahms went on to create sublime music that is often held up as the culmination of Western classical music.<br /><br />
      
      We are honoured to bring the "wondrous glimpses of the secret world of spirits" in Brahms' music, and the first complete Brahms chamber works cycle, to the residents of Limehouse and the wider Docklands area.
    </div>
	<Link className="schedule-link" to="/schedule">View Event Schedule</Link>
	<div className="club-description">
    <br />
	Contact: contact@brahmsclub.org
    </div>
  </>
);

function Landing() {
  const [showImage, setShowImage] = useState(false);
  const [showBottomText, setShowBottomText] = useState(false);

  useEffect(() => {
    // Show image after 2s, fade out text, then move text to bottom
    const timer1 = setTimeout(() => setShowImage(true), 2000);
    const timer2 = setTimeout(() => setShowBottomText(true), 4000);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  return (
    <ResponsiveContainer>
      <div className="landing-root">
        <FadeInImage
          src="/images/wanderer.jpg"
          alt="Wanderer above the Sea of Fog"
          fadeIn={showImage}
        />
        {!showBottomText ? (
          <div className="cover-text">
            {initialQuote}
          </div>
        ) : (
          <div className="cover-text-bottom">
            {initialQuote}
          </div>
        )}
        {showBottomText && (
          <div className="landing-content">
            {description}
          </div>
        )}
      </div>
    </ResponsiveContainer>
  );
}

export default Landing;