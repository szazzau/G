const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const POSTS_FILE = path.join(DATA_DIR, 'posts.json');

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '..', 'microblog')));

// ensure data dir/file
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(POSTS_FILE)) fs.writeFileSync(POSTS_FILE, '[]', 'utf8');

function readPosts(){
  try { return JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8')); }
  catch(e){ return []; }
}
function writePosts(posts){
  fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2), 'utf8');
}

app.get('/api/posts', (req, res) => {
  res.json(readPosts());
});

app.post('/api/posts', (req, res) => {
  const { text, author } = req.body;
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'text is required' });
  }
  const posts = readPosts();
  const newPost = {
    id: 'p' + Math.random().toString(36).slice(2,9),
    author: author || 'anon',
    created_at: new Date().toISOString(),
    text: text.trim().slice(0,1000)
  };
  posts.push(newPost);
  writePosts(posts);
  res.status(201).json(newPost);
});

app.listen(PORT, () => {
  console.log(`Microblog server listening on http://localhost:${PORT}`);
});
