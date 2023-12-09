const bunyan = require('bunyan');

const logger = bunyan.createLogger({
  name: 'myapp',
  streams: [
    {
      level: 'info',
      path: '/var/log/webapp/webapp.log' 
    },
    {
      level: 'error',
      path: '/var/log/webapp/webapp.log'  
    }
  ]
});

module.exports = logger;