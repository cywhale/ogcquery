import AutoLoad from '@fastify/autoload'
import { join } from 'desm'

export default async function router (fastify, opts) {
  fastify.register(AutoLoad, {
      dir: join(import.meta.url, 'routes'),
      dirNameRoutePrefix: false,
      options: Object.assign({}, opts)
  })
}
