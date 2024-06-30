// routes/auth.js
const express = require('express');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const router = express.Router();
const secretKey = 'your_secret_key';

// Verify code and generate token
router.post('/verify-code', async (req, res) => {
  const { code } = req.body;

  try {
    const user = await User.findOne({ loginCode: code });
    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired code' });
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user._id }, secretKey, { expiresIn: '1h' });

    // Clear the login code after use
    user.loginCode = null;
    await user.save();

    res.json({ token });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
