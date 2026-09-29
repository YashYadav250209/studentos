export function Tilt({ children, rotationFactor = 8, isRevese = false }) {
  function handlePointerMove(event) {
    if (event.pointerType === "touch" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const normalizedX = (event.clientX - bounds.left) / bounds.width;
    const normalizedY = (event.clientY - bounds.top) / bounds.height;
    const direction = isRevese ? -1 : 1;
    const rotateX = (0.5 - normalizedY) * 2 * rotationFactor * direction;
    const rotateY = (normalizedX - 0.5) * 2 * rotationFactor * direction;

    event.currentTarget.style.transition = "transform 100ms ease-out";
    event.currentTarget.style.transform = `perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
  }

  function handlePointerLeave(event) {
    event.currentTarget.style.transition = "transform 360ms cubic-bezier(0.2, 0.8, 0.2, 1)";
    event.currentTarget.style.transform = "perspective(900px) rotateX(0deg) rotateY(0deg)";
  }

  return (
    <div
      data-tilt="true"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={{ width: "100%", minWidth: 0, transform: "perspective(900px) rotateX(0deg) rotateY(0deg)" }}
    >
      {children}
    </div>
  );
}