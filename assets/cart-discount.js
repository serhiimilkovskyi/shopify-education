import { Component } from '@theme/component';
import { morphSection } from '@theme/section-renderer';
import { DiscountUpdateEvent } from '@theme/events';
import { fetchConfig } from '@theme/utilities';
import { cartPerformance } from '@theme/performance';

const CART_DISCOUNT_CODES_UPDATE = `
  mutation cartDiscountCodesUpdate($cartId: ID!, $discountCodes: [String!]!) {
    cartDiscountCodesUpdate(cartId: $cartId, discountCodes: $discountCodes) {
      cart {
        id
        discountCodes {
          code
          applicable
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * @param {string} name
 * @returns {string | null}
 */
function getCookie(name) {
  const match = document.cookie.split('; ').find((row) => row.startsWith(name + '='));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : null;
}

/**
 * @param {string} cartId
 */
function setCartIdCookie(cartId) {
  const maxAge = 60 * 60 * 24 * 14;
  document.cookie = `cart_id=${encodeURIComponent(cartId)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

/**
 * A custom element that applies a discount to the cart.
 *
 * @typedef {Object} CartDiscountComponentRefs
 * @property {HTMLButtonElement} applyButton - The apply discount button.
 * @property {HTMLElement} cartDiscountError - The error element.
 * @property {HTMLElement} cartDiscountErrorDiscountCode - The discount code error element.
 * @property {HTMLElement} cartDiscountErrorShipping - The shipping error element.
 */

/**
 * @extends {Component<CartDiscountComponentRefs>}
 */
class CartDiscount extends Component {
  requiredRefs = ['cartDiscountError', 'cartDiscountErrorDiscountCode', 'cartDiscountErrorShipping'];

  /** @type {AbortController | null} */
  #activeFetch = null;

  #createAbortController() {
    if (this.#activeFetch) {
      this.#activeFetch.abort();
    }

    const abortController = new AbortController();
    this.#activeFetch = abortController;
    return abortController;
  }

  /**
   * @param {boolean} isLoading
   */
  #setApplyLoading(isLoading) {
    const { applyButton } = this.refs;
    if (!(applyButton instanceof HTMLButtonElement)) return;

    applyButton.disabled = isLoading;
    applyButton.classList.toggle('cart-discount__button--loading', isLoading);
    applyButton.setAttribute('aria-busy', String(isLoading));

    const input = this.querySelector('input[name="discount"]');
    if (input instanceof HTMLInputElement) {
      input.disabled = isLoading;
    }
  }

  /**
   * @returns {string | null}
   */
  #getCartId() {
    const cartToken = getCookie('cart') || this.dataset.cartToken;
    if (cartToken) {
      return `gid://shopify/Cart/${cartToken}`;
    }

    return getCookie('cart_id');
  }

  /**
   * @returns {string[]}
   */
  #getSectionsToUpdate() {
    /** @type {Set<string>} */
    const sections = new Set();

    if (typeof this.dataset.sectionId === 'string') {
      sections.add(this.dataset.sectionId);
    }

    document.querySelectorAll('cart-items-component').forEach((item) => {
      if (item instanceof HTMLElement && item.dataset.sectionId) {
        sections.add(item.dataset.sectionId);
      }
    });

    return Array.from(sections);
  }

  /**
   * @param {string} token
   * @param {string} query
   * @param {Record<string, unknown>} variables
   * @param {AbortSignal} signal
   */
  #getApiUrl() {
    return this.dataset.storefrontApiUrl || '/api/2024-10/graphql.json';
  }

  async #storefrontFetch(token, query, variables, signal) {
    const response = await fetch(this.#getApiUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': token,
      },
      body: JSON.stringify({ query, variables }),
      signal,
    });

    const json = await response.json();

    if (json.errors?.length) {
      throw new Error(json.errors[0].message || 'GraphQL request failed.');
    }

    return json;
  }

  /**
   * @param {string[]} discountCodes
   * @param {AbortSignal} signal
   * @returns {Promise<{ discountCodes: { code: string; applicable: boolean }[] }>}
   */
  async #updateDiscountCodesOnStorefront(discountCodes, signal) {
    const token = this.dataset.storefrontToken;
    const cartId = this.#getCartId();

    if (!token) throw new Error('Storefront API token is missing.');
    if (!cartId) throw new Error('Cart ID is missing.');

    const json = await this.#storefrontFetch(
      token,
      CART_DISCOUNT_CODES_UPDATE,
      { cartId, discountCodes },
      signal
    );

    const payload = json.data?.cartDiscountCodesUpdate;

    if (payload?.userErrors?.length) {
      throw new Error(payload.userErrors[0].message);
    }

    if (payload?.cart?.id) {
      setCartIdCookie(payload.cart.id);
    }

    return payload?.cart ?? { discountCodes: [] };
  }

  /**
   * @param {string[]} discountCodes
   * @param {AbortSignal} signal
   */
  async #syncCartSections(discountCodes, signal) {
    const sections = this.#getSectionsToUpdate();

    const config = fetchConfig('json', {
      body: JSON.stringify({
        discount: discountCodes.join(','),
        sections: sections.join(','),
        sections_url: window.location.pathname,
      }),
    });

    const response = await fetch(Theme.routes.cart_update_url, {
      ...config,
      signal,
    });

    return response.json();
  }

  /**
   * @param {object} data
   */
  #renderUpdatedSections(data) {
    document.dispatchEvent(new DiscountUpdateEvent(data, this.id));

    if (typeof this.dataset.sectionId === 'string' && data.sections?.[this.dataset.sectionId]) {
      morphSection(this.dataset.sectionId, data.sections[this.dataset.sectionId]);
    }
  }

  /**
   * Handles updates to the cart note.
   * @param {SubmitEvent} event - The submit event on our form.
   */
  applyDiscount = async (event) => {
    const { cartDiscountError, cartDiscountErrorDiscountCode, cartDiscountErrorShipping } = this.refs;

    event.preventDefault();
    event.stopPropagation();

    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;

    const discountCode = form.querySelector('input[name="discount"]');
    if (!(discountCode instanceof HTMLInputElement) || typeof this.dataset.sectionId !== 'string') return;

    const discountCodeValue = discountCode.value.trim();
    if (!discountCodeValue) return;

    const abortController = this.#createAbortController();

    try {
      const existingDiscounts = this.#existingDiscounts();
      if (existingDiscounts.includes(discountCodeValue)) return;

      this.#setApplyLoading(true);

      cartDiscountError.classList.add('hidden');
      cartDiscountErrorDiscountCode.classList.add('hidden');
      cartDiscountErrorShipping.classList.add('hidden');

      const updatedCodes = [...existingDiscounts, discountCodeValue];
      const storefrontCart = await this.#updateDiscountCodesOnStorefront(updatedCodes, abortController.signal);

      const appliedCode = storefrontCart.discountCodes?.find(
        (/** @type {{ code: string; applicable: boolean }} */ discount) =>
          discount.code.toLowerCase() === discountCodeValue.toLowerCase()
      );

      if (!appliedCode || appliedCode.applicable === false) {
        discountCode.value = '';
        this.#handleDiscountError('discount_code');
        return;
      }

      const data = await this.#syncCartSections(updatedCodes, abortController.signal);

      const newHtml = data.sections?.[this.dataset.sectionId];
      const parsedHtml = newHtml ? new DOMParser().parseFromString(newHtml, 'text/html') : null;
      const section = parsedHtml?.getElementById(`shopify-section-${this.dataset.sectionId}`);
      const discountPills = section?.querySelectorAll('.cart-discount__pill') || [];

      if (section) {
        const codes = Array.from(discountPills)
          .map((element) => (element instanceof HTMLLIElement ? element.dataset.discountCode : null))
          .filter(Boolean);

        if (
          codes.length === existingDiscounts.length &&
          codes.every((/** @type {string} */ code) => existingDiscounts.includes(code)) &&
          appliedCode.applicable === true
        ) {
          this.#handleDiscountError('shipping');
          discountCode.value = '';
          return;
        }
      }

      this.#renderUpdatedSections(data);
      discountCode.value = '';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      this.#handleDiscountError('discount_code');
    } finally {
      this.#setApplyLoading(false);
      this.#activeFetch = null;
      cartPerformance.measureFromEvent('discount-update:user-action', event);
    }
  };

  /**
   * Handles removing a discount from the cart.
   * @param {MouseEvent | KeyboardEvent} event - The mouse or keyboard event in our pill.
   */
  removeDiscount = async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (
      (event instanceof KeyboardEvent && event.key !== 'Enter') ||
      !(event instanceof MouseEvent) ||
      !(event.target instanceof HTMLElement) ||
      typeof this.dataset.sectionId !== 'string'
    ) {
      return;
    }

    const pill = event.target.closest('.cart-discount__pill');
    if (!(pill instanceof HTMLLIElement)) return;

    const discountCode = pill.dataset.discountCode;
    if (!discountCode) return;

    const existingDiscounts = this.#existingDiscounts();
    const index = existingDiscounts.indexOf(discountCode);
    if (index === -1) return;

    existingDiscounts.splice(index, 1);

    const abortController = this.#createAbortController();

    try {
      await this.#updateDiscountCodesOnStorefront(existingDiscounts, abortController.signal);
      const data = await this.#syncCartSections(existingDiscounts, abortController.signal);
      this.#renderUpdatedSections(data);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
    } finally {
      this.#activeFetch = null;
    }
  };

  /**
   * Handles the discount error.
   *
   * @param {'discount_code' | 'shipping'} type - The type of discount error.
   */
  #handleDiscountError(type) {
    const { cartDiscountError, cartDiscountErrorDiscountCode, cartDiscountErrorShipping } = this.refs;
    const target = type === 'discount_code' ? cartDiscountErrorDiscountCode : cartDiscountErrorShipping;
    cartDiscountError.classList.remove('hidden');
    target.classList.remove('hidden');
  }

  /**
   * Returns an array of existing discount codes.
   * @returns {string[]}
   */
  #existingDiscounts() {
    /** @type {string[]} */
    const discountCodes = [];
    const discountPills = this.querySelectorAll('.cart-discount__pill');
    for (const pill of discountPills) {
      if (pill instanceof HTMLLIElement && typeof pill.dataset.discountCode === 'string') {
        discountCodes.push(pill.dataset.discountCode);
      }
    }

    return discountCodes;
  }
}

if (!customElements.get('cart-discount-component')) {
  customElements.define('cart-discount-component', CartDiscount);
}
