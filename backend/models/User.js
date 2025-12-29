
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // Hashed on client
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  email: { type: String, required: true },
  streakCount: { type: Number, default: 0 },
  lastCompletedDate: { type: String, default: null },
  joinDate: { type: String, default: () => new Date().toISOString() },
  notificationSettings: {
    soundEnabled: { type: Boolean, default: true },
    selectedSound: { type: String, default: 'ruby-chime' },
    snoozeDuration: { type: Number, default: 10 }
  }
});

module.exports = mongoose.model('User', userSchema);