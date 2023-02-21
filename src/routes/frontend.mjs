import Helmet from '@fastify/helmet'
import { join } from 'desm'

export default async function (fastify, opts) {
  fastify.register(Helmet, {
    crossOriginEmbedderPolicy: false, //https://github.com/helmetjs/helmet/issues/343
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'", "https:"],
        //frameAncestors: [],
        frameSrc: ["'self'"],
        scriptSrc: ["'self'", "https:", "'unsafe-eval'"],
        connectSrc: ["'self'", "https:"],
        imgSrc: ["'self'", "https:", "data:"],
        //styleSrc: ["'self'","'unsafe-inline'"]
      }
    }
  })
}

