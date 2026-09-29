import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

const INTERACTIVE_SELECTOR = "button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [role='button']:not([aria-disabled='true'])";

function findSpotlightTarget(target) {
  const element = target instanceof Element ? target : target?.parentElement;
  if (!element) return null;

  const interactive = element.closest(INTERACTIVE_SELECTOR);
  if (interactive) return interactive;

  let candidate = element;
  while (candidate && candidate !== document.body) {
    const bounds = candidate.getBoundingClientRect();
    if (bounds.width >= 96 && bounds.height >= 52) {
      const styles = window.getComputedStyle(candidate);
      const hasRoundedCorners = Number.parseFloat(styles.borderTopLeftRadius) >= 6;
      const hasBackground = styles.backgroundColor !== "transparent" && styles.backgroundColor !== "rgba(0, 0, 0, 0)";
      const hasBorder = Number.parseFloat(styles.borderTopWidth) > 0 && styles.borderTopStyle !== "none";
      if (hasRoundedCorners && (hasBackground || hasBorder)) return candidate;
    }
    candidate = candidate.parentElement;
  }

  return null;
}

function findTiltTarget(target) {
  const element = target instanceof Element ? target : target?.parentElement;
  if (!element || element.closest("[data-tilt='true']")) return null;

  let candidate = element;
  while (candidate && candidate !== document.body) {
    const bounds = candidate.getBoundingClientRect();
    const fitsCardBounds =
      bounds.width <= 900 &&
      bounds.height <= 800 &&
      bounds.width * bounds.height <= 480000 &&
      !(bounds.width >= window.innerWidth * 0.9 && bounds.height >= window.innerHeight * 0.9);
    if (bounds.width >= 96 && bounds.height >= 52 && fitsCardBounds) {
      const styles = window.getComputedStyle(candidate);
      const hasRoundedCorners = Number.parseFloat(styles.borderTopLeftRadius) >= 6;
      const hasBackground = styles.backgroundColor !== "transparent" && styles.backgroundColor !== "rgba(0, 0, 0, 0)";
      const hasBorder = Number.parseFloat(styles.borderTopWidth) > 0 && styles.borderTopStyle !== "none";
      if (hasRoundedCorners && (hasBackground || hasBorder)) return candidate;
    }
    candidate = candidate.parentElement;
  }

  return null;
}

