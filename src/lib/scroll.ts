/** Scrolls the app back to the top, inside the phone frame on a computer or the page on a phone. */
export function scrollToTop() {
  document.querySelector('.shell')?.scrollTo(0, 0)
  window.scrollTo(0, 0)
}
