
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

// Database connection with retry logic
const connectDB = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Database Integrated');
  } catch (err) {
    console.error('❌ Connection Failed:', err);
    setTimeout(connectDB, 5000);
  }
};
connectDB();

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

// Error handling wrapper
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * DIRECT API ROUTES
 */

app.get('/api/health', (req, res) => res.status(200).send('OK'));

app.get('/api/session', asyncHandler(async (req, res) => {
  if (req.session && req.session.userId) {
    const user = await User.findOne({ id: req.session.userId });
    if (user) return res.json(user);
  }
  res.status(401).json({ error: 'Unauthorized' });
}));

app.get('/api/users/check', asyncHandler(async (req, res) => {
  const users = await User.find({}, 'username');
  res.json(users);
}));

app.get('/api/admin/users', asyncHandler(async (req, res) => {
  if (!req.session.userId) return res.status(403).json({ error: 'Forbidden' });
  const users = await User.find({}).sort({ streakCount: -1 });
  res.json(users);
}));

app.post('/api/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username, password });
  if (user) {
    req.session.userId = user.id;
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: 'Session save failed' });
      res.json(user);
    });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
}));

app.post('/api/users', asyncHandler(async (req, res) => {
  const newUser = new User(req.body);
  const count = await User.countDocuments();
  if (count === 0) newUser.role = 'admin';
  
  await newUser.save();
  req.session.userId = newUser.id;
  req.session.save((err) => {
    if (err) return res.status(500).json({ error: 'Session save failed' });
    res.json(newUser);
  });
}));

app.put('/api/users/:id', asyncHandler(async (req, res) => {
  const userId = req.params.id;
  const { password, _id, __v, id, ...updateData } = req.body;
  const updatedUser = await User.findOneAndUpdate(
    { id: userId },
    { $set: updateData },
    { new: true, runValidators: true }
  );
  if (!updatedUser) return res.status(404).json({ error: 'User not found' });
  res.json(updatedUser);
}));

app.get('/api/tasks/today', asyncHandler(async (req, res) => {
  const { userId, date } = req.query;
  const targetDate = date || new Date().toISOString().split('T')[0];
  const tasks = await Task.find({ userId, date: targetDate });
  res.json(tasks);
}));

app.get('/api/tasks', asyncHandler(async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  const tasks = await Task.find({ userId });
  res.json(tasks);
}));

app.post('/api/tasks', asyncHandler(async (req, res) => {
  const data = req.body;
  const task = await Task.findOneAndUpdate(
    { id: data.id },
    data,
    { upsert: true, new: true }
  );
  res.json(task);
}));

app.delete('/api/tasks/:id', asyncHandler(async (req, res) => {
  await Task.deleteOne({ id: req.params.id });
  res.sendStatus(200);
}));

app.delete('/api/tasks', asyncHandler(async (req, res) => {
  const { title, recurring } = req.query;
  if (recurring === 'true') {
    await Task.deleteMany({ title, isRecurring: true });
  }
  res.sendStatus(200);
}));

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.clearCookie('streakflow_sid', { secure: true, sameSite: 'none' });
  res.sendStatus(200);
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('🔥 Server Error:', err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    instance_failed: true
  });
});

app.listen(PORT, () => console.log(`🚀 persistence-api-node online on port ${PORT}`));
