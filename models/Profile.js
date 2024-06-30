const mongoose = require('mongoose');

const profileSchema = new mongoose.Schema({
  name: { type: String, required: true },
  age: { type: Number, required: true },
  gender: { type: String, required: true },
  bio: { type: String, required: true },
  interests: { type: String, required: true },
  phone: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  country: { type: String, required: true },
  profilePicture: { type: String, required: true }, // Assuming storing URL of profile picture
});

const Profile = mongoose.model('Profile', profileSchema);

module.exports = Profile;
