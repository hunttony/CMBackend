// models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: String,
  age: Number,
  gender: String,
  bio: String,
  interests: String,
  profilePicture: String,
  phone: String,
  city: String,
  state: String,
  country: String,
  loginCode: String, // Temporary login code
});

const User = mongoose.model('User', userSchema);
module.exports = User;
