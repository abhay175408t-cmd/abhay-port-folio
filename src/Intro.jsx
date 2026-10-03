/*!
  ABHAY BUILDS — intro / opening preloader.

  A full-screen overlay that plays once when the site loads, then hands the
  screen back to the existing website, which is left exactly as it is.

  One gsap.timeline drives the whole sequence. Positions are built with labels
  rather than numbers, so the order reads top to bottom and no step depends on
  a hardcoded timeline time:

    0. SETUP   — the frame is forced to width 0 / scaleX 0 / opacity 0 so the
                 image is provably invisible before anything animates.
    1. REVEAL — "ABHAY BUILDS" rises letter by letter from below its mask,
                 staggered left to right, with no gap between the words.
                 Split by lib/splitText.js (vanilla; GSAP's SplitText is paid).
    2. SPLIT  — the frame unfolds from zero width while the halves are pushed
                 apart. One tween: see THE FRAMING TRICK in intro.css.
    3. HOLD   — the framed first image stays for exactly IMAGE_HOLD (0.9s).
    4. FLASH  — IMAGES[1..] replace it in the same container, fast, on a beat.
    5. EXIT   — the overlay slides up and scroll is handed back.

  The push distance is never hand-tuned. The two halves are flex items with an
  identical `flex: 1 1 0` basis and the frame is the only sized item in the
  row, so widening the frame to the image's width lands both halves exactly on
  the image's edges at any viewport size. Nothing to measure, nothing to
  recompute on resize.

  To use your own images: replace IMAGES below. Uniform dimensions keep the
  crop consistent; any 3:2 or 16:10 landscape source works.
*/

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gsap, prefersReducedMotion } from './lib/motion';
import { splitText } from './lib/splitText';
import { lockScroll, unlockScroll, getLenis, refreshScroll } from './lib/scroll';
import './intro.css';

/** The name, cut at the split point. Reads as one line before the split. */
const NAME_LEFT = 'ABHAY';
const NAME_RIGHT = 'BUILDS';

/** Placeholder frames — swap for your own work. First one gets the long hold. */
const IMAGES = [
  'https://picsum.photos/seed/abhay-01/1200/800',
  'https://picsum.photos/seed/abhay-02/1200/800',
  'https://picsum.photos/seed/abhay-03/1200/800',
  'https://picsum.photos/seed/abhay-04/1200/800',
  'https://picsum.photos/seed/abhay-05/1200/800',
  'https://picsum.photos/seed/abhay-06/1200/800',
];

const REVEAL_STAGGER = 0.026; // s between letters
const SPLIT_DURATION = 1.1;    // s for the unfold and the push
const IMAGE_HOLD = 0.9;        // s the first image stays, per spec
const FLASH_IN = 0.22;         // s for each rapid swap
const FLASH_BEAT = 0.16;       // s pause between swaps
const EXIT_DURATION = 1.05;    // s for the overlay to leave

const FONTS_TIMEOUT = 1500;    // ms cap on waiting for webfonts
const IMAGES_TIMEOUT = 2500;   // ms cap on preloading, so a bad CDN cannot
                               // hold the page hostage

