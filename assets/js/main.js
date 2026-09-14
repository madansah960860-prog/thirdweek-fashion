/* ==========================================================================
   HALDEN FIELD - shared behaviour
   Vanilla JS, no dependencies, no build step.
   Everything degrades gracefully: with JS disabled the pages remain readable,
   navigable and purchasable-by-phone.
   ========================================================================== */
(function () {
  "use strict";

  var STORAGE = {
    consent: "haldenfield_consent_v1",
    bag: "haldenfield_bag_v1"
  };
  var FREE_SHIP_THRESHOLD = 125; /* USD - stated on Shipping & Delivery page */
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Marks that scripting is available. Scroll-reveal styling is scoped to this
     class so that content is never hidden if the script fails to load. */
  document.documentElement.classList.add("js");

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function on(el, ev, fn) { if (el) el.addEventListener(ev, fn); }

  /* ----------------------------------------------------------------------
     Consent-aware storage.
     Only "essential" data (bag contents, consent record) is written before
     consent. Nothing is written for analytics or advertising until the user
     opts in through the banner.
     ---------------------------------------------------------------------- */
  function readJSON(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function writeJSON(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage blocked */ }
  }

  /* ======================================================================
     1. TOAST
     ====================================================================== */
  var toastEl = null;
  var toastTimer = null;
  function toast(message) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast";
      toastEl.setAttribute("role", "status");
      toastEl.setAttribute("aria-live", "polite");
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.classList.add("is-open");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toastEl.classList.remove("is-open"); }, 3200);
  }

  /* ======================================================================
     2. OVERLAY MANAGER (mobile nav, bag drawer, modals)
     ====================================================================== */
  var backdrop = null;
  var openPanel = null;
  var lastFocused = null;

  function ensureBackdrop() {
    if (backdrop) return backdrop;
    backdrop = document.createElement("div");
    backdrop.className = "backdrop";
    backdrop.setAttribute("hidden", "");
    document.body.appendChild(backdrop);
    on(backdrop, "click", closePanel);
    return backdrop;
  }

  function openPanelEl(el) {
    if (!el) return;
    lastFocused = document.activeElement;
    ensureBackdrop().removeAttribute("hidden");
    window.requestAnimationFrame(function () { backdrop.classList.add("is-open"); });
    el.classList.add("is-open");
    el.removeAttribute("aria-hidden");
    document.body.classList.add("is-locked");
    openPanel = el;
    var focusable = el.querySelector("button, [href], input, select, textarea");
    if (focusable) focusable.focus();
  }

  function closePanel() {
    if (!openPanel) return;
    openPanel.classList.remove("is-open");
    openPanel.setAttribute("aria-hidden", "true");
    if (backdrop) {
      backdrop.classList.remove("is-open");
      window.setTimeout(function () { if (backdrop) backdrop.setAttribute("hidden", ""); }, 260);
    }
    document.body.classList.remove("is-locked");
    var trigger = openPanel.__trigger;
    openPanel = null;
    if (trigger && document.contains(trigger)) { trigger.focus(); }
    else if (lastFocused && document.contains(lastFocused)) { lastFocused.focus(); }
  }

  on(document, "keydown", function (e) {
    if (e.key === "Escape") {
      if (openPanel) { closePanel(); return; }
      var modal = $(".modal.is-open");
      if (modal) closeModal(modal);
    }
    /* Simple focus containment for open side panels */
    if (e.key === "Tab" && openPanel) {
      var items = $$('a[href], button:not([disabled]), input, select, textarea', openPanel)
        .filter(function (n) { return n.offsetParent !== null; });
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* ======================================================================
     3. HEADER: mobile nav + sticky state
     ====================================================================== */
  function initHeader() {
    var toggle = $(".nav-toggle");
    var mobileNav = $("#mobile-nav");
    if (toggle && mobileNav) {
      mobileNav.__trigger = toggle;
      on(toggle, "click", function () {
        if (mobileNav.classList.contains("is-open")) { closePanel(); }
        else { openPanelEl(mobileNav); toggle.setAttribute("aria-expanded", "true"); }
      });
      $$(".drawer-close", mobileNav).forEach(function (btn) { on(btn, "click", closePanel); });
      var observer = new MutationObserver(function () {
        toggle.setAttribute("aria-expanded", mobileNav.classList.contains("is-open") ? "true" : "false");
      });
      observer.observe(mobileNav, { attributes: true, attributeFilter: ["class"] });
    }

    var header = $(".site-header");
    if (header && "IntersectionObserver" in window) {
      var sentinel = document.createElement("div");
      sentinel.style.cssText = "position:absolute;top:0;left:0;height:1px;width:1px;";
      document.body.insertBefore(sentinel, document.body.firstChild);
      new IntersectionObserver(function (entries) {
        header.classList.toggle("is-stuck", !entries[0].isIntersecting);
      }).observe(sentinel);
    }
  }

  /* ======================================================================
     4. SCROLL REVEAL - slides in from an angle, disabled under reduced motion
     ====================================================================== */
  function initReveal() {
    var items = $$(".reveal");
    if (!items.length) return;
    if (reduceMotion || !("IntersectionObserver" in window)) {
      items.forEach(function (el) { el.classList.add("is-in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    items.forEach(function (el, i) {
      el.style.transitionDelay = Math.min(i % 6, 5) * 45 + "ms";
      io.observe(el);
    });
  }

  /* ======================================================================
     5. BACK TO TOP
     ====================================================================== */
  function initBackToTop() {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "to-top";
    btn.setAttribute("aria-label", "Back to top of page");
    btn.innerHTML = '<span aria-hidden="true">&#9650;</span>';
    document.body.appendChild(btn);
    on(btn, "click", function () {
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
      var skip = $(".skip-link");
      if (skip) skip.focus();
    });
    if ("IntersectionObserver" in window) {
      var mark = document.createElement("div");
      mark.style.cssText = "position:absolute;top:700px;left:0;height:1px;width:1px;";
      document.body.appendChild(mark);
      new IntersectionObserver(function (entries) {
        btn.classList.toggle("is-visible", !entries[0].isIntersecting);
      }).observe(mark);
    } else {
      btn.classList.add("is-visible");
    }
  }

  /* ======================================================================
     6. COOKIE CONSENT
     Accept / Reject / Manage preferences. No non-essential cookies or
     third-party scripts load until an explicit choice is stored.
     ====================================================================== */
  function getConsent() { return readJSON(STORAGE.consent, null); }

  function saveConsent(prefs) {
    prefs.timestamp = new Date().toISOString();
    prefs.version = 1;
    writeJSON(STORAGE.consent, prefs);
    applyConsent(prefs);
  }

  function applyConsent(prefs) {
    /* Hook for tag loading. Nothing is injected unless the user opted in.
       Replace the console notices with real vendor snippets before launch. */
    if (prefs.analytics) {
      document.documentElement.setAttribute("data-consent-analytics", "granted");
    }
    if (prefs.advertising) {
      document.documentElement.setAttribute("data-consent-ads", "granted");
    }
  }

  function initConsent() {
    var banner = $("#cookie-banner");
    var modal = $("#cookie-prefs");
    if (!banner) return;

    var stored = getConsent();
    if (stored) {
      applyConsent(stored);
    } else {
      /* Delayed so it never blocks first paint or shifts layout of the fold */
      window.setTimeout(function () { banner.classList.add("is-open"); }, 900);
    }

    function dismiss() { banner.classList.remove("is-open"); }

    on($("#cookie-accept"), "click", function () {
      saveConsent({ essential: true, analytics: true, advertising: true });
      dismiss();
      toast("Preferences saved. Thanks.");
    });
    on($("#cookie-reject"), "click", function () {
      saveConsent({ essential: true, analytics: false, advertising: false });
      dismiss();
      toast("Only essential cookies will be used.");
    });
    on($("#cookie-manage"), "click", function () { openModal(modal); });

    $$('[data-open-cookie-prefs]').forEach(function (link) {
      on(link, "click", function (e) { e.preventDefault(); openModal(modal); });
    });

    if (modal) {
      var analytics = $("#pref-analytics", modal);
      var ads = $("#pref-ads", modal);
      if (stored) {
        if (analytics) analytics.checked = !!stored.analytics;
        if (ads) ads.checked = !!stored.advertising;
      }
      on($("#cookie-save", modal), "click", function () {
        saveConsent({
          essential: true,
          analytics: analytics ? analytics.checked : false,
          advertising: ads ? ads.checked : false
        });
        closeModal(modal);
        dismiss();
        toast("Cookie preferences saved.");
      });
      $$("[data-close-modal]", modal).forEach(function (btn) {
        on(btn, "click", function () { closeModal(modal); });
      });
    }
  }

  function openModal(modal) {
    if (!modal) return;
    lastFocused = document.activeElement;
    ensureBackdrop().removeAttribute("hidden");
    window.requestAnimationFrame(function () { backdrop.classList.add("is-open"); });
    modal.classList.add("is-open");
    modal.removeAttribute("aria-hidden");
    document.body.classList.add("is-locked");
    var f = modal.querySelector("button, input, a[href]");
    if (f) f.focus();
    backdrop.onclick = function () { closeModal(modal); };
  }
  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    if (backdrop) {
      backdrop.classList.remove("is-open");
      backdrop.onclick = closePanel;
      window.setTimeout(function () { if (backdrop && !openPanel) backdrop.setAttribute("hidden", ""); }, 260);
    }
    document.body.classList.remove("is-locked");
    if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
  }

  /* ======================================================================
     7. ACCORDIONS (FAQ, product details, shipping tables)
     ====================================================================== */
  function initAccordions() {
    $$(".acc__btn").forEach(function (btn) {
      var panel = document.getElementById(btn.getAttribute("aria-controls"));
      if (!panel) return;
      on(btn, "click", function () {
        var open = btn.getAttribute("aria-expanded") === "true";
        btn.setAttribute("aria-expanded", open ? "false" : "true");
        panel.classList.toggle("is-open", !open);
      });
    });
  }

  /* ======================================================================
     8. PRODUCT FILTERING + SORT (Shop All, category pages, new arrivals)
     Cards are real HTML; JS only hides/sorts them, so the page works
     without JS and stays crawlable.
     ====================================================================== */
  function initFilters() {
    var grid = $("[data-product-grid]");
    if (!grid) return;

    var cards = $$("[data-product]", grid);
    var countEl = $("[data-result-count]");
    var emptyEl = $("[data-empty-state]");
    var sortSel = $("[data-sort]");
    var searchInput = $("[data-product-search]");
    var chips = $$("[data-filter]");
    var clearBtn = $("[data-clear-filters]");

    var state = { category: "all", size: "all", price: "all", q: "" };

    function priceOf(card) { return parseFloat(card.getAttribute("data-price")) || 0; }

    function matches(card) {
      if (state.category !== "all" && card.getAttribute("data-category") !== state.category) return false;
      if (state.size !== "all") {
        var sizes = (card.getAttribute("data-sizes") || "").split(",");
        if (sizes.indexOf(state.size) === -1) return false;
      }
      if (state.price !== "all") {
        var p = priceOf(card);
        if (state.price === "under100" && p >= 100) return false;
        if (state.price === "100to200" && (p < 100 || p > 200)) return false;
        if (state.price === "over200" && p <= 200) return false;
      }
      if (state.q) {
        var hay = (card.getAttribute("data-name") + " " + card.getAttribute("data-category") + " " + (card.getAttribute("data-keywords") || "")).toLowerCase();
        if (hay.indexOf(state.q) === -1) return false;
      }
      return true;
    }

    function apply() {
      var visible = 0;
      cards.forEach(function (card) {
        var ok = matches(card);
        card.hidden = !ok;
        if (ok) visible++;
      });
      if (countEl) {
        countEl.textContent = visible === 1 ? "1 style" : visible + " styles";
      }
      if (emptyEl) emptyEl.hidden = visible !== 0;
    }

    function sort(mode) {
      var arr = cards.slice();
      if (mode === "price-asc") arr.sort(function (a, b) { return priceOf(a) - priceOf(b); });
      else if (mode === "price-desc") arr.sort(function (a, b) { return priceOf(b) - priceOf(a); });
      else if (mode === "name") arr.sort(function (a, b) { return a.getAttribute("data-name").localeCompare(b.getAttribute("data-name")); });
      else arr.sort(function (a, b) { return (parseInt(a.getAttribute("data-order"), 10) || 0) - (parseInt(b.getAttribute("data-order"), 10) || 0); });
      arr.forEach(function (card) { grid.appendChild(card); });
    }

    chips.forEach(function (chip) {
      on(chip, "click", function () {
        var group = chip.getAttribute("data-filter");
        var value = chip.getAttribute("data-value");
        state[group] = state[group] === value ? "all" : value;
        $$('[data-filter="' + group + '"]').forEach(function (c) {
          c.setAttribute("aria-pressed", c.getAttribute("data-value") === state[group] ? "true" : "false");
        });
        apply();
      });
    });

    on(sortSel, "change", function () { sort(sortSel.value); });

    if (searchInput) {
      var t;
      on(searchInput, "input", function () {
        window.clearTimeout(t);
        t = window.setTimeout(function () {
          state.q = searchInput.value.trim().toLowerCase();
          apply();
        }, 180);
      });
    }

    on(clearBtn, "click", function () {
      state = { category: "all", size: "all", price: "all", q: "" };
      chips.forEach(function (c) { c.setAttribute("aria-pressed", "false"); });
      if (searchInput) searchInput.value = "";
      if (sortSel) { sortSel.value = "featured"; sort("featured"); }
      apply();
    });

    /* Deep link support: shop.html?category=outerwear */
    var params = new URLSearchParams(window.location.search);
    var initialCat = params.get("category");
    if (initialCat) {
      var chip = $('[data-filter="category"][data-value="' + initialCat + '"]');
      if (chip) chip.click();
    } else {
      apply();
    }
  }

  /* ======================================================================
     9. PRODUCT GALLERY
     ====================================================================== */
  function initGallery() {
    var main = $("[data-gallery-main]");
    if (!main) return;
    $$("[data-gallery-thumb]").forEach(function (btn) {
      on(btn, "click", function () {
        var img = $("img", btn);
        main.src = btn.getAttribute("data-full") || img.src;
        main.alt = btn.getAttribute("data-alt") || img.alt;
        $$("[data-gallery-thumb]").forEach(function (b) { b.setAttribute("aria-current", "false"); });
        btn.setAttribute("aria-current", "true");
      });
    });
  }

  /* ======================================================================
     10. SIZE / OPTION PICKERS
     ====================================================================== */
  function initPickers() {
    $$("[data-picker]").forEach(function (group) {
      var out = $("[data-picker-value='" + group.getAttribute("data-picker") + "']");
      $$("button", group).forEach(function (btn) {
        if (btn.disabled) return;
        on(btn, "click", function () {
          $$("button", group).forEach(function (b) { b.setAttribute("aria-pressed", "false"); });
          btn.setAttribute("aria-pressed", "true");
          if (out) out.textContent = btn.getAttribute("data-value") || btn.textContent.trim();
        });
      });
    });
  }

  /* ======================================================================
     11. BAG (essential functional storage, not tracking)
     ====================================================================== */
  function getBag() { return readJSON(STORAGE.bag, []); }
  function setBag(bag) { writeJSON(STORAGE.bag, bag); renderBag(); }

  function bagCount(bag) {
    return bag.reduce(function (n, l) { return n + l.qty; }, 0);
  }
  function bagTotal(bag) {
    return bag.reduce(function (n, l) { return n + (l.price * l.qty); }, 0);
  }

  function renderBag() {
    var bag = getBag();
    var count = bagCount(bag);
    $$("[data-bag-count]").forEach(function (el) {
      el.textContent = count;
      el.hidden = count === 0;
    });

    var body = $("[data-bag-lines]");
    if (body) {
      if (!bag.length) {
        body.innerHTML = '<p>Your bag is empty. Browse the <a href="shop.html">full collection</a> or start with <a href="new-arrivals.html">new arrivals</a>.</p>';
      } else {
        body.innerHTML = bag.map(function (line, i) {
          return '<div class="bag-line">' +
            '<img src="' + line.img + '" alt="' + line.name + '" width="64" height="80" loading="lazy">' +
            '<div><h3>' + line.name + '</h3>' +
            '<p>Size ' + line.size + ' &middot; Qty ' + line.qty + '</p>' +
            '<p>$' + (line.price * line.qty).toFixed(2) + '</p></div>' +
            '<button type="button" data-remove="' + i + '">Remove</button>' +
            '</div>';
        }).join("");
        $$("[data-remove]", body).forEach(function (btn) {
          on(btn, "click", function () {
            var b = getBag();
            b.splice(parseInt(btn.getAttribute("data-remove"), 10), 1);
            setBag(b);
          });
        });
      }
    }

    var total = bagTotal(bag);
    $$("[data-bag-total]").forEach(function (el) { el.textContent = "$" + total.toFixed(2); });

    /* Volt progress bar toward the free US shipping threshold */
    $$("[data-ship-progress]").forEach(function (wrap) {
      var fill = $(".prog__fill", wrap);
      var note = $("[data-ship-note]", wrap);
      var pct = Math.min(100, (total / FREE_SHIP_THRESHOLD) * 100);
      if (fill) fill.style.width = pct + "%";
      if (note) {
        note.textContent = total >= FREE_SHIP_THRESHOLD
          ? "Free US standard shipping applied"
          : "$" + (FREE_SHIP_THRESHOLD - total).toFixed(2) + " to free US standard shipping";
      }
    });
  }

  function initBag() {
    renderBag();

    var drawer = $("#bag-drawer");
    var trigger = $("[data-open-bag]");
    if (drawer && trigger) {
      drawer.__trigger = trigger;
      on(trigger, "click", function () { openPanelEl(drawer); });
      $$(".drawer-close", drawer).forEach(function (b) { on(b, "click", closePanel); });
    }

    $$("[data-add-to-bag]").forEach(function (btn) {
      on(btn, "click", function () {
        /* Scope the size picker to this product block so a category page can
           carry several buyable products at once. */
        var scope = btn.closest("[data-buy]") || document;
        var sizeGroup = scope.querySelector("[data-picker^='size']");
        var chosen = sizeGroup ? $("button[aria-pressed='true']", sizeGroup) : null;
        var errEl = scope.querySelector("[data-size-error]");
        if (sizeGroup && !chosen) {
          if (errEl) { errEl.hidden = false; }
          if (sizeGroup.querySelector("button")) sizeGroup.querySelector("button").focus();
          return;
        }
        if (errEl) errEl.hidden = true;

        var bag = getBag();
        var item = {
          id: btn.getAttribute("data-id"),
          name: btn.getAttribute("data-name"),
          price: parseFloat(btn.getAttribute("data-price")),
          img: btn.getAttribute("data-img"),
          size: chosen ? chosen.getAttribute("data-value") : "One size",
          qty: 1
        };
        var existing = bag.filter(function (l) { return l.id === item.id && l.size === item.size; })[0];
        if (existing) existing.qty += 1;
        else bag.push(item);
        setBag(bag);
        toast(item.name + " added to bag");
        if (drawer) openPanelEl(drawer);
      });
    });
  }

  /* ======================================================================
     12. FORM VALIDATION - inline messages, no native tooltips
     ====================================================================== */
  function validateField(input) {
    var field = input.closest(".field") || input.closest(".check-row");
    if (!field) return true;
    var err = $(".err", field) || $(".err", field.parentNode);
    var value = (input.type === "checkbox") ? input.checked : input.value.trim();
    var message = "";

    if (input.required && !value) {
      message = input.getAttribute("data-msg-required") || "This field is required.";
    } else if (input.type === "email" && value && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(value)) {
      message = "Enter a valid email address, for example name@example.com.";
    } else if (input.type === "tel" && value && !/^[0-9()+\-.\s]{7,}$/.test(value)) {
      message = "Enter a valid phone number, digits and dashes only.";
    } else if (input.minLength > 0 && value.length > 0 && value.length < input.minLength) {
      message = "Please use at least " + input.minLength + " characters.";
    }

    if (message) {
      field.classList.add("has-error");
      if (err) err.textContent = message;
      input.setAttribute("aria-invalid", "true");
      return false;
    }
    field.classList.remove("has-error");
    input.removeAttribute("aria-invalid");
    return true;
  }

  function initForms() {
    $$("form[data-validate]").forEach(function (form) {
      var status = $("[data-form-status]", form);
      var inputs = $$("input, textarea, select", form).filter(function (i) {
        return i.type !== "hidden" && i.type !== "submit";
      });

      inputs.forEach(function (input) {
        on(input, "blur", function () { validateField(input); });
        on(input, "input", function () {
          var field = input.closest(".field") || input.closest(".check-row");
          if (field && field.classList.contains("has-error")) validateField(input);
        });
      });

      on(form, "submit", function (e) {
        e.preventDefault();
        var ok = true;
        var firstBad = null;
        inputs.forEach(function (input) {
          if (!validateField(input)) { ok = false; if (!firstBad) firstBad = input; }
        });
        if (!ok) {
          if (status) {
            status.className = "form-status is-visible is-error";
            status.textContent = "Please correct the highlighted fields and send again.";
          }
          if (firstBad) firstBad.focus();
          return;
        }
        if (status) {
          status.className = "form-status is-visible";
          status.textContent = form.getAttribute("data-success") ||
            "Thank you. Your message has been queued for our Asheville team and we reply within one business day.";
          status.setAttribute("tabindex", "-1");
          status.focus();
        }
        form.reset();
        $$(".has-error", form).forEach(function (f) { f.classList.remove("has-error"); });
      });
    });
  }

  /* ======================================================================
     13. SIZE GUIDE UNIT TOGGLE (inches default for US shoppers)
     ====================================================================== */
  function initUnits() {
    var toggles = $$("[data-unit]");
    if (!toggles.length) return;
    toggles.forEach(function (btn) {
      on(btn, "click", function () {
        var unit = btn.getAttribute("data-unit");
        toggles.forEach(function (b) { b.setAttribute("aria-pressed", b === btn ? "true" : "false"); });
        $$("[data-in]").forEach(function (cell) {
          cell.textContent = unit === "cm" ? cell.getAttribute("data-cm") : cell.getAttribute("data-in");
        });
        $$("[data-unit-label]").forEach(function (l) { l.textContent = unit === "cm" ? "centimeters" : "inches"; });
      });
    });
  }

  /* ======================================================================
     14. STOCKIST SEARCH
     ====================================================================== */
  function initStockists() {
    var input = $("[data-stockist-search]");
    if (!input) return;
    var cards = $$("[data-stockist]");
    var count = $("[data-stockist-count]");
    var empty = $("[data-stockist-empty]");
    on(input, "input", function () {
      var q = input.value.trim().toLowerCase();
      var n = 0;
      cards.forEach(function (card) {
        var hay = card.textContent.toLowerCase();
        var ok = !q || hay.indexOf(q) !== -1;
        card.hidden = !ok;
        if (ok) n++;
      });
      if (count) count.textContent = n + (n === 1 ? " location" : " locations");
      if (empty) empty.hidden = n !== 0;
    });
  }

  /* ======================================================================
     15. COPY-TO-CLIPBOARD (referral code)
     ====================================================================== */
  function initCopy() {
    $$("[data-copy]").forEach(function (btn) {
      on(btn, "click", function () {
        var text = btn.getAttribute("data-copy");
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { toast("Code " + text + " copied"); });
        } else {
          toast("Your referral code is " + text);
        }
      });
    });
  }

  /* ======================================================================
     BOOT
     ====================================================================== */
  function boot() {
    initHeader();
    initReveal();
    initBackToTop();
    initConsent();
    initAccordions();
    initFilters();
    initGallery();
    initPickers();
    initBag();
    initForms();
    initUnits();
    initStockists();
    initCopy();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
