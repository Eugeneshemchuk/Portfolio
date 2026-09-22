# CLAUDE.md - Portfolio Site Build Instructions

## What this repo is

A single-page personal portfolio site for **Eugene**, freelance senior backend/platform engineer specialising in **Agentic AI and AI product engineering**, based in Amsterdam. The goal of the site is lead generation: a visitor should understand within 10 seconds what I do, see proof, and have an obvious way to contact me.

Deployed as static files to **GitHub Pages**. No server, no build step.

---

## Hard constraints - do not violate these

1. **Plain HTML, CSS, and vanilla JS only.** No React, Vue, Svelte, Astro, Tailwind, jQuery, or any framework.
2. **No build step.** What is in the repo is what gets served. No bundler, no transpiler, no `npm install`, no `package.json` unless I explicitly ask.
3. **No runtime third-party dependencies.** No CDN scripts, no Google Fonts link, no analytics beyond what I approve. Everything self-hosted in the repo.
4. **Performance budget, enforced:**
   - Total JS shipped: under 15 KB minified-equivalent (hand-written, keep it tight)
   - Total CSS: under 20 KB
   - Largest Contentful Paint target: under 1.2s on a mid-range mobile over 4G
   - Zero layout shift: every image and media element has explicit `width` and `height`
   - No render-blocking resources other than one small CSS file
5. **One page.** `index.html` is the whole site. Navigation is anchor links to sections on the same page. No client-side router, no separate pages, unless I ask later.
6. **Progressive enhancement.** The site must be fully readable and usable with JavaScript disabled. JS only adds the canvas animation, nav state, and small interactions.

---

## How we work together - read this carefully

This is an **iterative build**. Token efficiency matters to me. Follow these rules:

- **Do one phase at a time.** Complete the phase, stop, report what you did in 3-5 lines, and wait for my feedback. Do not run ahead into the next phase.
- **Never rewrite a whole file to change one part of it.** Use targeted edits.
- **Do not re-read files you have already read** unless I have changed them or you changed them in a way you need to verify.
- **Do not refactor, reorganise, or "improve" code I have not asked you to touch.** If you think something needs restructuring, say so in one line and let me decide.
- **Do not add features I did not ask for.** No dark mode toggle, no blog, no animations beyond the one specified, no cookie banner, no chat widget. If you think something would help, suggest it in one sentence.
- **Do not create README files, docs, changelogs, or summary files** unless I ask.
- **Ask before installing anything or adding any dependency.** The answer is almost certainly no.
- **If content is missing, ask me for it.** Never invent project descriptions, client names, metrics, testimonials, or job history. Placeholder text is fine only if clearly marked `TODO:` and you tell me what you need.

---

## Content I will supply

I will drop raw material into `/content/`. Read from there, do not guess.

```
/content/
  photo/          my headshot
  refs/           reference images - visual direction I like
  projects/       project descriptions (markdown or txt)
  testimonials/   references from past managers
```

Rules for handling this material:

- **Reference images in `/content/refs/` are directional inspiration only.** Extract the principles - spacing rhythm, type scale, colour temperature, density, motion feel. Do not clone a specific site's layout or reproduce anyone's logo, illustration, or copy.
- **Testimonials:** use the person's name, title, and company only if it appears in the source file. If a file is ambiguous about whether the name can be published, ask me before putting it on the page.
- **Photo:** process into modern formats (AVIF and WebP with a JPEG fallback), multiple sizes, served via `<picture>` with `srcset`. Keep the largest served variant under 120 KB.
- **Project descriptions:** rewrite into tight, outcome-focused copy. Lead with the problem and the result, not the tech stack. Show me a draft of the copy before you commit it into HTML.

---

## File structure

Build exactly this. Keep it flat and obvious so I can find and tweak anything fast.

```
/
  index.html
  css/
    tokens.css        design tokens only - colours, type scale, spacing, radii, motion
    base.css          reset, typography, layout primitives
    sections.css      per-section styles, in page order
  js/
    nav.js            anchor nav, scroll state, mobile menu
    network.js        the canvas node animation
  assets/
    img/              processed, optimised, production images
    fonts/            self-hosted variable font, woff2, subset
  content/            my raw material - you read from here, you do not serve from here
  robots.txt
  sitemap.xml
  llms.txt
  .nojekyll
  CLAUDE.md
```