export function SpotlightProvider({ children }) {
  const overlayRef = useRef(null);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return undefined;

    let activeTilt = null;
    const savedTiltStyles = new WeakMap();
    const tiltResetTimers = new WeakMap();
    let lastPointer = null;
    let isScrolling = false;
    let scrollTimeout = null;

    function getTiltStyles(element) {
      let savedStyles = savedTiltStyles.get(element);
      if (!savedStyles) {
        const styles = window.getComputedStyle(element);
        savedStyles = {
          originalTransform: element.style.transform,
          computedTransform: styles.transform === "none" ? "" : styles.transform,
          originalInlineTransition: element.style.transition,
          computedTransition: styles.transition,
          originalWillChange: element.style.willChange,
        };
        savedTiltStyles.set(element, savedStyles);
      }

      const resetTimeout = tiltResetTimers.get(element);
      if (resetTimeout) {
        window.clearTimeout(resetTimeout);
        tiltResetTimers.delete(element);
      }
      return savedStyles;
    }

    function resetTilt() {
      if (!activeTilt) return;

      const { element, styles: savedStyles } = activeTilt;
      activeTilt = null;
      element.style.transition = `${savedStyles.computedTransition}, transform 360ms cubic-bezier(0.2, 0.8, 0.2, 1)`;
      element.style.transform = savedStyles.originalTransform;

      const resetTimeout = window.setTimeout(() => {
        if (activeTilt?.element === element) return;
        element.style.transition = savedStyles.originalInlineTransition;
        element.style.willChange = savedStyles.originalWillChange;
        savedTiltStyles.delete(element);
        tiltResetTimers.delete(element);
      }, 360);
      tiltResetTimers.set(element, resetTimeout);
    }

    function hideSpotlight(immediate = false) {
      if (immediate) overlay.style.transition = "none";
      overlay.style.opacity = "0";
      resetTilt();
    }

    function updateSpotlight(event) {
      lastPointer = {
        clientX: event.clientX,
        clientY: event.clientY,
        pointerType: event.pointerType || "mouse",
      };
      if (isScrolling) return;

      const tiltTarget = event.pointerType === "touch" || window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? null
        : findTiltTarget(event.target);

      if (tiltTarget !== activeTilt?.element) {
        resetTilt();
        if (tiltTarget) activeTilt = { element: tiltTarget, styles: getTiltStyles(tiltTarget) };
      }

      if (tiltTarget && activeTilt) {
        const bounds = tiltTarget.getBoundingClientRect();
        const normalizedX = (event.clientX - bounds.left) / bounds.width;
        const normalizedY = (event.clientY - bounds.top) / bounds.height;
        const rotateX = (0.5 - normalizedY) * 16;
        const rotateY = (normalizedX - 0.5) * 16;
        const { computedTransform, computedTransition } = activeTilt.styles;
        const baseTransform = computedTransform ? `${computedTransform} ` : "";

        tiltTarget.style.transition = `${computedTransition}, transform 100ms ease-out`;
        tiltTarget.style.transform = `${baseTransform}perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
      }

      const target = findSpotlightTarget(event.target);
      if (!target) {
        hideSpotlight();
        return;
      }

      const bounds = target.getBoundingClientRect();
      const styles = window.getComputedStyle(target);
      const pointerX = event.clientX - bounds.left;
      const pointerY = event.clientY - bounds.top;

      overlay.style.transform = `translate3d(${bounds.left}px, ${bounds.top}px, 0)`;
      overlay.style.width = `${bounds.width}px`;
      overlay.style.height = `${bounds.height}px`;
      overlay.style.borderRadius = styles.borderRadius;
      overlay.style.background = `radial-gradient(124px circle at ${pointerX}px ${pointerY}px, rgba(59, 130, 246, 0.18), rgba(59, 130, 246, 0.06) 42%, transparent 78%)`;
      overlay.style.opacity = "1";
    }

    function handleScroll() {
      isScrolling = true;
      hideSpotlight(true);
      if (scrollTimeout !== null) window.clearTimeout(scrollTimeout);
      scrollTimeout = window.setTimeout(() => {
        scrollTimeout = null;
        isScrolling = false;
        overlay.style.transition = "opacity 160ms ease";
        if (!lastPointer) return;

        const target = document.elementFromPoint(lastPointer.clientX, lastPointer.clientY);
        if (target) updateSpotlight({ ...lastPointer, target });
      }, 140);
    }

    function handlePointerExit() {
      lastPointer = null;
      isScrolling = false;
      overlay.style.transition = "opacity 160ms ease";
      if (scrollTimeout !== null) {
        window.clearTimeout(scrollTimeout);
        scrollTimeout = null;
      }
      hideSpotlight();
    }

    document.addEventListener("pointermove", updateSpotlight, { passive: true });
    document.documentElement.addEventListener("pointerleave", handlePointerExit);
    window.addEventListener("blur", handlePointerExit);
    window.addEventListener("scroll", handleScroll, { capture: true, passive: true });
    window.addEventListener("wheel", handleScroll, { capture: true, passive: true });

    return () => {
      if (scrollTimeout !== null) window.clearTimeout(scrollTimeout);
      resetTilt();
      document.removeEventListener("pointermove", updateSpotlight);
      document.documentElement.removeEventListener("pointerleave", handlePointerExit);
      window.removeEventListener("blur", handlePointerExit);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("wheel", handleScroll, true);
    };
  }, []);

  return (
    <>
      {children}
      {createPortal(
        <div
          ref={overlayRef}
          aria-hidden="true"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            zIndex: 9999,
            pointerEvents: "none",
            opacity: 0,
            border: "1px solid rgba(126, 190, 255, 0.28)",
            boxShadow: "inset 0 0 22px rgba(59, 130, 246, 0.08)",
            mixBlendMode: "screen",
            transition: "opacity 160ms ease",
          }}
        />,
        document.body
      )}
    </>
  );
}