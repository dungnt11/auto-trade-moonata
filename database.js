const { createPool } = require('mysql');

const CONFIG = {
  DATA_HOST: '128.199.96.244',
	DATA_USER: 'root',
	DATA_PASS: 'Xinchao@123!',
	DATA_DB: 'auto_trade',
	DATA_PORT: 3306,
}

const pool = createPool({
  host: CONFIG.DATA_HOST,
  user: CONFIG.DATA_USER,
  password: CONFIG.DATA_PASS,
  database: CONFIG.DATA_DB,
  port: CONFIG.DATA_PORT,
  connectionLimit: 10
});

module.exports = pool;