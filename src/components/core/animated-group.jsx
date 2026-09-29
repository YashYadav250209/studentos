import React, { Children, useEffect, useMemo, useState } from "react";

export function AnimatedGroup({ children, variants = {}, className, style, ...props }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setIsVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const containerConfig = useMemo(
    () => variants.container || { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.1 } } },
    [variants.container]
  );

  const itemConfig = useMemo(
    () => variants.item || {
      hidden: { opacity: 0, y: 40, filter: "blur(4px)" },
      visible: {
        opacity: 1,
        y: 0,
        filter: "blur(0px)",
        transition: { duration: 1.0, type: "spring", bounce: 0.3 },
      },
    },
    [variants.item]
  );

  const containerStyle = {
    opacity: isVisible ? (containerConfig.visible?.opacity ?? 1) : (containerConfig.hidden?.opacity ?? 0),
    transition: containerConfig.visible?.transition?.staggerChildren ? "opacity 0.2s ease" : "opacity 0.2s ease",
    ...(style || {}),
  };

  return (
    <div className={className} style={containerStyle} {...props}>
      {Children.toArray(children).map((child, index) => {
        if (!child) return null;

        const childHidden = itemConfig.hidden || {};
        const childVisible = itemConfig.visible || {};
        const delay = (containerConfig.visible?.transition?.staggerChildren ?? 0.1) * index;

        return (
          <div
            key={child.key ?? index}
            style={{
              opacity: isVisible ? (childVisible.opacity ?? 1) : (childHidden.opacity ?? 0),
              transform: isVisible ? `translateY(${childVisible.y ?? 0}px)` : `translateY(${childHidden.y ?? 40}px)`,
              filter: isVisible ? (childVisible.filter ?? "blur(0px)") : (childHidden.filter ?? "blur(0px)"),
              transition: `opacity 1s ease, transform 1s cubic-bezier(0.22, 1, 0.36, 1), filter 1s ease`,
              transitionDelay: `${delay}s`,
            }}
          >
            {child}
          </div>
        );
      })}
    </div>
  );
}
