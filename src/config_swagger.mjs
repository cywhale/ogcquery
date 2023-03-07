'use strict'
const apiConf = {
    hideUntagged: true,
    swagger: {
      info: {
        title: 'ODB OGC WMS/WMTS API',
        description: '## **OGCQUERY** Manual\n' +
          '* This swagger-UI is just for trials of ODB OGC WMS/WMTS API.\n' +
          '* Specify url: OGC WMS/WMTS server URL and specify type: WMS or WMTS.\n' +
          '* Specify layer (optional): Filter layer name or fuzzy-matched by wildcard*.\n' +
          '* Ouput includes layers: name of layers, service: general info, and capability: capabilities info.*',
        version: '1.0.0'
      },
      host: 'api.odb.ntu.edu.tw',
      schemes: ['https'],
      consumes: ['application/json'],
      produces: ['application/json'],
    },
}

export const uiConf = {
    routePrefix: '/ogcquery',
    staticCSP: true,
    transformStaticCSP: (header) => header,
    uiConfig: {
      validatorUrl: null,
      docExpansion: 'full', //'list',
      deepLinking: false
    }
}

export default apiConf

