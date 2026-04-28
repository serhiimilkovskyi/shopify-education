import { Component } from '@theme/component';
import { fetchConfig } from '@theme/utilities';
import { CartAddEvent, CartErrorEvent } from '@theme/events';

/**
 * Collects section IDs for every cart-items-component (drawer + cart page) so a single
 * Cart API response can hydrate them via the Section Rendering API.
 * @returns {string[]}
 */
function getCartItemSectionIds() {
  /** @type {string[]} */
  const ids = [];
  for (const el of document.querySelectorAll('cart-items-component')) {
    if (el instanceof HTMLElement && el.dataset.sectionId && !ids.includes(el.dataset.sectionId)) {
      ids.push(el.dataset.sectionId);
    }
  }
  return ids;
}

/**
 * @typedef {object} Refs
 * @property {HTMLButtonElement} button
 *
 * @extends {Component<Refs>}
 */
class CollectionQuickAddComponent extends Component {
  requiredRefs = ['button'];

  /**
   * Adds the card's variant with `sections` in the same request, then dispatches CartAddEvent
   * so cart-items-component morphs from `response.sections` without a follow-up section fetch.
   * @param {MouseEvent} event
   */
  handleClick(event) {
    event.preventDefault();

    const { button } = this.refs;
    if (button.disabled) return;

    const variantId = this.dataset.variantId;
    if (!variantId) return;

    const quantity = Math.max(1, parseInt(this.dataset.quantity || '1', 10) || 1);
    const sectionIds = getCartItemSectionIds();

    if (sectionIds.length === 0) {
      console.warn('collection-quick-add: no cart-items-component found; sections will not update');
    }

    button.disabled = true;

    /** @type {{ items: { id: number; quantity: number }[]; sections_url: string; sections?: string }} */
    const payload = {
      items: [{ id: Number(variantId), quantity }],
      sections_url: window.location.pathname,
    };
    if (sectionIds.length) {
      payload.sections = sectionIds.join(',');
    }

    const body = JSON.stringify(payload);

    fetch(Theme.routes.cart_add_url, fetchConfig('json', { body }))
      .then((response) => response.json())
      .then((data) => {
        if (data.status) {
          document.dispatchEvent(
            new CartErrorEvent(this.id || 'collection-quick-add', data.message, data.description, data.errors)
          );
          return;
        }

        const itemCount = typeof data.item_count === 'number' ? data.item_count : 0;

        document.dispatchEvent(
          new CartAddEvent(data, this.id || 'collection-quick-add', {
            source: 'collection-quick-add',
            itemCount,
            productId: this.dataset.productId,
            variantId,
            sections: data.sections,
          })
        );

        const drawer = /** @type {HTMLElement & { open?: () => void } | null} */ (
          document.querySelector('cart-drawer-component')
        );
        if (drawer && typeof drawer.open === 'function') {
          drawer.open();
        }
      })
      .catch((error) => {
        console.error(error);
      })
      .finally(() => {
        button.disabled = false;
      });
  }
}

if (!customElements.get('collection-quick-add-component')) {
  customElements.define('collection-quick-add-component', CollectionQuickAddComponent);
}
