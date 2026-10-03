/*!
  splitText — vanilla text splitter, the free SplitText alternative.

  GSAP's SplitText is a Club GreenSock plugin, so this does the only two
  things the intro sequence needs: wrap words and characters in spans, and
  give every character a clipping mask it can rise out of.

  Why the mask: a character moved to `yPercent: 100` is only invisible while
  something clips it. Each character therefore gets two elements:

    <span class="split-word">
      <span class="split-mask"><span class="split-char">A</span></span>
    </span>

  The mask carries `overflow: hidden` in CSS (see intro.css / typography.css),
  not here, so the same markup stays useful if the styles move.

  `revert()` restores the original innerHTML. React needs it: under StrictMode
  an effect mounts, unmounts and mounts again, so the DOM is rebuilt each time.

  @param {Element|string} target  element or selector to split in place.
  @param {object}        [options]
  @param {boolean}       [options.words=true]   wrap each word in a span.
  @param {boolean}       [options.mask=true]    give each char a clipping mask.
  @param {boolean}       [options.ariaLabel=true] label the container and hide
                                    the fragments, so screen readers still
                                    announce the phrase as one string.
  @returns {{chars: Element[], words: Element[], masks: Element[],
             text: string, revert: () => void}}
*/

const DEFAULTS = {
  words: true,
  mask: true,
  ariaLabel: true,
};

const WORD_CLASS = 'split-word';
const MASK_CLASS = 'split-mask';
const CHAR_CLASS = 'split-char';

export function splitText(target, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const el = typeof target === 'string' ? document.querySelector(target) : target;

  if (!el) return emptyResult();

  const originalHTML = el.innerHTML;
  const originalText = el.textContent ?? '';
  const hadAriaLabel = el.hasAttribute('aria-label');

  const chars = [];
  const words = [];
  const masks = [];

  // One element: a word, holding one mask per character.
  const buildWord = (text) => {
    const word = document.createElement('span');
    word.className = WORD_CLASS;
    words.push(word);

    // Array.from splits by code point, so emoji and accents stay intact.
    Array.from(text).forEach((glyph) => {
      const char = document.createElement('span');
      char.className = CHAR_CLASS;
      char.textContent = glyph;
      chars.push(char);

      if (!opts.mask) {
        word.appendChild(char);
        return;
      }
      const mask = document.createElement('span');
      mask.className = MASK_CLASS;
      mask.appendChild(char);
      masks.push(mask);
      word.appendChild(mask);
    });

    return word;
  };

  const charOnly = (text) => {
    const fragment = document.createDocumentFragment();
    Array.from(text).forEach((glyph) => {
      const char = document.createElement('span');
      char.className = CHAR_CLASS;
      char.textContent = glyph;
      chars.push(char);

      if (!opts.mask) {
        fragment.appendChild(char);
        return;
      }
      const mask = document.createElement('span');
      mask.className = MASK_CLASS;
      mask.appendChild(char);
      masks.push(mask);
      fragment.appendChild(mask);
    });
    return fragment;
  };

  // Only text nodes are rewritten, so inline markup (<em>, <span>, <a>) inside
  // the target survives untouched.
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    // Whitespace-only nodes are the gaps between words — left as they are, so
    // word spacing keeps working without extra margins.
    if (node.nodeValue?.trim()) textNodes.push(node);
  }

  textNodes.forEach((node) => {
    const fragment = document.createDocumentFragment();
    // Capturing the separator keeps the original word spacing verbatim.
    node.nodeValue.split(/(\s+)/).forEach((chunk) => {
      if (!chunk) return;
      if (!chunk.trim()) {
        fragment.appendChild(document.createTextNode(chunk));
        return;
      }
      fragment.appendChild(opts.words ? buildWord(chunk) : charOnly(chunk));
    });
    node.parentNode.replaceChild(fragment, node);
  });

  if (opts.ariaLabel) {
    el.setAttribute('aria-label', originalText.replace(/\s+/g, ' ').trim());
    masks.forEach((mask) => mask.setAttribute('aria-hidden', 'true'));
    words.forEach((word) => word.setAttribute('aria-hidden', 'true'));
  }

  return {
    chars,
    words,
    masks,
    text: originalText.replace(/\s+/g, ' ').trim(),
    revert() {
      el.innerHTML = originalHTML;
      if (opts.ariaLabel && !hadAriaLabel) el.removeAttribute('aria-label');
    },
  };
}

function emptyResult() {
  return { chars: [], words: [], masks: [], text: '', revert() {} };
}

export default splitText;