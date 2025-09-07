import React from "react";

function ResponsiveContainer({ children }) {
  return (
    <div className="responsive-container">
      {children}
    </div>
  );
}

export default ResponsiveContainer;