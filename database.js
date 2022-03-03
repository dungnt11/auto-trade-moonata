const mysql = require('mysql2');

const connection = mysql.createConnection({
  host: '128.199.96.244',
  user: 'root',
  password: 'Xinchao@123!',
  database: 'auto_trade',
	port: 3306,
});

connection.connect(function (err) {
  if (err) throw err;
  console.log("Connected!");
});

module.exports = connection;