const { DataTypes, Model } = require('sequelize');
const sequelize = require('../'); 

class Assignment extends Model {}

Assignment.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false
  },
  points: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1,
      max: 10
    }
  },
  num_of_attemps: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1,
      max: 100
    }
  },
  deadline: {
    type: DataTypes.DATE,
    allowNull: false
  },
  assignment_created: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  assignment_updated: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  sequelize,
  modelName: 'Assignment',
  timestamps: true,
  createdAt: 'assignment_created',
  updatedAt: 'assignment_updated'
});

module.exports = Assignment; 