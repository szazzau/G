// Client microblog: tries server first, falls back to localStorage

const POSTS_KEY = "microblog_posts_v1";
const seedURL = "posts.json"; // include a posts.json file for seed posts

const el = (s) => document.querySelector(s);
const esc = (s) => encodeURIComponent(s);

function nowISO(){ return new Date().toISOString(); }

async function fetchServerPosts(){
  try{
    const res = await fetch('/api/posts');
    if(!res.ok) throw new Error('no server');
    return await res.json();
  }catch(e){ return null; }
}

async function postToServer(payload){
  try{
    const res = await fetch('/api/posts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if(!res.ok) throw new Error('post failed');
    return await res.json();
  }catch(e){ return null; }
}

async function loadSeed(){
  try{
    const res = await fetch(seedURL);
    if(!res.ok) return [];
    return await res.json();
  }catch(e){ return []; }
}

async function loadPosts(){
  // try server
  const server = await fetchServerPosts();
  if(Array.isArray(server)){
    localStorage.setItem(POSTS_KEY, JSON.stringify(server));
    return server;
  }
  // fallback to localStorage
  const raw = localStorage.getItem(POSTS_KEY);
  if(raw) return JSON.parse(raw);
  const seed = await loadSeed();
  localStorage.setItem(POSTS_KEY, JSON.stringify(seed));
  return seed;
}

function savePosts(posts){
  localStorage.setItem(POSTS_KEY, JSON.stringify(posts));
}

function makeShareButtons(text, url){
  const encodedText = esc(text);
  const encodedUrl = esc(url);
  const x = `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`;
  const mastodon = `https://mastodon.social/share?text=${encodedText}%20${encodedUrl}`;
  const linkedin = `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;
  const wa = `https://wa.me/?text=${encodedText}%20${encodedUrl}`;
  return { x, mastodon, linkedin, wa };
}

function renderPosts(posts){
  const container = el("#posts");
  container.innerHTML = "";
  posts.slice().reverse().forEach(p=>{
    const node = document.createElement("article");
    node.className = "post";
    node.innerHTML = `
      <header>
        <div>
          <div class="meta"><strong>${p.author || "anon"}</strong> · <span class="small">${new Date(p.created_at).toLocaleString()}</span></div>
        </div>
        <div class="small">${p.id}</div>
      </header>
      <div><p>${escapeHtml(p.text)}</p></div>
      <div class="actions">
        <button class="action-btn" data-share="x">Share X</button>
        <button class="action-btn" data-share="mastodon">Mastodon</button>
        <button class="action-btn" data-share="linkedin">LinkedIn</button>
        <button class="action-btn" data-copy>Copy</button>
      </div>
    `;
    node.querySelectorAll("[data-share]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const shareType = btn.getAttribute("data-share");
        const site = location.origin + location.pathname;
        const { x, mastodon, linkedin, wa } = makeShareButtons(p.text, site);
        const map = { x, mastodon, linkedin, wa };
        window.open(map[shareType], "_blank", "noopener");
      });
    });
    node.querySelector("[data-copy]").addEventListener("click", async ()=>{
      await navigator.clipboard.writeText(p.text);
      showToast("Copied to clipboard");
    });

    container.appendChild(node);
  });
}

function escapeHtml(s){
  return String(s).replace(/[&<>\