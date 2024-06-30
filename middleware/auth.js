const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Ensure the path is correct

const auth = async (req, res, next) => {
  const token = req.header('Authorization').replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ message: 'No token, authorization denied' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded.user;
    next();
  } catch (err) {
    console.error('Token is not valid', err);
    res.status(401).json({ message: 'Token is not valid' });
  }
};

module.exports = auth;
