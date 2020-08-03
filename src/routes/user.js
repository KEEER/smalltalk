const uuid = require('uuid').v4
const koaBody = require('koa-body')
const consola = require('consola')
const { randomBytes: randomBytesCb } = require('crypto')
const { promisify } = require('util')
const randomBytes = promisify(randomBytesCb)

const sessionExpiry = 86400 * 1000 // 1d

exports.applyUserRoutes = router => {
  router.get('/log-in', async ctx => {
    if (ctx.state.username) return ctx.redirect('/')
    await ctx.render('log-in')
  })
  router.get('/sign-up', async ctx => {
    if (ctx.state.username) return ctx.redirect('/')
    await ctx.render('sign-up')
  })

  const makeToken = async (ctx, username) => {
    const token = uuid()
    await ctx.db.run('INSERT INTO sessions (username, token, expiry) VALUES ($u, $token, $exp);', { $u: username, $token: token, $exp: Date.now() + sessionExpiry })
    ctx.cookies.set(process.env.TOKEN_COOKIE_NAME, token, { httpOnly: false })
  }

  router.post('/log-in', koaBody(), async ctx => {
    if (!ctx.request.body) ctx.request.body = {}
    const { username, password } = ctx.request.body
    if (!username || !password) return ctx.status = 400
    const res = await ctx.db.get('SELECT username FROM users WHERE ( username = $u OR email = $u ) AND password = $p;', { $u: username, $p: password })
    if (!res) return await ctx.render('log-in', { error: 'badCredentials' })
    await makeToken(ctx, res.username)
    return ctx.redirect('/')
  })

  router.post('/send-code', koaBody(), async ctx => {
    if (!ctx.request.body) ctx.request.body = ''
    try {
      const { email } = eval('(' + ctx.request.body + ')')
      const emailRe = /^(?:(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*)+|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])$/
      if (!email || !emailRe.test(email)) return ctx.status = 400
      const code = String((await randomBytes(8)).readUInt32BE() % 10000).padStart(4, '0')
      consola.info(`Email verification code ${code} should be sent to ${email}.`)
      return ctx.body = code
    } catch (e) {
      return ctx.status = 400
    }
  })
  router.post('/sign-up', koaBody(), async ctx => {
    if (!ctx.request.body) ctx.request.body = {}
    const { email, username, password } = ctx.request.body
    if (!username || !password) return ctx.status = 400
    await ctx.db.run('INSERT INTO users (username, email, password) VALUES ($u, $e, $p);', { $u: username, $e: email, $p: password })
    await makeToken(ctx, username)
    return ctx.redirect('/')
  })

  router.get('/password', async ctx => {
    if (!ctx.requireLogin()) return
    return await ctx.render('password')
  })
  router.post('/password', koaBody(), async ctx => {
    if (!ctx.requireLogin()) return
    if (!ctx.request.body) ctx.request.body = {}
    const { username, password } = ctx.request.body
    if (!password) return ctx.status = 400
    await ctx.db.run('UPDATE users SET password = $p WHERE username = $u;', { $u: username, $p: password })
    return ctx.redirect('/')
  })
}
