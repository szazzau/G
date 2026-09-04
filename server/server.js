const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const POSTS_FILE = path.join(DATA_DIR, 'posts.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

const JWT_SECRET = process.env.JWT_SECRET || 'replace-me-in-prod';

// Basic banned words for auto-moderation — update as needed
const BANNED_WORDS = [ 'spam', 'viagra', 'scam' ];

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '..', 'microblog')));

// Rate limiters
const createLimiter = rateLimit({ windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // default (very high) — overridden per-route below
  standardHeaders: true,
  legacyHeaders: false
});

const postLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: { error: 'Too many posts, slow down' } });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Too many login attempts, try later' } });

// ensure data dir/file
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(POSTS_FILE)) fs.writeFileSync(POSTS_FILE, '[]', 'utf8');
if (!fs.existsSync(USERS_FILE)) {
  // create default admin user with insecure password 'changeme' — change after first login
  const defaultPassword = 'changeme';
  const hash = bcrypt.hashSync(defaultPassword, 10);
  const users = [{ username: 'admin', passwordHash: hash, role: 'admin' }];
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
  console.warn('Created default admin user (username: admin, password: changeme). Change this immediately.');
}

function readPosts(){
  try { return JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8')); }
  catch(e){ return []; }
}
function writePosts(posts){
  fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2), 'utf8');
}

function readUsers(){
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); }
  catch(e){ return []; }
}

// Helpers
function containsBanned(text){
  if(!text) return false;
  const s = text.toLowerCase();
  return BANNED_WORDS.some(b => s.includes(b));
}

function generateId(){
  return 'p' + Math.random().toString(36).slice(2,9);
}

// Auth middleware
function verifyToken(req, res, next){
  const auth = req.headers.authorization;
  if(!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' });
  const token = auth.slice(7);
  try{
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  }catch(e){
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requireAdmin(req, res, next){
  if(req.user && req.user.role === 'admin') return next();
  return res.status(403).json({ error: 'admin required' });
}

// Public API: list posts — by default exclude flagged/deleted
app.get('/api/posts', createLimiter, (req, res) => {
  const posts = readPosts();
  const include_flagged = req.query.include_flagged === '1';
  if(include_flagged && req.headers.authorization){
    // try verify token to allow admins to see flagged
    try{ jwt.verify(req.headers.authorization.slice(7), JWT_SECRET); }
    catch(e){ return res.status(401).json({ error: 'Invalid token' }); }
  }
  const filtered = posts.filter(p => p.status !== 'deleted' && (include_flagged ? true : p.status !== 'flagged'));
  res.json(filtered);
});

// Create post — rate limited per IP
app.post('/api/posts', postLimiter, (req, res) => {
  const { text, author } = req.body || {};
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'text is required' });
  }
  const posts = readPosts();
  const newPost = {
    id: generateId(),
    author: author || 'anon',
    created_at: new Date().toISOString(),
    text: text.trim().slice(0,2000),
    status: 'approved',
    flags: []
  };

  // Auto-moderation: flag if banned words
  if(containsBanned(newPost.text)){
    newPost.status = 'flagged';
    newPost.flags.push({ reason: 'banned_words', by: 'auto', at: new Date().toISOString() });
  }

  posts.push(newPost);
  writePosts(posts);
  if(newPost.status === 'flagged') return res.status(202).json({ message: 'Post received and flagged for review' });
  res.status(201).json(newPost);
});

// Flag a post (authenticated users)
app.post('/api/posts/:id/flag', verifyToken, (req, res) => {
  const id = req.params.id;
  const { reason } = req.body || {};
  const posts = readPosts();
  const p = posts.find(x => x.id === id);
  if(!p) return res.status(404).json({ error: 'not found' });
  p.status = 'flagged';
  p.flags = p.flags || [];
  p.flags.push({ reason: reason || 'manual', by: req.user.username || 'user', at: new Date().toISOString() });
  writePosts(posts);
  res.json({ message: 'flagged' });
});

// Moderation endpoints — protected
app.get('/api/moderation', verifyToken, requireAdmin, (req, res) => {
  const posts = readPosts();
  const flagged = posts.filter(p => p.status === 'flagged');
  res.json(flagged);
});

app.post('/api/posts/:id/approve', verifyToken, requireAdmin, (req, res) => {
  const id = req.params.id;
  const posts = readPosts();
  const p = posts.find(x => x.id === id);
  if(!p) return res.status(404).json({ error: 'not found' });
  p.status = 'approved';
  writePosts(posts);
  res.json({ message: 'approved' });
});

app.post('/api/posts/:id/delete', verifyToken, requireAdmin, (req, res) => {
  const id = req.params.id;
  const posts = readPosts();
  const p = posts.find(x => x.id === id);
  if(!p) return res.status(404).json({ error: 'not found' });
  p.status = 'deleted';
  writePosts(posts);
  res.json({ message: 'deleted' });
});

// Auth: login -> returns JWT
app.post('/api/auth/login', loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if(!username || !password) return res.status(400).json({ error: 'username and password required' });
  const users = readUsers();
  const u = users.find(x => x.username === username);
  if(!u) return res.status(401).json({ error: 'invalid credentials' });
  const ok = bcrypt.compareSync(password, u.passwordHash);
  if(!ok) return res.status(401).json({ error: 'invalid credentials' });
  const token = jwt.sign({ username: u.username, role: u.role }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token });
});

// simple endpoint to create a new user (admin only)
app.post('/api/users', verifyToken, requireAdmin, (req, res) => {
  const { username, password, role } = req.body || {};
  if(!username || !password) return res.status(400).json({ error: 'username and password required' });
  const users = readUsers();
  if(users.find(u=>u.username===username)) return res.status(409).json({ error: 'exists' });
  const hash = bcrypt.hashSync(password, 10);
  users.push({ username, passwordHash: hash, role: role || 'user' });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
  res.status(201).json({ username, role: role || 'user' });
});

app.listen(PORT, () => {
  console.log(`Microblog server with auth/moderation listening on http://localhost:${PORT}`);
  if(JWT_SECRET === 'replace-me-in-prod') console.warn('Warning: Using default JWT_SECRET — set process.env.JWT_SECRET in production');
});
