(function () {
  var toggle = document.querySelector(".nav__toggle");
  var menu = document.getElementById("nav-menu");

  if (toggle && menu) {
    var links = menu.querySelectorAll("a");

    toggle.addEventListener("click", function () {
      var isOpen = menu.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(isOpen));
    });

    links.forEach(function (link) {
      link.addEventListener("click", function () {
        menu.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  var sections = document.querySelectorAll("main section[id]");
  var navLinks = document.querySelectorAll(".nav__menu a[href^='#']");

  if ("IntersectionObserver" in window && sections.length && navLinks.length) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var id = entry.target.id;
            navLinks.forEach(function (link) {
              link.classList.toggle("is-active", link.getAttribute("href") === "#" + id);
            });
          }
        });
      },
      { rootMargin: "-40% 0px -55% 0px" }
    );

    sections.forEach(function (section) {
      observer.observe(section);
    });
  }

  var faqToggle = document.querySelector(".faq__toggle");
  var faqReveal = document.getElementById("faq-list");

  if (faqToggle && faqReveal) {
    faqToggle.addEventListener("click", function () {
      var isOpen = faqReveal.classList.toggle("is-open");
      faqToggle.setAttribute("aria-expanded", String(isOpen));
      faqToggle.textContent = isOpen ? "Hide FAQ" : "Show FAQ";
    });
  }

  // Clicking the email copies it; falls back to the mailto link if copying fails
  var emailLink = document.querySelector('.contact__links a[href^="mailto:"]');

  if (emailLink && navigator.clipboard) {
    var status = document.createElement("span");
    status.className = "visually-hidden";
    status.setAttribute("role", "status");
    emailLink.after(status);

    emailLink.addEventListener("click", function (e) {
      e.preventDefault();
      navigator.clipboard.writeText(emailLink.getAttribute("href").slice(7)).then(
        function () {
          status.textContent = "";
          setTimeout(function () {
            status.textContent = "Email address copied";
          }, 50);
          if (window.pixelDissolve) window.pixelDissolve.bubble(emailLink, "Copied to clipboard!");
        },
        function () {
          window.location.href = emailLink.href;
        }
      );
    });
  }

  var revealTargets = document.querySelectorAll("[data-reveal]");

  if ("IntersectionObserver" in window && revealTargets.length) {
    var revealObserver = new IntersectionObserver(
      function (entries, obs) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            obs.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 }
    );

    revealTargets.forEach(function (target) {
      revealObserver.observe(target);
    });
  }

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Work tabs: show all, client work only, or recent projects only
  var tabs = document.querySelectorAll(".work__tab");
  var groups = document.querySelectorAll(".work__group");

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      var filter = tab.getAttribute("data-filter");
      tabs.forEach(function (t) {
        t.setAttribute("aria-pressed", String(t === tab));
      });
      groups.forEach(function (g) {
        g.hidden = filter !== "all" && g.getAttribute("data-group") !== filter;
      });
    });
  });

  // References marquee: clone the quotes until one copy is wider than the screen, then loop
  var marquee = document.querySelector(".marquee");

  if (marquee && !reduceMotion) {
    var track = marquee.querySelector(".marquee__track");
    var quotes = Array.prototype.slice.call(track.children);
    var copies = Math.max(1, Math.ceil(window.innerWidth / (quotes.length * 420)));
    function addCopy() {
      quotes.forEach(function (q) {
        var c = q.cloneNode(true);
        c.setAttribute("aria-hidden", "true");
        track.appendChild(c);
      });
    }
    for (var k = 1; k < copies; k++) addCopy();
    var half = track.children.length;
    for (var m = 0; m < half / quotes.length; m++) addCopy();
    marquee.classList.add("is-running");
  }

  // Capability tiles tilt toward the pointer (mouse only)
  if (!reduceMotion && window.matchMedia("(pointer: fine)").matches) {
    document.querySelectorAll("[data-tilt]").forEach(function (tile) {
      tile.addEventListener("pointermove", function (e) {
        var r = tile.getBoundingClientRect();
        var rx = ((e.clientY - r.top) / r.height - 0.5) * -16;
        var ry = ((e.clientX - r.left) / r.width - 0.5) * 16;
        tile.style.transform = "perspective(1000px) rotateX(" + rx + "deg) rotateY(" + ry + "deg) scale(1.02)";
      }, { passive: true });
      tile.addEventListener("pointerleave", function () {
        tile.style.transform = "";
      });
    });
  }
})();
