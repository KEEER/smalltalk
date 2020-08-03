const _ = require('lodash')

exports.applyHomeRoutes = router => {
  router.get('/', async ctx => {
    if (!ctx.requireLogin()) return
    const allChannels = {
      channels: _.fromPairs((await ctx.db.all('SELECT name, description FROM channels;')).map(({ name, description }) => [ name, description ])),
      ignores: (await ctx.db.all('SELECT channel FROM ignores WHERE username = $u;', { $u: ctx.state.username })).map(res => 'channels.' + res.channel),
    }
    const channels = _.omit(allChannels, allChannels.ignores).channels
    await ctx.render('index', { channels })
  })
}
