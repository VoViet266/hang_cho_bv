const winston = require('winston');
require('winston-daily-rotate-file');
const path = require('path');


const levelMap = {
    info: 'INF',
    warn: 'WRN',
    error: 'ERR',
    debug: 'DBG'
};

const fileFormat = winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
        const lvl = levelMap[level] || level.toUpperCase().substring(0, 3);
        const metaStr = Object.keys(meta).length ? `\nMeta: ${JSON.stringify(meta, null, 2)}` : '';
        return `[${timestamp} ${lvl}] ${stack || message} ${metaStr}`;
    })
);


const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
        // Lấy level gốc (bỏ mã màu để so sánh)
        const rawLevel = level.replace(/\u001b\[.*?m/g, '');
        const lvl = levelMap[rawLevel] || rawLevel.toUpperCase().substring(0, 3);

        // Đắp lại màu cho chữ INF, WRN, ERR
        const coloredLvl = level.replace(rawLevel, lvl);

        const metaStr = Object.keys(meta).length ? `\nMeta: ${JSON.stringify(meta, null, 2)}` : '';
        return `[${timestamp} ${coloredLvl}] ${stack || message} ${metaStr}`;
    })
);

const fileTransport = new winston.transports.DailyRotateFile({
    filename: path.join(__dirname, '../../logs/Applications/Hangcho/application-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d',
    format: fileFormat
});

const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    transports: [
        new winston.transports.Console({
            format: consoleFormat
        }),
        fileTransport
    ]
});

module.exports = logger;

