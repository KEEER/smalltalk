const koaBody = require('koa-body')
const consola = require('consola')
const path = require('path')
const { copyFile, readFile, stat } = require('fs').promises
const { exec } = require('child_process')
const { hooks } = require('../hooks')

// you definitely won't want to see them so I have wrote them in a not-so-straightforward manner
const badWords = [
  String.fromCharCode(102, 117, 99, 107),
  String.fromCharCode(20667, 36924),
]

exports.applyChannelRoutes = router => {
  router.get('/create-channel', async ctx => {
    if (!ctx.requireLogin()) return
    await ctx.render('create-channel')
  })
  router.post('/create-channel', koaBody(), async ctx => {
    if (!ctx.requireLogin()) return
    if (!ctx.request.body) ctx.request.body = {}
    const { name, description } = ctx.request.body
    if (!name) return ctx.status = 400
    try {
      await ctx.db.run('INSERT INTO channels (name, description, admin) VALUES ($n, $d, $a);', { $n: name, $d: description, $a: ctx.state.username })
      return ctx.redirect(`/channel/${name}/`)
    } catch (e) {
      return await ctx.render('create-channel', { error: 'duplicate' })
    }
  })

  router.get('/channel/:name/', async ctx => {
    if (!ctx.requireLogin()) return
    const { name } = ctx.params
    const channelRes = await ctx.db.get('SELECT description, admin FROM channels WHERE name = $name;', { $name: name })
    if (!channelRes) return ctx.status = 404
    const { description, admin } = channelRes
    const messagesQuery = `SELECT
      messages.id, messages.username, messages.time, messages.message, messages.star_count, stars.username as starred
      FROM messages LEFT JOIN stars ON messages.id = stars.message_id AND stars.username = $u
      WHERE messages.channel = $c
      ORDER BY messages.time DESC LIMIT 1024;`
    const messages = await ctx.db.all(messagesQuery, { $c: name, $u: ctx.state.username })
    await ctx.render('channel', { description, messages, title: `${name} - channels`, isAdmin: admin === ctx.state.username, admin })
  })

  router.post('/channel/:name/message', koaBody(), async ctx => {
    if (!ctx.requireLogin) return
    const { name } = ctx.params
    const channelRes = await ctx.db.get('SELECT name FROM channels WHERE name = $name;', { $name: name })
    if (!channelRes) return ctx.status = 404
    if (!ctx.request.body) ctx.request.body = {}
    const message = ctx.request.body.message && ctx.request.body.message.trim()
    if (!message) return ctx.redirect(`/channel/${name}/`)
    const state = {
      emit: !badWords.some(x => message.toLowerCase().includes(x)), // ban bad words
      ...ctx.request.body,
    }
    await hooks.emit('sanitize-message', state)
    if (!state.emit) {
      await ctx.db.run(
        'INSERT INTO messages (channel, username, time, message) VALUES ($c, \'smallbot\', $t, $m);',
        { $c: name, $t: Date.now(), $m: `A message sent by '${ctx.state.username}' (${state}) has been removed.` }
      )
      return ctx.redirect(`/channel/${name}/`)
    }
    await ctx.db.run('INSERT INTO messages (channel, username, time, message) VALUES ($c, $u, $t, $m);', { $c: name, $u: ctx.state.username, $t: Date.now(), $m: message })
    if (message.startsWith('/')) {
      const args = message.substring(1).split(' ')
      const reply = []
      switch (args[0]) {
        case 'help':
          reply.push('Hi! Try these commands:', '/hello', '/ping bing.com', '/calc 1 + Math.sin(Math.PI / Math.fibonacci(4))', '/time')
          break
        case 'hello':
          reply.push('Hello World!')
          break
        case 'time':
          reply.push(`Unix: ${Math.floor(Date.now() / 1000)} | ISO: ${new Date().toISOString()}`)
          break
        case 'ping': {
          if (args.length !== 2) {
            reply.push('Sorry, you can only ping 1 address at a time!')
            break
          }
          const pingArgs = process.platform === 'win32' ? '-n 1 -w 1000' : '-c 1 -W 1'
          exec(`ping ${pingArgs} ${args[1]}`, (_e, out) => ctx.db.run('INSERT INTO messages (channel, username, time, message) VALUES ($c, \'smallbot\', $t, $m);', { $c: name, $t: Date.now(), $m: out.toString() }))
          break
        }
        case 'calc': {
          const expr = args.slice(1).join(' ')
          if (expr.replace(/(?:Math(?:\.\w+)?)|[()+\-*/&|^%<>=,?:]|(?:\d+\.?\d*(?:e\d+)?)| /g, '') !== '') {
            reply.push('Sorry, I cannot calculate this expression.')
          } else {
            Math.fibonacci = n => {
              if (n < 3) return 1
              let fib = 1
              let prev = 1
              for (let i = 2; i < n; i++) {
                ; [ prev, fib ] = [ fib, fib + prev ]
              }
              return fib
            }
            reply.push(eval(expr))
            delete Math.fibonacci
          }
          break
        }
      }
      for (const message of reply.reverse()) {
        await ctx.db.run('INSERT INTO messages (channel, username, time, message) VALUES ($c, \'smallbot\', $t, $m);', { $c: name, $t: Date.now(), $m: message })
      }
    }
    ctx.redirect(`/channel/${name}/`)
  })

  router.get('/channel/:name/star/:id', async ctx => {
    if (!ctx.requireLogin()) return
    const { name, id } = ctx.params
    const channelRes = await ctx.db.get('SELECT name FROM channels WHERE name = $name;', { $name: name })
    if (!channelRes) return ctx.status = 404
    const messageRes = await ctx.db.get('SELECT id FROM messages WHERE id = $m AND channel = $c;', { $m: id, $c: name })
    if (!messageRes) return ctx.status = 404
    await ctx.db.transaction(db => Promise.all([
      db.run('UPDATE messages SET star_count = star_count + 1 WHERE id = $id;', { $id: id }),
      db.run('INSERT INTO stars (message_id, username) VALUES ($m, $u);', { $m: id, $u: ctx.state.username }),
    ]))
    ctx.redirect(`/channel/${name}/`)
  })

  router.get('/channel/:name/unstar/:id', async ctx => {
    const { name, id } = ctx.params
    const channelRes = await ctx.db.get('SELECT name FROM channels WHERE name = $name;', { $name: name })
    if (!channelRes) return ctx.status = 404
    const messageRes = await ctx.db.get('SELECT id FROM messages WHERE id = $m AND channel = $c;', { $m: id, $c: name })
    if (!messageRes) return ctx.status = 404
    await ctx.db.transaction(db => Promise.all([
      db.run('UPDATE messages SET star_count = star_count - 1 WHERE id = $id;', { $id: id }),
      db.run('DELETE FROM stars WHERE message_id = $m AND username = $u;', { $m: id, $u: ctx.state.username }),
    ]))
    ctx.redirect(`/channel/${name}/`)
  })

  router.get('/channel/:name/delete/:id', async ctx => {
    if (!ctx.requireLogin()) return
    const { name, id } = ctx.params
    const channelRes = await ctx.db.get('SELECT admin FROM channels WHERE name = $name;', { $name: name })
    if (!channelRes) return ctx.status = 404
    if (!channelRes.admin) {
      ctx.body = 'You could not delete this message as you are not the admin of this channel.'
      return ctx.status = 403
    }
    if (!await ctx.db.transaction(async db => {
      if (!await db.get('SELECT id FROM messages WHERE channel = $c AND id = $m;', { $c: name, $m: id })) return false
      await db.run('DELETE FROM messages WHERE channel = $c AND id = $m;', { $c: name, $m: id })
      return true
    })) return ctx.status = 404
    ctx.redirect(`/channel/${name}/`)
  })

  router.post('/channel/:name/upload', koaBody({ multipart: true, formidable: { maxFileSize: 2 * 1024 ** 3 } }), async ctx => {
    if (!ctx.requireLogin()) return
    const { name } = ctx.params
    const channelRes = await ctx.db.get('SELECT name FROM channels WHERE name = $name;', { $name: name })
    if (!channelRes) return ctx.status = 404
    if (!ctx.request.files) return ctx.status = 400
    const { file } = ctx.request.files
    if (Array.isArray(file)) {
      ctx.status = 400
      return ctx.body = 'We do not support multiple file uploading now.'
    }
    if (!file) return ctx.redirect(`/channel/${name}/`)
    file.name = file.name.replace(/.exe/g, '') // reduce malware
    await copyFile(file.path, path.resolve(process.env.FILE_PATH, file.name))
    const message = `(File) ${file.name}`
    await ctx.db.run('INSERT INTO messages (channel, username, time, message) VALUES ($c, $u, $t, $m);', { $c: name, $u: ctx.state.username, $t: Date.now(), $m: message })
    return ctx.redirect(`/channel/${name}/`)
  })

  router.post('/channel/:name/ignore', async ctx => {
    if (!ctx.requireLogin()) return
    const { name } = ctx.params
    const channelRes = await ctx.db.get('SELECT name FROM channels WHERE name = $name;', { $name: name })
    if (!channelRes) return ctx.status = 404
    await ctx.db.run('INSERT INTO ignores (channel, username) VALUES ($c, $u);', { $c: name, $u: ctx.state.username })
    return ctx.redirect('/')
  })

  router.get('/file/:name', async ctx => {
    if (!ctx.requireLogin()) return
    const { name } = ctx.params
    const filePath = path.resolve(process.env.FILE_PATH, name)
    try { await stat(filePath) }
    catch (e) {
      if (e.code === 'ENOENT') return ctx.status = 404
      consola.warn(e)
      return ctx.status = 418
    }
    const file = await readFile(filePath)
    ctx.set('Content-Disposition', `attachment; filename="${name}"`)
    ctx.body = file
  })
}
