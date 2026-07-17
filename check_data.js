const fs = require('fs');
const data = fs.readFileSync('data.js', 'utf8');
const cats = JSON.parse(data.replace('var CATS = ', '').replace(/;\n?$/, ''));
console.log('Men:', cats.men ? cats.men.items.length : 0);
console.log('Women:', cats.women ? cats.women.items.length : 0);
console.log('Kids:', cats.kids ? cats.kids.items.length : 0);
