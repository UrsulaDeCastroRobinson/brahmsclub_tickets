import React, { useEffect, useState } from "react";
import FadeInImage from "../components/FadeInImage";
import ResponsiveContainer from "../components/ResponsiveContainer";
import Link from "next/link";

const initialQuote = "'My voice - it's becoming majestic.'";

const description = (
  <>
    <h1 className="club-title">Brahms Club</h1>
    <h2 className="club-subtitle">
      This season the Brahms Club will present the complete chamber works of the Great Man: Johannes Brahms. The concerts are free and in Limehouse historic buildings every Sunday from November through December and March through May. 
    </h2>
    <div className="club-description">
      Brahms grew up in the Gängeviertel district of Hamburg; a docklands district with a bustling residential and entertainment area for thousands of dockworker and seafaring families. Brahms' first audiences as a pianist were in the dockside pubs playing popular music. Brahms went on to create sublime music that has been described as providing "wondrous glimpses of the secret world of spirits" .<br /><br />
      
      We are honoured to bring the first complete Brahms chamber works cycle to the residents of Limehouse and the wider Docklands area with generous support of The Royal Foundation of St Katherine.
    </div>
    <Link className="schedule-link" href="/schedule">View Event Schedule</Link>
    <div className="club-description">
      <br />
      Contact: contact@brahmsclub.org
    </div>
	</>
);

export default function Landing() {
  const [showImage, setShowImage] = useState(false);
  const [showBottomText, setShowBottomText] = useState(false);

  useEffect(() => {
    const timer1 = setTimeout(() => setShowImage(true), 2000);
    const timer2 = setTimeout(() => setShowBottomText(true), 4000);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  return (
    <ResponsiveContainer>
       <div className={`landing-root${!showImage ? " landing-black-bg" : ""}`}>
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