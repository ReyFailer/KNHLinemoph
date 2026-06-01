import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/**
 * Share per-request globals into the Edge view scope so every
 * template can access `user`, `currentPath`, `csrfToken`, and
 * `flash` without each controller passing them explicitly.
 */
export default class ShareViewGlobalsMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    await ctx.auth.check()

    ctx.view.share({
      user: ctx.auth.user ?? null,
      currentPath: ctx.request.url(),
      csrfToken: ctx.request.csrfToken,
      flash: ctx.session.flashMessages.all(),
    })

    return next()
  }
}
