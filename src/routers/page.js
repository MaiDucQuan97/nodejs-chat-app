const path = require("path");
const express = require("express");
const router = express.Router()
const auth = require("../middleware/auth")
const isLoggedIn = require('../middleware/isLoggedIn')

router.get("/index", auth, function (req, res) {
    res.sendFile(path.join(__dirname + '/../templates/views/chat.html'));
});

router.get("/login", isLoggedIn, function (req, res) {
    res.sendFile(path.join(__dirname + '/../templates/views/login.html'));
})

router.get("/signup", isLoggedIn, function (req, res) {
    res.sendFile(path.join(__dirname + '/../templates/views/signup.html'));
})

module.exports = router