class RefreshTimeButton extends HTMLElement {
  constructor() {
    super();
    this.addEventListener("click", this.handleClick.bind(this));
  }

  async handleClick() {
    try {
      const { sectionId } = this.dataset;
      console.log("sectionId", sectionId);
      if (!sectionId) return;

      const response = await fetch(
        `${window.location.pathname}?section_id=${sectionId}&_=${Date.now()}`,
      );
      if (!response.ok) throw new Error("Failed to fetch section");

      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const newSection = doc.getElementById(`shopify-section-${sectionId}`);

      const newDate = newSection?.querySelector("[data-date-value]")?.textContent?.trim();
      const currentDateEl = this.querySelector("[data-date-value]");

      if (currentDateEl && newDate) {
        currentDateEl.textContent = newDate;
      }
    } catch (error) {
      console.error("Error refreshing section:", error);
    }
  }
};

customElements.define("date-refresh", RefreshTimeButton);