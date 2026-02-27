const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.json({ status: 'alive' });
});

app.get('/api/test', (req, res) => {
  res.json({ message: 'test route works' });
});

app.listen(3000, () => {
  console.log('Test server running on 3000');
});
