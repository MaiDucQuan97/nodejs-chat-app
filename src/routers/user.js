const express = require('express')
const User = require('../models/user')
const Message = require('../models/message')
const auth = require('../middleware/auth')
const bcrypt = require('bcryptjs')
const router = express.Router()

router.post('/user/create', async (req, res) => {
    try {
        const user = await User(req.body)
        // await user.generateAuthToken()

        await user.save()
        res.send(user)
    } catch (error) {
        res.status(400).send(error)
    }
})

const multer = require('multer')
const sharp = require('sharp')
const upload = multer({
    limits: {
        fileSize: 1000000
    },
    fileFilter(req, file, cb) {
        if (!file && !file.originalname.match(/\.(jpg|png|jpeg)$/)) {
            cb(new Error('Please upload a image file!'))
        }

        cb(undefined, true)
    }
})

router.post('/user/update', auth, upload.single('avatar'), async (req, res) => {
    try {
        const user = await User.findOne({username: req.body.username})
        let isUpdated = false;

        if (!user) {
            throw new Error('Not found user!')
        }

        if (JSON.parse(req.body.changePasswordCheckbox)) {
            const isMatch = await bcrypt.compare(req.body.currentPassword, user.password)

            if (!isMatch) {
                throw new Error('Current password is not correct!')
            }

            user.password = req.body.newPassword

            isUpdated = true;
        }

        if (req.file) {
            const buffer = await sharp(req.file.buffer).resize({ width: 250, height: 250 }).png().toBuffer()

            user.avatar = buffer

            isUpdated = true;
        }

        if (isUpdated) {
            await user.save()
        }
        res.send(user)
    } catch (error) {
        res.status(400).send(error)
    }
})

router.post('/user/logout', auth, (req, res) => {
    try {
        req.session.destroy((err) => {
            if (err) {
                console.error('Error destroying session:', err);
            } else {
                res.redirect('/login');
            }
        });
    } catch (error) {
        res.status(500).send()
    }
})

router.get('/user/me', auth, async (req, res) => {
    res.send(req.user)
})

router.post('/user/login', async (req, res) => {
    try {
        const user = await User.findByCredentials(req.body.username, req.body.password)
        const allUsers = await User.getAllUsers()

        req.session.isLoggedIn = true;
        req.session.user = user;
        req.session.allUsers = allUsers

        res.send({ user, isLoggedIn: true })
    } catch (e) {
        res.status(400).send(e)
    }
})

router.delete('/user/me/avatar', auth, async (req, res) => {
    req.user.avatar = undefined
    await req.user.save()
    res.send(req.user)
})

router.get('/user/me/messages', auth, async (req, res) => {
    try {
        let user = req.session.user,
            messages = await Message.getAllMessagesOfCurrentUser(user.username, req.query.recipientUsername)

        res.send(messages)
    } catch (error) {
        res.status(400).send(error)
    }
})

module.exports = router