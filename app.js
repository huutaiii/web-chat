
const https = require('https')
const http = require('http')
const express = require('express')
const cookie_parser = require('cookie-parser')
const fs = require('fs')
const sio = require('socket.io')
const mysql = require('mysql')
const crypto = require('crypto')
const pug = require('pug')
const mysql_sync = require('sync-mysql')
const clean_css = require('clean-css')
const uglify_js = require('uglify-js')
const md = new (require('showdown')).Converter()
const JSON = require('circular-json')

const storage = 'site_data'
const passwd = '503c9482ffa94fc14c235c1378ce7c5dd61803ee272704deb18f05a12196dff5b8a61d606fc744b0cd48b1d031807da66daaf6fc4b8c6e39babf30155c562e490f2587abcd7eed5c1408d8881aae82c896b3ff290941550071650f4b939ed27de9632e1369650f45a095eb5d385279deb58d0be8cd1c100da1ea5930464c69b2'
const recaptcha_secret = fs.readFileSync(storage + '/reCAPTCHA_secretkey').toString().trim()
const recaptcha_sitekey = fs.readFileSync(storage + '/reCAPTCHA_sitekey').toString().trim()
const userid_max_age = 7
const num_init_msg = 32

const sql_options = JSON.parse(fs.readFileSync(storage + '/db_info.json').toString())
const sql = mysql.createConnection(sql_options)
const sql_sync = new mysql_sync(sql_options)

sql.connect(function(err) {
	if (err) throw err
	function kill_expired() {
		sql.query('delete from users where expire < current_timestamp()', null)
	}
	kill_expired()
	setInterval(kill_expired, 20000)
})

const options = {
	cert: fs.readFileSync(storage + '/fullchain.pem'),
	key: fs.readFileSync(storage + '/privkey.pem'),
	ca: fs.readFileSync(storage + '/chain.pem')
}

const app = new express()
app.use(cookie_parser())
app.use(express.json())
app.use(express.urlencoded())
app.use(express.static('static'))
server = new https.createServer(options, app)

const chat_js = uglify_js.minify(fs.readFileSync('html/chat.js', 'utf-8').toString())
const chat_css = new clean_css({}).minify(fs.readFileSync('html/chat.css').toString())

const chat_html = (pug.compileFile('html/chat.pug'))({
	css: chat_css.styles,
	js: chat_js.code,
})

app.get('/uhh', function(req, res) {
	if (req.cookies.user_id) {
		sql.query('select user_id from users', (err, result) => {
			if (err) {
				res.send('wtf')
				throw err
			} else {
				let ids = result.map(o => o.user_id)
				if (ids.indexOf(req.cookies.user_id) > -1) {
					res.cookie('user_id', req.cookies.user_id, {
						secure: true,
						max_age: userid_max_age * 8.64e+7,
					})
					sql.query(
						'update users set expire = adddate(current_timestamp(), ?) where user_id = ?',
						[userid_max_age, req.cookies.user_id],
						null
					)
					res.send(chat_html)
				} else {
					res.clearCookie('user_id')
					res.redirect('/uhhhh')
				}
			}
		})
	} else {
		res.redirect('/uhhhh')
	}
})

const _login_template = pug.compileFile('html/login.pug')
function login_template(locals) {
	return _login_template({
		sitekey: recaptcha_sitekey,
		...locals,
	})
}

app.get('/uhhhh', function(req, res) {
	let username
	if (req.cookies.user_id) {
		result = sql_sync.query('select name from users where user_id = ?', [req.cookies.user_id])
		if(result[0] && result[0].name) {
			username = result[0].name
		}
	}
	res.send(login_template({
		username: username,
	}))
})

