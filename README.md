# G — Microblog & Social snippets

What you get
- microblog/: tiny static microblog single-page app (vanilla JS). Posts prefer server persistence when available, otherwise fall back to browser localStorage.
- server/: lightweight Express server providing GET/POST /api/posts and optional static serving of microblog.
- social-meta.html: head snippet (Open Graph, Twitter Card, JSON-LD).

How to use
1. To run locally with the Express server:
   - cd server
   - npm install
   - npm start
   The app serves at http://localhost:3000 and exposes /api/posts.

2. To deploy static-only, copy microblog/ to your static host (GitHub Pages, Netlify). The client will use localStorage if no server is available.

Customization
- Edit microblog/index.html head meta tags (og:url, og:image, twitter:site).
- Replace localStorage with a database-backed storage by updating server/server.js.

Open Graph image
- I added assets/og.svg as a simple SVG you can use as your OG image (1200x630). Update social-meta.html to point to it.

Want changes?
Reply with which backend you want (Express or Flask), or if you prefer me to create a branch instead of committing to main.
