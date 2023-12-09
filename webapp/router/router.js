const express = require('express');
const Assignment = require('../database/models/assigments');
const Account = require('../database/models/account');
const Submission = require('../database/models/submission');
const bcrypt = require('bcrypt');
const logger = require('../logger');
const { SNS } = require('@aws-sdk/client-sns');
const router = express.Router();

const sns = new SNS({
  region: 'us-east-1'
});

const authenticateUser = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Basic ')) {
      return res.status(401).json('Authorization header is missing or not in Basic format.');
  }

  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
  const [email, password] = credentials.split(':');
  
  const user = await Account.findOne({ where: { email: email } });

  if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json('Unauthorized');  
  }
  req.user = user; 
  return next();
};

//Get all
router.get('/v1/assignments', authenticateUser, async (req, res) => {
  req.statsd.increment('api.assignments.get_all.call_count');
  const assignments = await Assignment.findAll();
  logger.info('Got assignments!');
  res.json(assignments);
});

//Create assignment
router.post('/v1/assignments', authenticateUser, async (req, res) => {
  req.statsd.increment('api.assignments.create.call_count');
  const assignmentData = req.body;
  const email = req.user.email;
  assignmentData.email = email;
  try {
    const assignment = await Assignment.create(assignmentData);
    logger.info('Created assignments!');
    res.status(201).json(assignment);
  } catch (error) {
    logger.error(error);
    res.status(400).json({ message: error.message });
  }
});

//Get one
router.get('/v1/assignments/:id', authenticateUser, async (req, res) => {
  req.statsd.increment('api.assignments.get_one.call_count');
  const assignment = await Assignment.findByPk(req.params.id);
  const email = req.user.email;
  if (assignment && assignment.email !== email) {
    logger.warn('Not authenticated!');
    res.status(403).json({ message: 'Forbidden' });
  }else if(assignment && assignment.email === email){
    logger.info('Found assignments!');
    res.json(assignment).status(200);
  } else {
    logger.error('No content!');
    res.status(404).json({ message: 'Assignment not found' });
  }
});

//Update one
router.put('/v1/assignments/:id', authenticateUser, async (req, res) => {
  req.statsd.increment('api.assignments.update.call_count');
  const assignmentData = req.body;
  const email = req.user.email;
  const assignment = await Assignment.findByPk(req.params.id);

  if (assignment && assignment.email !== email) {
    logger.warn('Not authenticated!');
    res.status(403).json({ message: 'Forbidden' });
  }else if(assignment && assignment.email === email){
    await assignment.update(assignmentData);
    logger.info('Updated assignments!');
    res.json(assignment);
  }else {
    logger.error('No content!');
    res.status(204).json({ message: 'No Content' });
  }
});

//Delete one
router.delete('/v1/assignments/:id', authenticateUser, async (req, res) => {
  req.statsd.increment('api.assignments.delete.call_count');
  const assignment = await Assignment.findByPk(req.params.id);
  const email = req.user.email;

  if (assignment && assignment.email !== email) {
    logger.warn('Not authenticated!');
    res.status(403).json({ message: 'Forbidden' });
  }else if(assignment && assignment.email === email){
    await assignment.destroy();
    logger.info('Deleted assignments!');
    res.status(204).send({ message: 'No Content' });
  }else {
    logger.error('No content!');
    res.status(404).json({ message: 'Assignment not found' });
  }
});

//create submission
router.post('/v1/assignments/:id/submission', authenticateUser, async (req, res) => {
  req.statsd.increment('api.submission.create.call_count');
  const submissionData = req.body;
  const email = req.user.email;
  submissionData.assignment_id = req.params.id;
  submissionData.email = email;
  const assignment = await Assignment.findByPk(req.params.id);
  const currentDate = new Date();
  try {

    const numOfAttemptByUser = await Submission.count({
      where: {
        email: email,
        assignment_id: req.params.id
      }
    });

    if(!assignment){
      res.status(404).json({ message: 'Assignment not found.' });
    } else if(assignment && numOfAttemptByUser + 1 > assignment.num_of_attemps) {
      res.status(403).json({ message: 'Forbidden: The number of attempts for this assignment has exceeded the limit.' });
    } else if(assignment && assignment.deadline < currentDate) {
      res.status(403).json({ message: 'Forbidden: Your submission is too late.' });
    } else{
      const submission = await Submission.create(submissionData);
      
      const message = {
        data: {
          submission_id: submission.id,
          submission_url: submission.submission_url,
          assignment_id: submission.assignment_id,
          submission_email: email
        }
      };

      const publishParams = {
        Message: JSON.stringify(message), 
        TopicArn: process.env.SNS_ARN,
      };

      sns.publish(publishParams, (err, data) => {
        if (err) {
          logger.error('Error sending SNS message', err);
          res.status(500).json({ message: 'Error sending SNS message', error: err });
        } else {
          logger.info('Submission Accepted and SNS message sent!');
          res.status(201).json(submission);
        }
      });
    } 
  } catch (error) {
    logger.error(error);
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;