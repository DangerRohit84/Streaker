
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const User = require('./models/User');
const Task = require('./models/Task');

const app = express();
const PORT = process.env.PORT;

const MONGODB_URI = process.env.MONGODB_URI;

app.set('trust proxy', 1);

app.use(cors({
  origin: true, 
  credentials: true
}));
app.use(express.json());

// Request logger for debugging 404s
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} [${req.method}] ${req.url}`);
  next();
});

mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ Database Integrated'))
  .catch(err => console.error('❌ Connection Failed:', err));

app.use(session({
  name: 'streakflow_sid',
  secret: process.env.SESSION_SECRET || 'streakflow-simple-key-high-security',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ 
    mongoUrl: MONGODB_URI,
    collectionName: 'sessions',
    ttl: 60 * 60 * 24 * 7 // 1 week
  }),
  cookie: { 
    maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
    httpOnly: true,
    secure: true, 
    sameSite: 'none'
  }
}));

app.get('/api/health', (req, res) => res.sendStatus(200));

app.get('/api/session', async (req, res) => {
  if (req.session && req.session.userId) {
    try {
      const user = await User.findOne({ id: req.session.userId });
      if (user) return res.json(user);
    } catch (e) {
      return res.status(500).json({ error: 'Session lookup failed' });
    }
  }
  res.status(401).json({ error: 'Unauthorized' });
});

app.get('/api/users/check', async (req, res) => {
  try {
    const users = await User.find({}, 'username');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Fetch failed' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username, password });
  if (user) {
    req.session.userId = user.id;
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: 'Session failed' });
      res.json(user);
    });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const newUser = new User(req.body);
    await newUser.save();
    req.session.userId = newUser.id;
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: 'Session failed' });
      res.json(newUser);
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'That name is already used' });
    }
    res.status(400).json({ error: 'Registration failed' });
  }
});

app.put('/api/users/:id', async (req, res) => {
  const userId = req.params.id;
  try {
    const { password, _id, __v, id, ...updateData } = req.body;
    
    // Explicitly search by the custom 'id' field
    const updatedUser = await User.findOneAndUpdate(
      { id: userId },
      { $set: updateData },
      { new: true, runValidators: true }
    );
    
    if (!updatedUser) {
      console.warn(`User mismatch: ID ${userId} not found in database.`);
      return res.status(404).json({ error: `Identity record mismatch (ID: ${userId}). Update aborted.` });
    }
    
    res.json(updatedUser);
  } catch (err) {
    console.error("Update Failure:", err);
    res.status(500).json({ error: 'System synchronization failed' });
  }
});

app.get('/api/tasks/today', async (req, res) => {
  const { userId, date } = req.query;
  const targetDate = date || new Date().toISOString().split('T')[0];
  const tasks = await Task.find({ userId, date: targetDate });
  res.json(tasks);
});

app.get('/api/tasks', async (req, res) => {
  const { userId } = req.query;
  const tasks = await Task.find({ userId });
  res.json(tasks);
});

app.post('/api/tasks', async (req, res) => {
  const data = req.body;
  const task = await Task.findOneAndUpdate(
    { id: data.id },
    data,
    { upsert: true, new: true }
  );
  res.json(task);
});

app.delete('/api/tasks/:id', async (req, res) => {
  await Task.deleteOne({ id: req.params.id });
  res.sendStatus(200);
});

app.delete('/api/tasks', async (req, res) => {
  const { title, recurring } = req.query;
  if (recurring === 'true') {
    await Task.deleteMany({ title, isRecurring: true });
  }
  res.sendStatus(200);
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.clearCookie('streakflow_sid', { secure: true, sameSite: 'none' });
  res.sendStatus(200);
});

// JSON fallback for undefined paths to assist frontend error parsing
app.use((req, res) => {
  res.status(404).json({ error: `Path [${req.method}] ${req.url} is undefined on this server.` });
});

app.listen(PORT, () => console.log(`🚀 Ready on port ${PORT}`));
