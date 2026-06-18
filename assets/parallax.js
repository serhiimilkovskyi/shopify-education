import { Component } from '@theme/component';

/**
 * Parallax section with layered figures that move at different scroll speeds.
 *
 * @typedef {object} Refs
 * @property {HTMLElement[]} figures - The parallax figure elements.
 *
 * @extends Component<Refs>
 */
class ParallaxSection extends Component {
  requiredRefs = ['figures'];

  /** @type {(() => void) | null} */
  #onScroll = null;

  /** @type {number | null} */
  #rafId = null;

  connectedCallback() {
    super.connectedCallback();

    const enabled = this.dataset.parallaxEnabled === 'true';
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!enabled || prefersReducedMotion) return;

    this.#onScroll = () => {
      if (this.#rafId !== null) return;
      this.#rafId = requestAnimationFrame(() => {
        this.#rafId = null;
        this.#updateParallax();
      });
    };

    window.addEventListener('scroll', this.#onScroll, { passive: true });
    window.addEventListener('resize', this.#onScroll, { passive: true });
    this.#updateParallax();
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    if (this.#onScroll) {
      window.removeEventListener('scroll', this.#onScroll);
      window.removeEventListener('resize', this.#onScroll);
    }

    if (this.#rafId !== null) {
      cancelAnimationFrame(this.#rafId);
      this.#rafId = null;
    }
  }

  #updateParallax() {
    const { figures } = this.refs;
    const rect = this.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const sectionCenter = rect.top + rect.height / 2;
    const viewportCenter = viewportHeight / 2;
    const distanceFromCenter = sectionCenter - viewportCenter;

    for (const figure of figures) {
      const speed = Number(figure.dataset.speed) || 0.5;
      const offset = distanceFromCenter * speed * -0.35;
      figure.style.setProperty('--parallax-y', `${offset}px`);
    }
  }
}

if (!customElements.get('parallax-section')) {
  customElements.define('parallax-section', ParallaxSection);
}
