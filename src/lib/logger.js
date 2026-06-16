import pino from 'pino';
import { isProd } from './config.js';

export const logger = pino(
  isProd
    ? { level: 'info' }
    : {
        level: 'debug',
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'dd.mm.yyyy HH:MM:ss',
            ignore: 'pid,hostname',
          },
        },
      }
);
