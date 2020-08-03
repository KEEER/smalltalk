require('dotenv').config()

const Koa = require('koa')
const Router = require('@koa/router')
const renderEjs = require('koa-ejs')
const _ = require('lodash')
const consola = require('consola')
const Database = require('sqlite-async')
const path = require('path')
const { readFile } = require('fs').promises

const { applyHomeRoutes } = require('./routes/home')
const { applyUserRoutes } = require('./routes/user')
const { applyChannelRoutes } = require('./routes/channel')

const isDev = process.env.NODE_ENV === 'development'

const app = new Koa()
renderEjs(app, {
  root: path.join(__dirname, 'view'),
  layout: 'layout',
  viewExt: 'ejs',
  cache: !isDev,
})
{
  const renderFn = app.context.render
  app.context.render = function (path, scope, ...args) {
    scope = _.clone(scope) || _.create(null)
    _.assign(scope, { ctx: this, _, process })
    if (!('error' in scope)) scope.error = null
    return renderFn.call(this, path, scope, ...args)
  }
}
app.context.requireLogin = function () {
  if (!this.state.username) return this.redirect('/log-in'), false
  return true
}

const router = new Router()

applyHomeRoutes(router)
applyUserRoutes(router)
applyChannelRoutes(router)

app.use(async (ctx, next) => {
  const token = ctx.cookies.get(process.env.TOKEN_COOKIE_NAME)
  if (!token) {
    ctx.state.username = null
    return next()
  }
  const res = await ctx.db.get('SELECT username FROM sessions WHERE token = \'' + token + '\';')
  ctx.state.username = (res && res.username) || null
  return next()
})
app.use(router.allowedMethods()).use(router.routes())

; (async () => {
  const db = await Database.open(process.env.DATABASE || ':memory:')
  app.context.db = db
  try {
    const { version } = await db.get('SELECT version FROM version;')
    consola.info(`Database found with scheme version ${version}.`)
  } catch (e) {
    if (e.message.includes('no such table: version')) {
      // initialize
      consola.info('Initializing database...')
      const initScript = (await readFile(path.resolve(__dirname, 'sql/init.sql'))).toString()
      await db.exec(initScript)
      consola.info('Done.')
    } else throw e
  }

  // clear sessions timed out
  setInterval(async () => {
    try { await db.run('DELETE FROM sessions WHERE expiry < $now;', { $now: Date.now() }) }
    catch (e) {
      consola.error('Error clearing sessions:')
      consola.error(e)
    }
  }, 60000)

  app.listen(process.env.PORT || 8080, process.env.HOST || '0.0.0.0')
  consola.ready({ message: 'Server ready.', badge: true })
})().catch(e => {
  consola.fatal(e)
  process.exit(-1)
})
