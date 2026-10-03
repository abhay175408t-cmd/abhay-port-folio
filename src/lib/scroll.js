/*!
  Scroll engine — owns the Lenis instance and the single way to scroll.

  Anchor navigation goes through here so programmatic scrolls and user
  scrolling share one engine (no fighting over scroll position), and so the
  scroll-spy only ever has to observe real scroll events.

  Also the only place that locks and unlocks the page, which the intro overlay
  needs: Lenis is created by a later effect, so the lock is remembered as a
  flag and applied to whichever instance ends up existing.
*/

import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

let instance = null;
let offset = 0;
let locked = false;
let bodyOverflow = '';

/** Clearance for the fixed header when scrolling to a section. */
export function setScrollOffset(px) {
  offset = px;
}

/**
 * Freeze the page — used by the intro so a stray wheel gesture cannot scroll
 * the site out from under the overlay.
 *
 * The lock is remembered, not just applied: the intro mounts before
 * SmoothScroll, so Lenis usually does not exist yet when this is called. The
 * flag lets initSmoothScroll() stop the instance it creates.
 */
export function lockScroll() {
  if (locked) return;
  locked = true;
  bodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  instance?.stop();
}

export function unlockScroll() {
  if (!locked) return;
  locked = false;
  document.body.style.overflow = bodyOverflow;
  instance?.start();
}

export function isScrollLocked() {
  return locked;
}

export function getLenis() {
  return instance;
}

export function initSmoothScroll() {
  if (instance) return instance;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  instance = new Lenis({
    duration: reduced ? 0.01 : 1.05,
    // Exponential ease-out: fast pickup, long soft settle.
    easing: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    smoothWheel: !reduced,
    wheelMultiplier: 1,
    touchMultiplier: 1.6,
  });

  // Share GSAP's ticker so Lenis and ScrollTrigger run in the same frame.
  const raf = (time) => instance?.raf(time * 1000);
  gsap.ticker.add(raf);
  gsap.ticker.lagSmoothing(0);

  instance.__detach = () => {
    gsap.ticker.remove(raf);
    instance?.destroy();
    instance = null;
  };

  // A lock requested before Lenis existed applies to this instance too.
  if (locked) instance.stop();

  return instance;
}

export function destroySmoothScroll() {
  instance?.__detach?.();
  instance = null;
}

export function refreshScroll() {
  ScrollTrigger.refresh();
}

/**
 * Scroll to a section id, accounting for the fixed header.
 * Falls back to native scrolling when Lenis is unavailable or motion is
 * reduced, so the page is always navigable.
 */
export function scrollToSection(id, { focus = true } = {}) {
  const el = document.getElementById(id);
  if (!el) return;

  const top = el.getBoundingClientRect().top + window.scrollY - offset;

  if (instance && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    instance.scrollTo(top, { duration: 1.1 });
  } else {
    window.scrollTo({ top, behavior: 'auto' });
  }

  if (focus) {
    // Move keyboard focus without a second scroll jump.
    el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
  }
}
