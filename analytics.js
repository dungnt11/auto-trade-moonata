const db = require("./database");

db.query(
  `select * from analytics WHERE count >= 3`,
  [],
  (error, results) => {
    if (error) {
      console.log(error);
    } else {
      const obj = {};

      results.forEach((e, i) => {
        if (typeof obj[e.count] === 'undefined') {
          obj[e.count] = {
            prev: {},
            next: {},
          }
        }

        if (results[i - 1]) {
          obj[e.count].prev[results[i - 1].count] = (obj[e.count].prev[results[i - 1].count] || 0) + 1;
        }

        if (results[i + 1]) {
          obj[e.count].next[results[i + 1].count] = (obj[e.count].next[results[i + 1].count] || 0) + 1;
        }
      });

      console.log(obj);
    }
  }
);