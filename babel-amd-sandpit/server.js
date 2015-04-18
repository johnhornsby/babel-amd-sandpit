var express = require('express');
var app = express();

app.use(express.static('public'));

console.log("Express HTTP Server Running on http://localhost:3000");
console.log("Listening...");

app.listen(3000);