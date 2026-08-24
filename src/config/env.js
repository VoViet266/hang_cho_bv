const dotenv = require('dotenv');

dotenv.config();



module.exports = {
    PORT: parseInt(process.env.PORT, 10) || 3000,
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV || 'development',
    VOICE_NAME: process.env.VOICE_NAME || 'vi-VN-Wavenet-A',
    SPEAKING_RATE: parseFloat(process.env.SPEAKING_RATE) || 1.0,
};
