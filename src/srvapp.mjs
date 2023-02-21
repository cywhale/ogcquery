//import AutoLoad from '@fastify/autoload'
import Cors from '@fastify/cors'
import { join } from 'desm'
import router from './router.mjs'

export default async function (fastify, opts) {
  fastify.decorate('conf', {
    //node_env: process.env.NODE_ENV || 'development',
    currver: 'v1'
  })
/*
  fastify.register(AutoLoad, {
    dir: join(import.meta.url, 'plugins'),
    options: Object.assign({}, opts)
  })*/
  fastify.register(Cors, (instance) => {
    return (req, callback) => {
      const corsOptions = {
        origin: true,
        credentials: true,
        preflight: true,
        preflightContinue: true,
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Keep-Alive', 'User-Agent',
                         'Cache-Control', 'Authorization', 'DNT', 'X-PINGOTHER', 'Range'],
        exposedHeaders: ['Content-Range'],
        maxAge: 86400,
      };
      if (/^localhost$/m.test(req.headers.origin)) {
        corsOptions.origin = false
      }
      callback(null, corsOptions)
    }
  })

  fastify.register(router)
}