**CSS must be token-driven.** Every colour, spacing value, font size, radius, and transition duration lives as a custom property in `tokens.css`. Nothing hardcoded in `sections.css`. This is so I can restyle the entire site by editing one file.

**Each section in `sections.css` gets a clear comment banner** matching its section ID, in page order, so I can jump to it instantly.

---

## Page structure

One page, these sections in order, each with a stable `id` used for anchor navigation:

1. `#hero` - name, one-line positioning statement, primary CTA (hire me / book a call), secondary CTA (see work). Canvas node animation as background.
2. `#expertise` - what I do, grouped into 3-4 capability areas. Agentic AI systems, backend and platform engineering, AI product development. Scannable, not a wall of text.
3. `#work` - project cards. Problem, approach, outcome. Links out where they exist.
4. `#about` - short bio with photo. Credibility signals: background, years, notable past employers.
5. `#references` - manager testimonials. Quote, name, title, company.
6. `#contact` - email, LinkedIn, GitHub, and a clear call to action. Email as a real `mailto:` link, obfuscated lightly against scrapers but functional without JS.

**Navigation:** sticky header with anchor links. Use `scroll-behavior: smooth` in CSS, plus `IntersectionObserver` in `nav.js` to highlight the active section. Respect `prefers-reduced-motion` and disable smooth scrolling when it is set. Mobile: collapse to a minimal menu, no heavy overlay animation.

---

## Design direction

Clean, modern, technical, confident. Not a template. Not a startup landing page with gradient blobs.

- **Layout:** generous whitespace, strong vertical rhythm, one clear focal point per section. Max content width around 1100px, comfortable side gutters on mobile (16-24px).
- **Type:** one self-hosted variable font, subset to Latin. A clear modular scale. Large, tight-tracked headings. Body text at 16-18px with 1.6 line height. Do not use more than two weights.
- **Colour:** dark-first is fine and fits the technical tone. Restrained palette - one background, one surface, one text colour, one muted text, one accent. The accent appears rarely, which is what makes it work.
- **Motion:** subtle and fast. Transitions in the 120-200ms range. No scroll-jacking, no parallax, no long entrance animations. Content should never be invisible waiting for an animation to reveal it.
- **Responsive:** mobile-first CSS. Fluid type and spacing using `clamp()`. Test mentally at 360px, 768px, 1280px, 1920px. No horizontal overflow at any width, ever.

---

## The hero canvas animation

An interlinked node network, like a neural net graph, that responds to cursor movement. This is the signature element. It must look sharp and feel instant.

**Behaviour:**
- Nodes drift slowly and continuously
- Lines drawn between nodes within a proximity threshold, opacity falling off with distance
- Cursor acts as an influence point: nearby nodes are attracted or repelled slightly, and connection lines to the cursor brighten
- On touch devices, the cursor interaction is inactive - drift only

**Implementation requirements, non-negotiable:**
- Single `<canvas>` element, 2D context. No WebGL, no library.
- Cap node count and **scale it to viewport area**. Roughly 40-60 nodes on mobile, 90-120 on desktop. Never more.
- Use a **spatial grid for neighbour lookup**. Do not do a naive O(n²) pass over all node pairs every frame.
- Handle `devicePixelRatio` correctly for crisp rendering, but cap the DPR multiplier at 2 so retina displays do not quadruple the fill cost.
- `requestAnimationFrame` loop. **Pause it entirely** when the hero is scrolled out of view (`IntersectionObserver`) and when the tab is hidden (`visibilitychange`).
- Pointer position captured by a passive listener and only read once per frame. Do not do work inside the pointer handler.
- Debounce resize, and only recompute geometry on actual dimension change.
- Respect `prefers-reduced-motion: reduce`: render one static frame and stop. No drift, no interaction.
- The hero must have a readable background colour and correct text contrast with the canvas completely absent. The animation is decoration, not structure. Give the canvas `aria-hidden="true"`.
- Keep `network.js` self-contained with a small config object at the top of the file (node count, speed, link distance, cursor radius, colours) so I can tune the feel without reading the logic.

---

