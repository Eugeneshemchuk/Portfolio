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

  var contactToggle = document.querySelector(".contact__toggle");
  var contactReveal = document.getElementById("contact-links");

  if (contactToggle && contactReveal) {
    contactToggle.addEventListener("click", function () {
      var isOpen = contactReveal.classList.toggle("is-open");
      contactToggle.setAttribute("aria-expanded", String(isOpen));

      // Opening crumbles the button into pixels and the links take its place
      if (isOpen && window.pixelDissolve) {
        var hadFocus = document.activeElement === contactToggle;
        window.pixelDissolve.element(contactToggle);
        contactToggle.hidden = true;
        if (hadFocus) contactReveal.querySelector("a").focus({ preventScroll: true });
      }
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
})();
