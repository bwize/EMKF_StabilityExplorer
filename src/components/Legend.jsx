/** Reads directly off the same {min,max,color,label} breaks used to build the map renderer, so the legend can never drift out of sync with what's on the map. */
export default function Legend({ breaks, direction }) {
  if (!breaks || breaks.length === 0) return null;

  const hint =
    direction === "high"
      ? "Darker = higher value = more vulnerable"
      : direction === "low"
        ? "Darker = lower value = more vulnerable"
        : "Darker = higher value (no vulnerability judgment)";

  return (
    <div className="legend">
      {breaks.map((b, i) => (
        <div className="legend-row" key={i}>
          <span className="legend-swatch" style={{ backgroundColor: b.color }} />
          <span className="legend-label">{b.label}</span>
        </div>
      ))}
      <p className="legend-hint">{hint}</p>
    </div>
  );
}
