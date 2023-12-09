const { Sequelize, DataTypes } = require('sequelize');
const sequelize = require('../index'); 

const Submission = sequelize.define('Submission', {
  id: {
    type: DataTypes.UUID,
    defaultValue: Sequelize.UUIDV4,
    primaryKey: true,
    readOnly: true
  },
  assignment_id: {
    type: DataTypes.UUID,
    allowNull: false,
    readOnly: true
  },
  submission_url: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  submission_date: {
    type: DataTypes.DATE,
    defaultValue: Sequelize.NOW,
    readOnly: true
  },
  submission_updated: {
    type: DataTypes.DATE,
    defaultValue: Sequelize.NOW,
    readOnly: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
  }
});

module.exports = Submission;