## SEO

- Single `<h1>` in the hero containing my name and specialism. Logical `h2`/`h3` hierarchy below it, no skipped levels.
- Semantic HTML throughout: `header`, `nav`, `main`, `section`, `article`, `footer`. Not a soup of divs.
- `<title>` and `<meta name="description">` written for a human searching for an AI engineering contractor, not keyword-stuffed.
- Open Graph and Twitter card tags, with a real OG image (1200x630) generated from the site's own design.
- `<link rel="canonical">` pointing at the live URL.
- `sitemap.xml` and `robots.txt`.
- Descriptive `alt` text on every image. Decorative images get `alt=""`.
- `lang` attribute set on `<html>`.
- **JSON-LD structured data**, inline in the head:
  - `Person` - name, jobTitle, description, knowsAbout (the AI/engineering specialisms), sameAs (LinkedIn, GitHub), address (Amsterdam), url
  - `ProfilePage` wrapping it
  - `FAQPage` if we add an FAQ section later

## AI SEO - being citable by LLMs and AI search

This matters as much as classic SEO. Assistants answering "who can I hire for agentic AI work" need to be able to parse and cite this page.

- **Write in extractable, self-contained statements.** Each key fact should stand alone without needing surrounding context. "Eugene is a freelance platform engineer in Amsterdam specialising in agentic AI systems" is citable. "With over a decade of passion for innovation..." is not.
- **Front-load answers.** Each section opens with the direct claim, then supports it. No build-up.
- **All substantive content must be in the HTML source**, not injected by JS. AI crawlers frequently do not execute JavaScript.
- **Entity clarity:** name, role, location, specialisms, and availability stated explicitly in plain text, and mirrored in the JSON-LD.
- **Add `/llms.txt`** at the repo root: a plain-text summary of who I am, what I do, what problems I solve, key projects, and how to contact me. Keep it factual and under 2 KB.
- Keep a short plain-language "What I do" block near the top - the kind of paragraph an assistant would quote verbatim.

---

## Accessibility

- Colour contrast meets WCAG AA (4.5:1 body, 3:1 large text). Check this against the actual token values, do not assume.
- Visible focus indicators on every interactive element. Do not remove outlines without replacing them.
- Full keyboard navigability. Skip-to-content link as the first focusable element.
- Touch targets minimum 44x44px.
- `prefers-reduced-motion` honoured for the canvas, scroll behaviour, and all transitions.

---

## GitHub Pages deployment

- Deploys from the repo root on the default branch. Serve `index.html` from root, not from `/docs`.
- Include an empty `.nojekyll` file so Jekyll does not process the site.
- All asset paths **relative**, never absolute from `/`, so the site works whether served from a user page or a project subpath.
- If I add a custom domain later, a `CNAME` file goes at the root. Ask me before creating one.

---

## Build phases

Stop at the end of each phase and wait for me.

**Phase 1 - Skeleton**
Scaffold the file structure. `index.html` with all six sections, semantic markup, real heading hierarchy, placeholder copy clearly marked `TODO:`. `tokens.css` with a full first-pass token set. `base.css` with reset and typography. Working anchor navigation. No animation yet, no images yet. Should already be responsive and readable.

**Phase 2 - Visual design**
Once I have given you the reference images: build out `sections.css`. Layout, spacing, type treatment, colour application across all sections. Still placeholder content. This is the phase where we iterate on look and feel, so keep changes surgical.

**Phase 3 - Canvas animation**
Build `network.js` to the spec above. Tune it with me. Verify it pauses off-screen and under reduced-motion.

**Phase 4 - Real content**
Process `/content/`. Draft the copy for each section and show it to me before committing it to HTML. Process and optimise images. Wire in testimonials and projects.

**Phase 5 - SEO, metadata, performance pass**
Meta tags, JSON-LD, OG image, `sitemap.xml`, `robots.txt`, `llms.txt`. Font subsetting. Image format checks. Verify against the performance budget. Report actual file sizes back to me.

**Phase 6 - Ship**
`.nojekyll`, relative path audit, final responsive check at the four breakpoints, accessibility check.

---

## Before you start Phase 1

Ask me anything genuinely blocking, in one short list. Then build Phase 1 and stop.
