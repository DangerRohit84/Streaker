
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }, 
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  email: { type: String, required: true },
  streakCount: { type: Number, default: 0 },
  lastCompletedDate: { type: String, default: null },
  lastActiveDate: { type: String, default: null }, // Tracks the last day the user checked the app
  
  // The "Array of Yes" - stores dates where ALL tasks were completed
  persistenceLog: { type: [String], default: [] }, 
  
  // Task Definitions (The rituals/habits themselves)
  taskDefinitions: [{
    id: { type: String, required: true },
    title: { type: String, required: true },
    reminderTime: { type: String },
    createdAt: { type: Date, default: Date.now }
  }],
  
  // Progress for the CURRENT day (lastActiveDate)
  // Stores IDs of taskDefinitions completed on the current day
  completedToday: { type: [String], default: [] },

  joinDate: { type: String, default: () => new Date().toISOString() },
  notificationSettings: {
    soundEnabled: { type: Boolean, default: true },
    selectedSound: { type: String, default: 'ruby-chime' },
    snoozeDuration: { type: Number, default: 10 }
  }
});

module.exports = mongoose.model('User', userSchema);
