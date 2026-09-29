export function SlidingNumber({ value, padStart = false, locale }) {
  const safeValue = Math.max(0, Math.trunc(value));
  const digits = String(safeValue);
  const ungroupedValue = padStart ? digits.padStart(2, "0") : digits;
  const displayValue = locale ? safeValue.toLocaleString(locale) : ungroupedValue;
  const digitCount = displayValue.replace(/\D/g, "").length;
  let digitIndex = 0;

  return (
    <span aria-label={displayValue} style={{ display: "inline-flex", height: "1em", lineHeight: 1, overflow: "hidden", verticalAlign: "middle" }}>
      {displayValue.split("").map((digit, index) => {
        if (!/\d/.test(digit)) {
          return <span key={`separator-${index}`} aria-hidden="true" style={{ width: "0.3em" }}>{digit}</span>;
        }

        const place = 10 ** (digitCount - digitIndex - 1);
        const position = Math.floor(safeValue / place);
        const rowCount = Math.max(20, position + 10);
        digitIndex += 1;

        return (
          <span key={`${index}-${displayValue.length}`} aria-hidden="true" style={{ display: "inline-block", width: "0.62em", height: "1em", overflow: "hidden" }}>
            <span
              style={{
                display: "flex",
                flexDirection: "column",
                transform: `translateY(-${position}em)`,
                transition: "transform 450ms cubic-bezier(0.2, 0.8, 0.2, 1)",
              }}
            >
              {Array.from({ length: rowCount }, (_, row) => (
                <span key={row} style={{ height: "1em", flex: "0 0 1em" }}>{row % 10}</span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}