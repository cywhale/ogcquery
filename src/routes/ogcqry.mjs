import { parse } from 'arraybuffer-xml-parser'

export const autoPrefix = '/ogcquery/v1'

export default async function ogcqry (fastify, opts, next) {
  const supportedOgcServices = ['WMS', 'WMTS']

  const ogcqrySchemaObj = {
    type: 'object',
    properties: {
      url: { type: 'string',
             description: 'URL of WMS/WMTS server. Example: https://neo.gsfc.nasa.gov/wms/wms',
      },
      service: { type: 'string',
             description: 'QGC service type, supported WMS or WMTS',
             enum: supportedOgcServices
      },
      layer: { type: 'string',
             description: 'QGC WMS/WMTS layer name (case-insensitive). Example: GEBCO_BATHY, and can be fuzzy-matched by using wildcard *, e.g. *bathy',
      },
    },
    required: ['url', 'service']
  }

  const getCapabilities = async (url, service) => {
    const capabilitiesUrl = `${url}?service=${service}&request=GetCapabilities`
    fastify.log.info("Fetch OGC capability url: " + capabilitiesUrl)
    try {
      const res = await fetch(capabilitiesUrl)
      if (!res.ok) {
        throw new Error({
          statusCode: 404,
          cause: { res },
          message: 'Fail to fetch URL capabilities'
        })
        //throw new ResponseError('Fail to fetch URL capabilities', res)
      }

      const xml = await res.text()
      let jbody = parse(xml, { arrayMode: false })
      return jbody

    } catch (err) {
      fastify.log.error(err)
      throw new Error({
        statusCode: err.response.status,
        //cause: { err.cause },
        message: err.message
      })
    }
  }

  const getSingleLayer = (layer, service = "WMS", isMulti = false, bbox0 = [], pattern = '') => {
    let layx, bbox, re, isLayerNotNum //when layer is numbered, use title to filter fuzzy_matched layer-inputs
    let key_prefix = service === 'WMS' ? '' : 'ows:'
    let key_title = service === 'WMS' ? 'Title' : `${key_prefix}Identifier`
    let key_layname = service === 'WMS' ? 'Name' : `${key_prefix}Identifier`
    let key_bbox = service === 'WMS' ? 'BoundingBox' : `${key_prefix}WGS84BoundingBox`

    if (layer[key_layname] === undefined && layer.Layer) { //some layer name have value 0 <- so cannot use !layx[key_layname]
        layx = layer.Layer
    } else {
        layx = layer
    }

    if (layx[key_layname] === undefined) {
        //console.log("Error layer: ", layx)
        return null
    } else {
        if (pattern && pattern.trim() !== '') {
            let patx = pattern.trim()
            let fuzzyFlag = patx.indexOf('*')
            if (fuzzyFlag < 0 && layx[key_layname].toLowerCase() !== patx.toLowerCase()) {
                return null
            } else if (fuzzyFlag >= 0) {
                patx = decodeURIComponent(patx).replace(/\*/g, '(.*)')
                re = new RegExp(`^${patx}$`, "i")
                isLayerNotNum = isNaN(parseInt(layx[key_layname]))
                if (!isLayerNotNum) {
                    if (!re.test(layx[key_title])) {
                        return null
                    }
                } else if (!re.test(layx[key_layname])) {
                    return null
                }
            }
        }
    }

    if (service === 'WMS' && !layx[key_bbox]) {
        bbox = bbox0
    } else if (service === 'WMS') {
        if (Array.isArray(layx[key_bbox])) {
            bbox = [layx[key_bbox][0]['$minx'], layx[key_bbox][0]['$miny'],
                    layx[key_bbox][0]['$maxx'], layx[key_bbox][0]['$maxy']]
        } else {
            bbox = [layx[key_bbox]['$minx'], layx[key_bbox]['$miny'],
                    layx[key_bbox]['$maxx'], layx[key_bbox]['$maxy']]
        }
    } else if (service === 'WMTS') {
        bbox = [...layx[key_bbox]['ows:LowerCorner'].split(' ').map(Number),
                ...layx[key_bbox]['ows:UpperCorner'].split(' ').map(Number)]
    }

    let itemx = {
        name: layx[key_layname],
        title: layx[key_title],
        bbox: bbox,
        dimension: layx.Dimension ?? '',
        //crs: layx.CRS,
        //abstract: layx.Abstract,
        //keywords: [...layx.KeywordList.Keyword],
        //attribution: `${layx.Attribution.Title}: ${layx.Attribution.OnlineResource['$xlink:href']}`
    }
    if (service === 'WMTS') {
        itemx = {
            ...itemx,
            format: layx.Format,
            template: layx.ResourceURL['$template'],
            TileMatrixSet: Array.isArray(layx.TileMatrixSetLink) ? layx.TileMatrixSetLink[0].TileMatrixSet : layx.TileMatrixSetLink.TileMatrixSet,
        }
        /*if (isMulti) {
            if (layx[`${key_prefix}Metadata`]) {
              emx = {
                ...itemx,
                MtadataURL: layx[`${key_prefix}Metadata`][0]['$xlink:href']
              }
            }
          }*/
    }
    return itemx
  }

  const parseUrl = (requrl) => {
      let qurlx = decodeURIComponent(requrl).replace(/(^"|^'|"$|'$)/g, '')
      fastify.log.info("Incoming req url: " + qurlx)
      try {
        const qryurl = new URL(qurlx)
        return qryurl

      } catch (err) {
        fastify.log.info(err) // => TypeError, "Failed to construct URL: Invalid URL"
        reply.code(400).send(new Error(err))
      }
  }

  fastify.route({
    url: '/capability',
    method: ['GET'],
    schema: {
      description: 'Query OGC WMS/WMTS capabilities',
      tags: ['OGC'],
      querystring: ogcqrySchemaObj,
    /*response: {
        200:{
          type: 'array',
          items: capaJsonSchema
        },
        400: {
          type: 'object',
          properties: {
          statusCode: { type: 'number' },
          code: { type: 'string' },
          error: { type: 'string' },
          message: { type: 'string' },
          time: { type: 'string' }
        }
      }*/
    },
    handler: async (req, reply) => {
  // test example
  // 'https://neo.gsfc.nasa.gov/wms/wms'
  // 'https://ecodata.odb.ntu.edu.tw/geoserver/marineheatwave/wms'
  // 'https://server.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/WMTS'
  // 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/wmts.cgi' //multilayer wmts
      const qryurl = parseUrl(req.query.url)
      const selectedService = req.query.service.toUpperCase() //'wmts'.toUpperCase()
      if (!supportedOgcServices.includes(selectedService)) {
        let err = "Not support: " + selectedService + " yet for OGC service type"
        fastify.log.info(err)
        reply.code(400).send(new Error(err))
      }
      const pattern = req.query.layer??''

      const url = qryurl.href //discard hash and search

      let data = await getCapabilities(url, selectedService)

      let key_capabilities = selectedService === 'WMS' ? 'WMS_Capabilities' : 'Capabilities'
      let key_prefix = selectedService === 'WMS' ? '' : 'ows:'
      let key_content = selectedService === 'WMS' ? 'Capability' : 'Contents'
      let key_meta = selectedService === 'WMS' ? 'Service' : `${key_prefix}ServiceIdentification`

      let capa = data[key_capabilities]
      //let services = capa[key_meta]
      let layerobj = capa[key_content].Layer //Object.entries(capa.Capability.Layer)
      //let key_title = selectedService === 'WMS' ? 'Title' : `${key_prefix}Identifier`
      //let key_layname = selectedService === 'WMS' ? 'Name' : `${key_prefix}Identifier`
      let key_bbox = selectedService === 'WMS' ? 'BoundingBox' : `${key_prefix}WGS84BoundingBox`
      //let key_metaurl = selectedService === 'WMS' ? 'MetadataURL' : `${key_prefix}Metadata`
      //let key_dataurl = selectedService === 'WMS' ? 'DataURL' : //??

      //console.log("Capabilities: ", capa)
      //console.log("Services: ", services)
      //console.log("Layers: ", layerobj)
      let layers
      if (selectedService === 'WMS') {
        layers = layerobj.Layer
      } else {
        layers = layerobj
      }

      let isMultiLay = Array.isArray(layers)
      if (!isMultiLay && typeof layers === 'object' && layers.hasOwnProperty('Layer')) {
        layers = layers.Layer
        isMultiLay = Array.isArray(layers) // that's some XML has nested structure: Layer:{,..,Layer:[]}
      }

      let result = [], layx, layy, itemx
      let bbox0 = []
      let layername = []
      if (selectedService === 'WMS' && isMultiLay && layerobj[key_bbox]) { //Note if like aboving nested structure, may have no bbox0
        bbox0 = [layerobj[key_bbox]['$minx'], layerobj[key_bbox]['$miny'],
                 layerobj[key_bbox]['$maxx'], layerobj[key_bbox]['$maxy']]
      }

      if (isMultiLay) {
        for (let i = 0; i < layers.length; i++) {
          layx = layers[i]
          if (selectedService === 'WMS' && isMultiLay && layx.Layer && Array.isArray(layx.Layer)) {
            for (let j = 0; j < layx.Layer.length; j++) {
                layy = layx.Layer[j]
                itemx = getSingleLayer(layy, selectedService, isMultiLay, bbox0, pattern)
                if (itemx) {
                  result.push(itemx)
                  layername.push(itemx.name)
                }
            }
          } else {
            itemx = getSingleLayer(layx, selectedService, isMultiLay, bbox0, pattern)
            if (itemx) {
              result.push(itemx)
              layername.push(itemx.name)
            }
          }
        }
      } else {
        itemx = getSingleLayer(layers, selectedService, isMultiLay, bbox0, pattern)
        if (itemx) {
          result.push(itemx)
          layername.push(itemx.name)
        }
      }

      let output = {
        layers: layername,
        service: capa[key_meta],
        capability: result
      }
      reply.send(output)
    }
  })

  next()
}
