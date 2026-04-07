class DateRefresh extends HTMLElement {
  #controller = new AbortController();

  connectedCallback() {
    const button = this.querySelector("[data-refresh-button]");
    button?.addEventListener("click", this.#handleRefresh, { signal: this.#controller.signal });
  }

  disconnectedCallback() {
    this.#controller.abort();
  }

  #handleRefresh = async () => {
    const sectionId = this.dataset.sectionId;
    if (!sectionId) return;

    try {
      // Cache-buster query param so each click gets fresh Liquid "now" output
      const url = new URL(window.location.href);
      url.searchParams.set("section_id", sectionId);
      url.searchParams.set("_", Date.now().toString());

      const response = await fetch(url.toString());
      if (!response.ok) throw new Error(`Failed to fetch section: ${response.status}`);

      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const newSection = doc.getElementById(`shopify-section-${sectionId}`);
      const newDate = newSection?.querySelector("[data-date-value]")?.textContent?.trim();

      const currentDateEl = this.querySelector("[data-date-value]");
      if (currentDateEl && newDate) {
        currentDateEl.textContent = newDate;
      }
    } catch (error) {
      console.error("Date refresh failed", error);
    }
  };
}

if (!customElements.get("date-refresh")) {
  customElements.define("date-refresh", DateRefresh);
}
