// Promo video only: SubSweep's panel uses a closed shadow root; open it so the recorder
// can find the panel's buttons and point the cursor at them. Load before the content scripts.
(() => {
  const attachShadow = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function (init) {
    return attachShadow.call(this, { ...init, mode: 'open' });
  };
})();
