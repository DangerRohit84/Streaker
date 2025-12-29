
const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  title: { type: String, required: true },
  completed: { type: Boolean, default: false },
  date: { type: String, required: true, index: true }, // YYYY-MM-DD
  isRecurring: { type: Boolean, default: false },
  reminderTime: { type: String }, // HH:mm
  snoozedUntil: { type: String }
});

module.exports = mongoose.model('Task', taskSchema);
