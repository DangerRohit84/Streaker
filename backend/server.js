
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const User = require('./models/User');
const Task = require('./models/Task');

const app = express();
const PORT = process.env.PORT ;

const MONGODB_URI = process.env.MONGODB_URI ;

app.set('trust proxy', 1);

app.use(cors({
  origin: true, 
  credentials: true
}));
app.use(express.json());

// Database connection with increased timeout for production stability
const connectDB = async () => {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 20000,
    });
    console.log('✅ StrikeFlow Persistent Link Active');
  } catch (err) {
    console.error('❌ Connection Link Failed:', err);
    setTimeout(connectDB, 5000);
  }
};
connectDB();

app.use(session({
  name: 'strikeflow_v6_sid',
  secret: process.env.SESSION_SECRET || 'strikeflow-high-entropy-persistence-key',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ 
    mongoUrl: MONGODB_URI,
    collectionName: 'sessions',
    ttl: 60 * 60 * 24 * 30 
  }),
  cookie: { 
    maxAge: 1000 * 60 * 60 * 24 * 30,
    httpOnly: true,
    secure: true, 
    sameSite: 'none'
  }
}));

const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * STRIKEFLOW PERSISTENCE API V6
 */

app.get('/api/health', (req, res) => res.status(200).send('OPTIMAL'));

app.get('/api/session', asyncHandler(async (req, res) => {
  if (req.session && req.session.userId) {
    const user = await User.findOne({ id: req.session.userId });
    if (user) return res.json(user);
  }
  res.status(401).json({ error: 'UNAUTHORIZED' });
}));

app.post('/api/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username, password });
  if (user) {
    req.session.userId = user.id;
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: 'SESSION_SAVE_ERROR' });
      res.json(user);
    });
  } else {
    res.status(401).json({ error: 'INVALID_CREDENTIALS' });
  }
}));

app.post('/api/users', asyncHandler(async (req, res) => {
  const newUser = new User(req.body);
  const count = await User.countDocuments();
  if (count === 0) newUser.role = 'admin';
  await newUser.save();
  req.session.userId = newUser.id;
  req.session.save((err) => {
    if (err) return res.status(500).json({ error: 'SESSION_SAVE_ERROR' });
    res.json(newUser);
  });
}));

app.put('/api/users/:id', asyncHandler(async (req, res) => {
  const { password, _id, __v, id, ...updateData } = req.body;
  const updatedUser = await User.findOneAndUpdate(
    { id: req.params.id },
    { $set: updateData },
    { new: true, runValidators: true }
  );
  if (!updatedUser) return res.status(404).json({ error: 'USER_NOT_FOUND' });
  res.json(updatedUser);
}));

app.get('/api/tasks', asyncHandler(async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'USER_ID_REQUIRED' });
  const tasks = await Task.find({ userId }).sort({ date: -1 });
  res.json(tasks);
}));

app.post('/api/tasks', asyncHandler(async (req, res) => {
  const data = req.body;
  // Upsert ensures we update the existing record for that specific date or create it
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
    // When deleting a recurring task, we delete all instances with that title
    await Task.deleteMany({ title, isRecurring: true });
  }
  res.sendStatus(200);
}));

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.clearCookie('strikeflow_v6_sid', { secure: true, sameSite: 'none' });
  res.sendStatus(200);
});

app.use((err, req, res, next) => {
  console.error('🔥 SYSTEM ERROR:', err.stack);
  res.status(500).json({ error: 'INTERNAL_NODE_ERROR' });
});

app.listen(PORT, () => console.log(`🚀 persistence-api-node online on port ${PORT}`));
