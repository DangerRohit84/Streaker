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

/**
 * STORAGE LINK (MONGODB)
 * Put your database link here so the app knows where to save data.
 */
const MONGODB_URI = process.env.MONGODB_URI;

// Allow the app to talk to this server
app.use(cors({
  origin: 'https://streaker-9yrh.onrender.com',
  credentials: true
}));
app.use(express.json());

// Link to the database
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ Connected to your database!'))
  .catch(err => console.error('❌ Could not connect to the database:', err));

// Remember who is logged in
app.use(session({
  name: 'streakflow_sid',
  secret: 'streakflow-simple-key-high-security',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ 
    mongoUrl: MONGODB_URI,
    collectionName: 'sessions'
  }),
  cookie: { 
    maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
    httpOnly: true,
    secure: true,
    sameSite: 'none'
  }
}));

// ROUTES (How the app asks for things)

app.get('/api/health', (req, res) => res.sendStatus(200));

// Check Session Status (Added to fix refresh logout issue)
app.get('/api/session', async (req, res) => {
  if (req.session && req.session.userId) {
    const user = await User.findOne({ id: req.session.userId });
    if (user) {
      return res.json(user);
    }
  }
  res.status(401).json({ error: 'No active session' });
});

// Signing In
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username, password });
  if (user) {
    req.session.userId = user.id;
    // Save session manually to ensure cookie is sent correctly
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: 'Session save failed' });
      res.json(user);
    });
  } else {
    res.status(401).json({ error: 'Wrong name or password' });
  }
});

// Creating Account
app.post('/api/users', async (req, res) => {
  try {
    const newUser = new User(req.body);
    await newUser.save();
    req.session.userId = newUser.id;
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: 'Session save failed' });
      res.json(newUser);
    });
  } catch (err) {
    res.status(400).json({ error: 'That name is already used' });
  }
});

// Get habits for today
app.get('/api/tasks/today', async (req, res) => {
  const { userId } = req.query;
  const today = new Date().toISOString().split('T')[0];
  const tasks = await Task.find({ userId, date: today });
  res.json(tasks);
});

// Get every single habit ever saved
app.get('/api/tasks', async (req, res) => {
  const { userId } = req.query;
  const tasks = await Task.find({ userId });
  res.json(tasks);
});

// Save or change a habit
app.post('/api/tasks', async (req, res) => {
  const data = req.body;
  const task = await Task.findOneAndUpdate(
    { id: data.id },
    data,
    { upsert: true, new: true }
  );
  res.json(task);
});

// Delete one habit
app.delete('/api/tasks/:id', async (req, res) => {
  await Task.deleteOne({ id: req.params.id });
  res.sendStatus(200);
});

// Delete all habits with the same name (if repeating)
app.delete('/api/tasks', async (req, res) => {
  const { title, recurring } = req.query;
  if (recurring === 'true') {
    await Task.deleteMany({ title, isRecurring: true });
  }
  res.sendStatus(200);
});

// Log out
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.clearCookie('streakflow_sid');
  res.sendStatus(200);
});

app.listen(PORT, () => console.log(`🚀 Server is listening on port ${PORT}`));
