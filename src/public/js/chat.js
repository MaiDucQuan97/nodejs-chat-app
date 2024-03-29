import h from './helpers.js';

$(window).on( 'load', () => {
    $(window).keydown(function(event){
        if(event.keyCode == 13) {
          event.preventDefault();
          return false;
        }
    });

    let editMessageId = '',
        userList = [],
        selectedUserId = '',
        selectedUsername = '',
        currentUserId = '',
        callingFrom = '',
        callingType = '',
        currentUser = {}

    const socket = io();
    if (Notification.permission !== 'granted') {
        Notification.requestPermission();
    }

    const sendMessage = function () {
        let messageValue = $('#message').val()

        if ($.trim(messageValue) == '') {
            alert('Please enter name and message!!');
        } else {
            if (!selectedUserId && userList.length !== 0) {
                selectedUserId = userList[currentUserId].id
                selectedUsername = userList[currentUserId].username
            }

            socket.emit('sendMessage', {
                message: messageValue,
                id: editMessageId,
                toId: selectedUserId,
                toUsername: selectedUsername
            });
            $('#message').val('');
        }
    }

    const uploadFile = function (files) {
        let originalFileNames = []

        if (!selectedUserId && userList.length !== 0) {
            selectedUserId = userList[currentUserId].id
            selectedUsername = userList[currentUserId].username
        }
        
        Object.keys(files).forEach((key) => {
            let file = files[key]
            originalFileNames[key] = file.name
        })

        socket.emit("upload", {
            files, 
            originalFileNames,
            toUsername: selectedUsername
        });
    }

    socket.on("newMessage", function ({ messageData, from, to }) {
        const id = messageData.id,
            isEdit = messageData.isEdit,
            message = messageData.message,
            username = messageData.username,
            createdAt = messageData.createdAt

        let messageId = h.generateElementId('message__container', id),
            messageTemplateElm = $('#message-template'),
            messagesElm = $('#messages')

        if (isEdit) {
            $(`#${messageId} .message__content`).text(message)
        } else {
            const html = Mustache.render(messageTemplateElm.html(), {
                id: id,
                username,
                message,
                createdAt: moment(createdAt).format('h:mm a'),
                type_text: true,
                type_image: false
            })

            messagesElm.append(html)
        }

        if (!isEdit) {
            h.addTriggerMessageActions(id)
        }

        h.scrollToBottom(true)
    })

    socket.on('updateReactions', (data) => {
        const { messageId, reactions } = data;
        let reactionsId = h.generateElementId('message__reactions', messageId),
            reactionIconList = h.generateElementId('message__reactionlist', messageId),
            reactionsElement = $(`#${reactionsId}`),
            reactionIconListElement = $(`#${reactionIconList}`)

        if (reactionsElement) {
            const reactionCount = {};
            reactions.forEach((reaction) => {
                if (reactionCount.hasOwnProperty(reaction.reaction)) {
                    reactionCount[reaction.reaction]++;
                } else {
                    reactionCount[reaction.reaction] = 1;
                }
            });
            reactionsElement.text(`(${reactionCount.like || 0} Like, ${reactionCount.love || 0} Love, ${reactionCount.haha || 0} Haha, ${reactionCount.wow || 0} Wow, ${reactionCount.sad || 0} Sad, ${reactionCount.angry || 0} Angry)`);
            reactionIconListElement.css("opacity", 0)
            isShowReactionList = false
        }
    });

    socket.on('users', (users) => {
        users.sort((a, b) => {
            if (currentUserId && a.id === currentUserId) return -1;
            if (currentUserId && b.id === currentUserId) return 1;
            if (a.username < b.username) return -1;
            return a.username > b.username ? 1 : 0;
        });

        users.forEach((user) => {
            userList[user.id] = user;
        });

        let userTemplateElm = $('#user-template'),
            userListElm = $('#user-list')

        const html = Mustache.render(userTemplateElm.html(), { users: users })

        userListElm.empty()
        userListElm.append(html)

        currentUser = userList[currentUserId]
        $('.info__image img').attr('alt', currentUser.username)
        $('.info__image img').attr('src', currentUser.avatar)
        $('.info__username span').text(currentUser.username)

        $('#user-list .user').on('click', function (e) {
            let messageTemplateElm = $('#message-template'),
                messagesElm = $('#messages'),
                messagesHtml = '',
                listMessageIds = []

            e.preventDefault()
            selectedUserId = $(this).attr('id')
            selectedUsername = $(this).find('span').text()

            messagesElm.empty()
            $.ajax({
                type: 'GET',
                url: '/user/me/messages',
                data: {
                    recipientUsername: selectedUsername
                },
                success: function (response) {
                    $('.chat-nav').toggle(selectedUserId !== currentUserId)

                    if (response.length !== 0) {
                        response.forEach((message) => {
                            if (message.type == 'file') {
                                let uploadedFiles = message.content ? JSON.parse(message.content) : [],
                                    imageFiles = [],
                                    otherFiles = [];

                                uploadedFiles.forEach((file) => {
                                    if (file.fileType === 'image') {
                                        imageFiles.push(file);
                                    } else {
                                        otherFiles.push(file);
                                    }
                                });
                                
                                messagesHtml += Mustache.render(messageTemplateElm.html(), {
                                    id: message.messageId,
                                    username: message.senderUsername,
                                    message: '',
                                    createdAt: moment(message.sentAt).format('h:mm a'),
                                    imageFiles: imageFiles,
                                    otherFiles: otherFiles
                                })
                            } else {
                                messagesHtml += Mustache.render(messageTemplateElm.html(), {
                                    id: message.messageId,
                                    username: message.senderUsername,
                                    message: message.content,
                                    createdAt: moment(message.sentAt).format('h:mm a'),
                                    type_text: true
                                })
                            }

                            listMessageIds.push(message.messageId)
                        })

                        messagesElm.append(messagesHtml)

                        listMessageIds.forEach((id) => {
                            h.addTriggerMessageActions(id)
                        })

                        h.scrollToBottom()

                        h.addScrollToBottomButton()
                    }
                },
                error: function (xhr, status, error) {
                    alert(error);
                }
            });
        })
    })

    socket.on('currentUserId', (userID) => {
        currentUserId = userID;
    });

    socket.on('generateNewSubscription', async (publicKey) => {
        if ('serviceWorker' in navigator && 'PushManager' in window) {
            navigator.serviceWorker
                .register('js/service-worker.js')
                .then((registration) => {
                    registration.pushManager
                        .getSubscription()
                        .then((existSubscription) => {
                            if (existSubscription) {
                                existSubscription.unsubscribe();
                            }
                        })

                    return registration.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: h.urlBase64ToUint8Array(publicKey),
                    });
                }).then((subscription) => {
                    socket.emit('subscribe', subscription);
                }).catch((error) => {
                    console.error('Error subscribing for push notifications:', error);
                    if (!error.toString().includes("permission denied")) {
                        location.reload()
                    }
                });
        }
    });

    socket.on('uploadResponse', (messageData) => {
        let messageTemplateElm = $('#message-template'),
            messagesElm = $('#messages'),
            uploadFileElement = '',
            uploadedFiles = messageData.content ? JSON.parse(messageData.content) : [],
            imageFiles = [],
            otherFiles = [],
            loadedImg = messagesElm.find("img");

        uploadedFiles.forEach((file) => {
            if (file.fileType === 'image') {
                imageFiles.push(file);
            } else {
                otherFiles.push(file);
            }
        });
            
        uploadFileElement += Mustache.render(messageTemplateElm.html(), {
            id: message.messageId,
            username: message.senderUsername,
            message: '',
            createdAt: moment(message.sentAt).format('h:mm a'),
            imageFiles: imageFiles,
            otherFiles: otherFiles
        })

        messagesElm.append(uploadFileElement)

        h.scrollToBottom(false, loadedImg.length)
    });

    socket.on('incommingCall', ({ from, type}) => {
        const ringtone = $('#ringtone'),
              callerName = $('#caller-name');

        callerName.text(userList[from].username)
        $('.chat__callnotification').css('display', 'flex')
        $('#calling-notification').hide()
        $('#incomming-call-notification').show()
        ringtone[0].play();

        callingFrom = from
        callingType = type
    })

    socket.on('cancelIncommingCall', () => {
        const callerName = $('#caller-name');

        callerName.text(null)
        h.hideAllCallingNotification()

        callingFrom = ''
    })

    socket.on('callRejected', () => {
        h.hideAllCallingNotification()
    })

    socket.on('callAnswered', (to) => {
        h.hideAllCallingNotification()

        let redirectUrl = `/video?toUserId=${to}&fromUserId=${currentUserId}&callingType=${callingType}`
        window.location.replace(redirectUrl)
    })

    $("#message").on("keypress", function(event) {
        if (event.key === "Enter") {
            event.preventDefault();
        }
    })

    $(document).on("click", ".call", (event) => {
        const clickedElementId = event.currentTarget.id;

        socket.emit('calling', {
            from: currentUserId,
            to: selectedUserId,
            type: clickedElementId
        })

        callingType = clickedElementId
        $('.chat__callnotification').css('display', 'flex')
        $('#incomming-call-notification').hide()
        $('#calling-notification').show()
    })

    $(document).on("click", "#cancel-call", () => {
        h.hideAllCallingNotification()
        socket.emit('cancelCalling', {
            from: currentUserId,
            to: selectedUserId
        })
    })
    
    $(document).on("click", "#reject-call", () => {
        h.hideAllCallingNotification()
        socket.emit('rejectIncommingCalling', callingFrom)
    })

    $(document).on("click", "#answer-call", () => {
        h.hideAllCallingNotification()

        socket.emit('answerIncommingCalling', {from: callingFrom, to: currentUserId})  

        setTimeout(() => {
            let redirectUrl = `/video?toUserId=${callingFrom}&fromUserId=${currentUserId}&callingType=${callingType}`
            window.location.replace(redirectUrl)
        }, 2000)
    })

    $(document).on("click", ".info_settings button", () => {
        let settingsTemplateElm = $('#settings-template'),
            chatElm = $('#chat'),
            settingElm = $('#settings')

        if (settingElm.length === 0) {
            const html = Mustache.render(settingsTemplateElm.html())

            chatElm.append(html)
        } else {
            settingElm.remove()
        }
    })

    $(document).on("click", "#user-info button", () => {
        let userSettingsPopupTemplate = $('#user-settings-popup-template'),
            chatElm = $('#chat')

        const html = Mustache.render(userSettingsPopupTemplate.html(), {
            username: currentUser.username,
            email: currentUser.email,
            avatar: currentUser.avatar
        })

        chatElm.append(html)
        $('#settings').remove()
    })

    $(document).on("click", "#closePopupBtn", () => {
        $('#user-settings-popup').remove()
    })

    $("#sendMessage").on("click", function (e) {
        e.preventDefault()
        sendMessage()
        if (editMessageId) {
            $('.message').css('background-color', '')
            $("#message").css('background-color', '')
            editMessageId = ''
        }
    })

    $(document).on("click", '#logout-btn', function () {
        $('#settings').remove()
        h.logout()
    })

    $(document).on("change", "#changePasswordCheckbox", () => {
        let passwordFields = $("#passwordFields"),
            currentPasswordInput = $("#currentPassword"),
            newPasswordInput = $("#newPassword"),
            confirmPasswordInput = $("#confirmPassword");

        passwordFields.toggle();

        if (!passwordFields.is(":visible")) {
            currentPasswordInput.val("");
            newPasswordInput.val("");
            confirmPasswordInput.val("");
        }
    })

    $('#openInputFileButton').on("click", function () {
        $('#fileInput').click();
    })

    $('#fileInput').on("input", function () {
        uploadFile(this.files);
    })

    $(document).on('click', function(event) {
        let settingElm = $('#settings'),
            infoSettingsElm = $('.info_settings button')

        if (
            !settingElm.is(event.target) && !settingElm.has(event.target).length &&
            !infoSettingsElm.is(event.target) && !infoSettingsElm.has(event.target).length
        ) {
            settingElm.remove()
        }
    })

    $(document).on("click", "#uploadAvatarBtn", (e) => {
        e.preventDefault()
        $('#avatar').click()
    })

    $(document).on("change", "#avatar", (event) => {
        const file = event.target.files[0];

        if (file) {
            const reader = new FileReader();

            reader.onload = function() {
                $("#avatarImage").attr("src", reader.result);
            };

            reader.readAsDataURL(file);
        }
    })

    $(document).on("submit", "#user-settings-form", (event) => {
        event.preventDefault();

        let username = $('#username').val(),
            changePasswordCheckbox = $('#changePasswordCheckbox').is(':checked'),
            newAvatarFile = $("#avatar")[0].files[0]

        const formData = new FormData();
        formData.append("username", username);
        formData.append("avatar", newAvatarFile);
        formData.append("changePasswordCheckbox", changePasswordCheckbox);


        if (changePasswordCheckbox) {
            let currentPassword = $('#currentPassword').val(),
                newPassword = $('#newPassword').val(),
                confirmPassword = $('#confirmPassword').val()

            formData.append("currentPassword", currentPassword);
            formData.append("newPassword", newPassword);
            formData.append("confirmPassword", confirmPassword);

            if (newPassword !== confirmPassword) {
                alert('New password and confirm password do not match.');
                return;
            }
        }

        $.ajax({
            type: 'POST',
            url: '/user/update',
            data: formData,
            processData: false,
            contentType: false,
            success: function (response) {
                $('#user-settings-popup').remove()
                alert('Change user settings successfully!')
                h.logout()
            },
            error: function (xhr, status, error) {
                console.log(xhr.responseText)
                alert('Change user settings fail. Please try again.')
            }
        });
    })
})
