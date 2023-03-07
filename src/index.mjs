'use strict'
import Fastify from 'fastify'
import Env from '@fastify/env'
import { join } from 'desm'
import configSecServ from './confighttps.mjs'
import srvapp from './srvapp.mjs'
import Swagger from '@fastify/swagger'
import SwaggerUI from '@fastify/swagger-ui'
import apiConf, { uiConf } from './config_swagger.mjs'

const startServer = async () => {
  const PORT = process.env.PORT || 3403;
  const {key, cert, allowHTTP1} = await configSecServ()
  const fastify = Fastify({
      http2: true,
      trustProxy: true,
      https: {key, cert, allowHTTP1},
      requestTimeout: 5000,
      logger: true,
      ajv: {
        customOptions: {
          coerceTypes: 'array'
        }
      }
  })

  fastify.register(Env, {
    dotenv: {
      path: join(import.meta.url, '../config', '.env'),
    },
    schema: {
      type: 'object',
      required: ['DOMAIN'],
      properties: {
        DOMAIN: { type: 'string' },
      }
    }
  }).ready((err) => {
    if (err) console.error(err)
  })

  await fastify.register(Swagger, apiConf)
  await fastify.register(SwaggerUI, uiConf)
  await fastify.register(srvapp)

  fastify.listen({ port: PORT }, function (err, address) {
    if (err) {
      fastify.log.error(err)
      process.exit(1)
    }
    fastify.log.info(`server listening on ${address}`)
  })
}

startServer()
