# Eugene Shemchuk — Portfolio

Live at [eugeneshemchuk.github.io/Portfolio](https://eugeneshemchuk.github.io/Portfolio/)

Personal portfolio site for a freelance senior backend/platform engineer specialising in agentic AI and AI product engineering, based in Amsterdam.

## Stack

Plain HTML, CSS, and vanilla JavaScript. No frameworks, no build step, no runtime dependencies — what's in this repo is exactly what gets served on GitHub Pages.

- `index.html` — the whole site (single page, anchor navigation)
- `css/` — token-driven styles (`tokens.css` for design tokens, `base.css` for reset/typography, `sections.css` per page section)
- `js/` — `nav.js` (anchor nav, mobile menu, contact reveal, scroll reveal) and `network.js` (the hero canvas node-network animation)
- `assets/img/` — optimised images, served via `<picture>` with AVIF/WebP/JPEG fallbacks

## Performance & accessibility

- Total JS ~9 KB, total CSS ~15 KB (budget: 15 KB / 20 KB)
- Fully usable with JavaScript disabled — the canvas animation, mobile nav, and contact-link reveal are all progressive enhancement
- WCAG AA contrast throughout, 44×44px touch targets, `prefers-reduced-motion` respected

## Deployment

Static site on GitHub Pages, served from the root of `main`. No CI, no build step.

## Built with Claude Code

This site was built collaboratively with [Claude Code](https://claude.com/claude-code) across six phases — skeleton, visual design, canvas animation, content, SEO/metadata, and ship. The agent wrote code and drafted copy; content decisions, corrections, and sign-off were mine.
