// Structured Logger Utility
const logger = {
  info: (action, data) => console.log(JSON.stringify({ timestamp: new Date(), level: 'INFO', action, ...data })),
  error: (action, error, data) => console.error(JSON.stringify({ timestamp: new Date(), level: 'ERROR', action, error: error.message, ...data })),
  warn: (action, data) => console.warn(JSON.stringify({ timestamp: new Date(), level: 'WARN', action, ...data }))
};

export default logger;
