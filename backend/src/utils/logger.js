// Structured Logger Utility
const logger = {
  info: (action, data) => console.log(JSON.stringify({ timestamp: new Date(), level: 'INFO', action, ...data })),
  error: (action, error, data) => console.error(JSON.stringify({
    timestamp: new Date(),
    level: 'ERROR',
    action,
    error: error instanceof Error ? error.message : (error ? String(error) : undefined),
    ...data
  })),
  warn: (action, data) => console.warn(JSON.stringify({ timestamp: new Date(), level: 'WARN', action, ...data }))
};

export default logger;
