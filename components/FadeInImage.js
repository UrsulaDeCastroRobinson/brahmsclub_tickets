import React from "react";

function FadeInImage({ src, alt, fadeIn }) {
  return (
    <div
      className={`fade-image-bg${fadeIn ? " fade-in" : ""}`}
      style={{
        backgroundImage: `url(${src})`
      }}
      aria-label={alt}
      role="img"
    ></div>
  );
}

export default FadeInImage;