const request = require('supertest');
const app = require('./server');  

describe('Integration test for /healthz endpoint', () => {
  it('should return a 200 status code', async () => {
    const response = await request(app).get('/healthz');
    expect(response.statusCode).toBe(200);
  });
});