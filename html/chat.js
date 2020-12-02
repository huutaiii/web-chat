var socket = io()
var messages = document.getElementById('messages')
var username

function insertMsg(m) {
	var li = document.createElement('li')
	var user = document.createElement('div')
	user.className = m.type ? 'msg_name_' + m.type : 'msg_name'
	user.innerHTML = m.name
	var content = document.createElement('div')
	content.className = 'msg_content'
	content.innerHTML = m.content
	var date_e = document.createElement('div')
	var date = new Date(m.date)
	date_e.className = 'msg_date'
	if (date) {
		// var d = ('0' + date.getDate()).slice(-2)
		// var m = ('0' + (date.getMonth() + 1)).slice(-2)
		// var y = date.getFullYear()
		// var h = date.getHours()
		// var min = ('0' + date.getMinutes()).slice(-2)
		// var s = ('0' + date.getSeconds()).slice(-2)
		// date.innerHTML = y + '-' + m + '-' + d + ' ' + h + ':' + min + ':' + s
		date_e.innerHTML = date.toLocaleString()
	} else {
		date_e.innerHTML = 'wtf'
	}
	li.appendChild(user)
	li.appendChild(date_e)
	li.appendChild(content)
	messages.appendChild(li)
	messages.scrollTo(0, messages.scrollHeight)
}

socket.on('init', function(msg) {
	messages.innerHTML = ''
	for (var i = 0; i < msg.length; ++i) {
		insertMsg(msg[i])
	}
})

socket.on('chat message', function(msg) {
	insertMsg(msg)
})

socket.on('userlist', function(msg) {
	var username_li = document.getElementById('username')
	var topBar = document.getElementById('top-bar')
	topBar.innerHTML = ''
	topBar.appendChild(username_li)
	var index = msg.indexOf(username)
	if (index > -1) {
		msg.splice(index, 1)
	} else {
		console.log('wtf')
	}
	for (var i in msg) {
		var li = document.createElement('li')
		li.innerHTML = msg[i]
		topBar.appendChild(li)
	}
})

socket.on('username', function(msg) {
	username = msg
	document.getElementById('username').innerHTML = username
})

socket.on('redirect', function(msg) {
	window.location.href = msg
})

function submit() {
	var text = document.getElementById('m')
	if (text.value.length > 0) {
		socket.emit('chat message', text.value)
		text.value = ''
	}
}