app.post('/uhhhh', function(req, res) {
	if (JSON.stringify(req.body) === JSON.stringify({})) {
		res.send('wtf')
	} else {
		let username
		if (req.cookies.user_id) {
			result = sql_sync.query(
				'select name from users where user_id = ?',
				[req.cookies.user_id]
			)
			if(result[0] && result[0].name) {
				username = result[0].name
			}
		}
		if (req.body['g-recaptcha-response'])
		{
			const post_data = `secret=${recaptcha_secret}&response=${req.body['g-recaptcha-response']}`
			const apt_req = https.request({
				hostname: 'www.google.com',
				port: 443,
				path: '/recaptcha/api/siteverify',
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					'Content-Length': post_data.length,
				}
			}, (api_res) => {
				api_res.on('data', (data_str) => {
					let data = JSON.parse(data_str)
					if (data['success']) {
						validate_form(req, res, username)
					} else {
						res.send(login_template({
							username: username,
							info_captcha: 'reCAPTCHA api call error'
						}))
					}
				})
			})
			apt_req.on('error', (e) => {
				console.log(`https request error: ${e}`)
			})
			apt_req.write(post_data)
			apt_req.end()
		} else {
			res.send(login_template({
				username: username,
				info_captcha: 'pls complete captcha'
			}))
		}
	}
	function validate_form(req, res, username) {
		let hash = crypto.pbkdf2Sync(req.body.passwd, 'salt', 1000, 128, 'sha512')
		if (hash.toString('hex') === passwd) {
			if (
				/(^(\p{L}|\p{N}|_|\.|-)*$)/u.test(req.body.name)
				&& req.body.name.trim().length > 0
			) {
				sql.query('select user_id, name from users', (err, result) => {
					if (err) {
						res.send('wtf')
						throw err
					} else {
						let names = result.map(o => o.name)
						if (names.indexOf(req.body.name) > -1) {
							res.send(login_template({
								username: username,
								info_name: 'name taken',
								saved_passwd: req.body.passwd
							}))
						} else {
							let ids = result.map(obj => obj.user_id)
							let id = crypto.randomBytes(16).toString('hex')
							while (ids.indexOf(id) > -1) {
								id = crypto.randomBytes(16).toString('hex')
							}
							sql.query(
								'insert into users (user_id, name, expire) values (?, ?, adddate(current_timestamp(), ?))',
								[id, req.body.name, userid_max_age],
								function (err, result) {
									if (err) {
										res.send('wtf')
										throw err
									} else {
										res.cookie(
											'user_id',
											id,
											{
												secure: true,
												max_age: userid_max_age * 8.64e+7
											}
										)
										res.redirect('/uhh')
										console.log(`new user: ${req.body.name}`)
									}
								}
							)
						}
					}
				})
			} else {
				res.send(login_template({
					username: username,
					info_name: 'invalid',
					saved_passwd: req.body.passwd
				}))
			}
		} else {
			res.send(login_template({
				username: username,
				info_passwd: 'wrong',
				saved_name: req.body.name
			}))
		}
	}
})

io = new sio(server);
let userlist = {}
io.on('connection', function(soc) {
	
	let cookies = soc.request.headers.cookie.split(';').map(s => s.trim().split('=')).reduce((cookies, pair) => {cookies[pair[0]] = pair.slice(1).join('='); return cookies}, {})

	let id
	let name

	if (cookies.user_id) {
		id = cookies.user_id
	} else {
		console.log('wtf')
		get_out()
	}

	const result = sql_sync.query('select name from users where user_id = ?', [id])
	if (result[0] && result[0].name) {
		name = result[0].name
		delete result
	} else {
		console.log('wtf')
		get_out()
	}

	console.log(`${name} connected`)
	soc.emit('username', name)
	userlist[id] = name
	broadcast_userlist()

	sql.query(
		'select * from (select * from messages order by id desc limit ?) sub order by id asc',
		[num_init_msg],
		function (err, result) {
			if (err) {
				throw err
			}
			let messages = []
			for (let i = 0; i < result.length; ++i) {
				messages[i] = {}
				messages[i].name = result[i].name
				messages[i].date = result[i].date
				messages[i].content = md.makeHtml(result[i].content)
				if (id && id === result[i].user) {
					messages[i].type = 'user'
				}
			}
			soc.emit('init', messages)
		}
	)

	soc.on('chat message', function(msg) {
		let content = msg.replace(/(<([^>]+)>)/ig,"")
		if (content.trim().length > 0) {
			console.log(`message received from ${name}: ${content}`)
			let chatmsg = md.makeHtml(content)
			soc.broadcast.emit('chat message', {
				name: name,
				content: chatmsg,
				date: (new Date()).toISOString(),
			})
			soc.emit('chat message', {
				name: name,
				content: chatmsg,
				type: 'user',
				date: (new Date()).toISOString(),
			})
			sql.query(
				'insert into messages (name, content, user, date) values (?, ?, ?, current_timestamp())',
				[name, content, id],
				(err, result) => {
					if (err) {
						throw err
					}
				}
			)
		}
	})

	soc.on('disconnect', function() {
		console.log(`${name} disconnected`)
		delete userlist[id]
		broadcast_userlist()
	})

	function get_out() {
		soc.emit('redirect', '/uhhhh')
		soc.disconnect(true)
	}

	function broadcast_userlist() {
		let users = Object.keys(userlist).map(key => userlist[key])
		io.emit('userlist', users)
	}
})


server.listen(8443)

http.createServer(function (req, res) {
	res.writeHead(301, {
		Location: 'https://' + req.headers.host + req.url,
	})
	res.end()
}).listen(8080)

console.log('okay')
