const express = require('express');
const { Client } = require('pg');
const csv = require('csv-parser');
const fs = require('fs');
const bcrypt = require('bcrypt');
const Account = require('./database/models/account');
const sequelize = require('./database');
const assignmentRoutes = require('./router/router');
const StatsD = require('node-statsd');

const logger = require('./logger');


const statsd = new StatsD({
  host: 'localhost', 
  port: 8125, 
  prefix: 'webapp.' 
});


const app = express();
const port = 8080;
app.use(express.json());
app.use((req, res, next) => {
  req.statsd = statsd; 
  next();
});
app.use(assignmentRoutes);


async function loadUsersFromCSV() {
    return new Promise((resolve, reject) => {
      const users = [];
      
      fs.createReadStream('./opt/users.csv')
        .pipe(csv())
        .on('data', (data) => {
          users.push(data);
        })
        .on('end', async () => {
          for (let user of users) {
            const hashedPassword = await bcrypt.hash(user.password, 10);
            await Account.findOrCreate({
              where: { email: user.email },
              defaults: {
                first_name: user.first_name,
                last_name: user.last_name,
                password: hashedPassword,
              }
            });
          }
          resolve();
        })
        .on('error', (error) => {
          reject(error);
        });
    });
  }


app.get('/healthz', async (req, res) => {
  statsd.increment('api.healthz.call_count');
  const client = new Client({
    host: process.env.DB_HOSTNAME,
    user: process.env.DB_USERNAME,
    port: process.env.DB_PORT,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  try {
    await client.connect();
    logger.info('Successfully connected!');
    res.status(200).set('Cache-Control', 'no-cache, no-store, must-revalidate').send();
  } catch (error) {
    logger.error(error);
    res.status(503).set('Cache-Control', 'no-cache, no-store, must-revalidate').send();
  } finally {
    await client.end();
  }
});

app.all('*', (req, res) => {
  statsd.increment('api.all_others.call_count');
  res.status(405).set('Cache-Control', 'no-cache, no-store, must-revalidate').send();
});

app.listen(port, async () => {
    try {
      await sequelize.authenticate();
      await sequelize.sync({ alter: true });
      await loadUsersFromCSV();
      console.log('Database connected and models synced.');
      console.log(`Server is running at http://localhost:${port}`);
    } catch (error) {
      console.error('Unable to connect to the database:', error);
    }
  });


  module.exports = app; 