/** Resolves after `ms`, so a stalled request can never block the sequence. */
function wait(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

/**
 * Decode the frames up front so each `src` swap mid-sequence is instant —
 * otherwise every flash would show an empty frame while the request lands.
 */
function preloadImages(urls) {
  return Promise.all(
    urls.map(
      (src) =>
        new Promise((resolve) => {
          const image = new Image();
          image.onload = resolve;
          image.onerror = resolve; // a missing frame must not stall the intro
          image.src = src;
        }),
    ),
  );
}

export default function Intro() {
  const rootRef = useRef(null);
  const [isComplete, setIsComplete] = useState(() => prefersReducedMotion());

  // Lock before the first paint. A layout effect runs after the DOM is
  // committed but before anything is visible, so the page cannot be scrolled
  // out from under the overlay even on a fast first flick.
  useLayoutEffect(() => {
    if (!prefersReducedMotion()) lockScroll();
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (isComplete || !root) return undefined;

    let cancelled = false;
    let done = false;
    let ctx = null;
    const splits = [];

    const finish = () => {
      if (done) return;
      done = true;
      // Overlay is fully off-screen by now, so the page can be handed back.
      unlockScroll();
      // Trigger positions were computed against a locked, unrefreshed page.
      refreshScroll();
      getLenis()?.resize();
      setIsComplete(true);
    };

    const run = async () => {
      // Measure only once the real font metrics are in, or the letter masks are
      // measured against fallback font boxes.
      await Promise.race([document.fonts?.ready ?? Promise.resolve(), wait(FONTS_TIMEOUT)]);
      if (cancelled) return;

      // Re-checked here, not just at mount: the setting can change mid-load.
      if (prefersReducedMotion()) {
        finish();
        return;
      }

      await Promise.race([preloadImages(IMAGES), wait(IMAGES_TIMEOUT)]);
      if (cancelled) return;

      const figure = root.querySelector('.preloader__figure');
      const img = root.querySelector('.preloader__img');
      const nameEl = root.querySelector('.preloader__name');
      const meta = root.querySelector('.preloader__meta');

      if (!figure || !img || !nameEl) {
        finish();
        return;
      }

      // aria-label on the whole overlay already hides it from assistive tech,
      // so the splitter does not need to label the name as well.
      splits.push(splitText(nameEl, { ariaLabel: false }));
      const chars = splits[0].chars;

      // The img is laid out at the frame's full width even while the frame is
      // collapsed, and offsetWidth ignores transforms — so this is the exact,
      // resolved end point for the unfold, with no duplicate size to maintain.
      const figureWidth = img.offsetWidth;

      ctx = gsap.context(() => {
        // ==========================================
        // 0 — INITIAL STATE
        // ==========================================
        // Stated explicitly rather than trusted from CSS, so the animation and
        // the stylesheet can never disagree about where the sequence starts.
        gsap.set(figure, { width: 0, scaleX: 0, opacity: 0 });
        gsap.set(chars, { yPercent: 118 });
        gsap.set(img, { scale: 1.3 });
        if (meta) gsap.set(meta, { opacity: 0, y: 8 });

        const tl = gsap.timeline({ onComplete: finish });

        // ==========================================
        // 1 — NAME REVEAL (bottom-up, left to right)
        // ==========================================
        // The frame is still width 0 here, so the two halves meet with no gap
        // and no slice: the name reads as one continuous line.

        tl.fromTo(
          chars,
          { yPercent: 118 },
          {
            yPercent: 0,
            duration: 1.1,
            ease: 'expo.out',
            stagger: { each: REVEAL_STAGGER, from: 'start' },
          },
        );
        if (meta) tl.to(meta, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }, '<0.4');

        // ==========================================
        // 2 — SPLIT + IMAGE UNFOLD (one tween)
        // ==========================================
        // `width` is the driver, because width is what the flex row pushes the
        // halves with — animating scaleX instead would make the visible image
        // narrower than the gap the text is framing. scaleX and opacity are
        // brought to 1 well ahead of width so the aperture tracks the box
        // closely instead of trailing it.
        tl.fromTo(
          figure,
          { width: 0, scaleX: 0, opacity: 0 },
          {
            width: figureWidth,
            duration: SPLIT_DURATION,
            ease: 'power4.inOut',
            scaleX: 1,
            opacity: 1,
          },
          '+=0.2',
        );

        // ==========================================
        // 3 — THE HOLD: exactly IMAGE_HOLD seconds
        // ==========================================
        // Must sit *between* the unfold and the overscale, and is positioned
        // with '>' ("end of the previous animation") — the supported way to mark
        // "when the unfold finished".
        //
        // It deliberately avoids two traps, both of which measured the hold at
        // ~2.5s instead of 0.9s:
        // - The default position is the end of the *timeline* (the latest end of
        //   any child), and the overscale below intentionally outruns the
        //   unfold by 0.5s. That lands 'settled' 1.6s late.
        // - Computing the anchor as tween.startTime() + tween.duration(). On an
        //   un-rendered timeline startTime() reports the parent's end-of-
        //   timeline rather than the tween's own start, so it produced the same
        //   1.6s error.
        tl.addLabel('settled', '>');
        // A label advances the playhead without animating anything, which is
        // exactly what "hold still for 0.9s" means.
        tl.addLabel('flash', `settled+=${IMAGE_HOLD}`);

        // Overscale settles as the frame opens, for depth. '< still resolves to
        // the unfold's start: a label is not an animation, so the last animation
        // the timeline tracks is unchanged.
        tl.to(img, { scale: 1, duration: SPLIT_DURATION + 0.5, ease: 'expo.out' }, '<');

        // ==========================================
        // 4 — RAPID IMAGE SEQUENCE (same container)
        // ==========================================
        // The first swap is pinned to the 'flash' label and the rest chain off
        // it position-less. That has to be explicit: addLabel() does NOT extend
        // a timeline's duration, so a position-less tween here would land back
        // at the previous playhead and swallow the hold entirely.
        IMAGES.slice(1).forEach((src, index) => {
          const at = index === 0 ? 'flash' : undefined;

          tl.set(img, { attr: { src } }, at).fromTo(
            img,
            { scale: 1.22, opacity: 0.4 },
            {
              scale: 1,
              opacity: 1,
              duration: FLASH_IN,
              ease: 'power2.out',
              // fromTo() renders its "from" values the instant it is created,
              // so without this every flash stamps scale and opacity over the
              // unfold long before its turn in the sequence.
              immediateRender: false,
            },
            at,
          )
            // Property-less tween: a pure time gap, so the frames read as
            // separate beats instead of one continuous blur.
            .to(img, { duration: FLASH_BEAT });
        });

        // ==========================================
        // 5 — EXIT
        // ==========================================
        tl.addLabel('exit')
          .to(img, { scale: 1.1, duration: EXIT_DURATION, ease: 'power2.in' }, 'exit')
          .to(figure, { width: 0, duration: EXIT_DURATION, ease: 'power3.in' }, 'exit');
        if (meta) tl.to(meta, { opacity: 0, duration: 0.3 }, 'exit');

        // Last, so the timeline ends exactly when the screen is clear.
        tl.to(
          root,
          { yPercent: -100, duration: EXIT_DURATION, ease: 'expo.inOut' },
          'exit+=0.12',
        );
      }, root);
    };

    run().catch(() => {
      // Without this, anything thrown above (a missing node, a splitter edge
      // case) rejects silently and strands the visitor behind an overlay that
      // never goes away, with scrolling still locked. Fails open instead.
      finish();
    });

    return () => {
      cancelled = true;
      // Kills the timeline and strips every inline style GSAP added.
      ctx?.revert();
      splits.forEach((split) => split.revert());
      // Release the lock, but do NOT finish(): a StrictMode remount runs this
      // cleanup before the second effect, and completing here would mark the
      // intro permanently done before it ever played.
      unlockScroll();
    };
  }, [isComplete]);

  if (isComplete) return null;

  return (
    <div className="preloader" ref={rootRef} aria-hidden="true">
      <div className="preloader__stage">
        <h1 className="preloader__name">
          <span className="preloader__half preloader__half--left">{NAME_LEFT}</span>

          {/*
            The frame is the only sized item between the halves, so widening it
            is what pushes them apart. It starts collapsed, which is why the
            name reads as one line before the split.
          */}
          <figure className="preloader__figure">
            {/* Decorative: the overlay is aria-hidden, so no alt is needed. */}
            <img className="preloader__img" src={IMAGES[0]} alt="" decoding="async" />
          </figure>

          <span className="preloader__half preloader__half--right">{NAME_RIGHT}</span>
        </h1>
      </div>

      <p className="preloader__meta">Portfolio — 2026</p>
    </div>
  );
}