import * as log4js from 'log4js';

require('dotenv').config();

export type Logger = log4js.Logger;

log4js.configure({
    appenders: {
        console: {
            type: 'stdout', layout: {
                type: 'pattern',
                pattern: '%[[%d{MM-ddThh:mm:ss}][%5p]%c%]%m'
            }
        },
        console_restricted: {
            type: 'logLevelFilter',
            appender: 'console',
            level: process.env['LOG_LEVEL']
                ? process.env['LOG_LEVEL']?.toLowerCase() === 'all'
                    ? 'trace'
                    : process.env['LOG_LEVEL']
                : 'debug'
        }
    },
    categories: {
        default: {
            appenders: [
                'console_restricted'
            ],
            level: 'all'
        }
    }
});

export const createLogger = (name: string): log4js.Logger => {
    const logger = log4js.getLogger(`${name}`);
    if(process.env['testId']) {
        logger.addContext('testId', process.env['testId']);
    }
    return logger;
};