import { parse } from 'arraybuffer-xml-parser'

export const autoPrefix = '/ogcquery'

export default async function ogcqry (fastify, opts, next) {
  const supportedOgcServices = ['WMS', 'WMTS']

  const ogcqrySchemaObj = {
    type: 'object',
    properties: {
      url: { type: 'string',
             description: 'URL of WMS/WMTS server, e.g. https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/wmts.cgi',
      },
      type: { type: 'string',
              description: 'OGC service type, e.g. WMTS (supported WMS or WMTS)',
              enum: supportedOgcServices
      },
      layer: { type: 'string',
               description: 'OGC WMS/WMTS layer name (case-insensitive), can be fuzzy-matched by wildcard *, e.g. *temperature',
      },
    },
    required: ['url', 'type']
  }

// version after 0.1.4, get different BBOX for different CRS
  const getWMSbbox = (bboxobj) => {
    let bbox = {}
    let crs = []
    let crskey = '$CRS' //ver0.1.5 for 'https://wms.nlsc.gov.tw/wms' has diff key $SRS
    if (Array.isArray(bboxobj)) {
        if (!bboxobj[0].hasOwnProperty(crskey) && bboxobj[0].hasOwnProperty('$SRS')) {
            crskey = '$SRS'
        }
        for (let i = 0; i < bboxobj.length; i++) {
            crs.push(bboxobj[i][crskey])
            bbox[crs[i]] = [bboxobj[i]['$minx'], bboxobj[i]['$miny'],
            bboxobj[i]['$maxx'], bboxobj[i]['$maxy']]
        }
    } else {
        if (!bboxobj.hasOwnProperty(crskey) && bboxobj.hasOwnProperty('$SRS')) {
            crskey = '$SRS'
        }
        crs.push(bboxobj[crskey])
        bbox[crs[0]] = [bboxobj['$minx'], bboxobj['$miny'],
        bboxobj['$maxx'], bboxobj['$maxy']]
    }
    return { bbox: bbox, crs: crs }
  }

  const getWMTSbbox = (layer) => {
    let bbox = {}
    let crs = []
    let key_bbox = 'ows:WGS84BoundingBox'
    if (layer.hasOwnProperty('ows:WGS84BoundingBox')) {
        crs.push('CRS:84')
        bbox['CRS:84'] = [...layer[key_bbox]['ows:LowerCorner'].split(' ').map(Number),
        ...layer[key_bbox]['ows:UpperCorner'].split(' ').map(Number)]
    }
    if (layer.hasOwnProperty('ows:BoundingBox')) {
        key_bbox = 'ows:BoundingBox'
        let crsidx = layer[key_bbox]['$crs'].indexOf('crs:')
        let crstxt = layer[key_bbox]['$crs'].substr(crsidx + 4).replace('::', ':')
        if (crstxt !== 'OGC:2:84' || !layer.hasOwnProperty('ows:WGS84BoundingBox')) {
            if (crstxt === 'OGC:2:84') {
                crstxt = 'CRS:84'
            }
            crs.push(crstxt)
            bbox[crstxt] = [...layer[key_bbox]['ows:LowerCorner'].split(' ').map(Number),
            ...layer[key_bbox]['ows:UpperCorner'].split(' ').map(Number)]
        }
    }
    return { bbox: bbox, crs: crs }
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

  const copyWmtsDimenItems = (dimen) => {
    const { 'ows:Identifier': name, Value, Default = null, 'ows:UOM': unit = null, ...objx } = dimen
    return objx
  }

  const copyWmsDimenItems = (dimen, serviceType) => {
    const { $name, '#text': Value, $default = null, $units = null, ...objx } = dimen
    return objx
  }

  const copyWmtsLegendItems = (legend) => {
    const { '$xlink:href': link, '$xlink:type': type = null, $format = null, $width = null, $height = null, ...objx } = legend
    return objx
  }

  const copyWmsLegendItems = (legend) => {
    const { Format = null, $width = null, $height = null, OnlineResource: { ...resrcx } = {}, ...objx } = legend
    return objx
  }

  const getSingleLayer = (layer, service = "WMS", isMulti = false, bbox0 = [], pattern = '') => {
    let layx, bbox, re, isLayerNotNum //when layer is numbered, use title to filter fuzzy_matched layer-inputs
    let stylex, legendx, tmplegendx
    let key_prefix = service === 'WMS' ? '' : 'ows:'
    let key_title = service === 'WMS' ? 'Title' : `${key_prefix}Identifier`
    let key_layname = service === 'WMS' ? 'Name' : `${key_prefix}Identifier`
    //let key_bbox = service === 'WMS' ? 'BoundingBox' : `${key_prefix}WGS84BoundingBox` //modified after v0.1.4

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

    let key_bbox = 'BoundingBox'
    let copyLegendFunc = service === 'WMTS' ? copyWmtsLegendItems : copyWmsLegendItems
    if (service === 'WMS') {
        if (!layx[key_bbox]) {
            bbox = bbox0
        } else {
            bbox = getWMSbbox(layx[key_bbox])
/*modified after v0.1.4
        if (Array.isArray(layx[key_bbox])) {
            bbox = [layx[key_bbox][0]['$minx'], layx[key_bbox][0]['$miny'],
                    layx[key_bbox][0]['$maxx'], layx[key_bbox][0]['$maxy']]
        } else {
            bbox = [layx[key_bbox]['$minx'], layx[key_bbox]['$miny'],
                    layx[key_bbox]['$maxx'], layx[key_bbox]['$maxy']]
        }
*/
        }
        if (layx.Style) {
            if (Array.isArray(layx.Style)) {
                for (let i = 0; i < layx.Style.length; i++) {
                    if (layx.Style[i].Name === 'default') {
                        stylex = { default: 'default' }
                        if (layx.Style[i].LegendURL) {
                            legendx = layx.Style[i].LegendURL
                        }
                        break
                    }
                }
                if (!stylex) {
                    stylex = { example: layx.Style[0].Name }
                    if (layx.Style[0].LegendURL) {
                        legendx = layx.Style[0].LegendURL
                    }
                }
            } else {
                stylex = { default: layx.Style.Name }
                if (layx.Style.LegendURL) {
                    legendx = layx.Style.LegendURL
                }
            }

            if (legendx) {
                if (Array.isArray(legendx)) {
                    stylex["legend"] = Array.from({ length: legendx.length })
                    for (let j = 0; j < legendx.length; j++) {
                        tmplegendx = copyLegendFunc(legendx[j])
                        stylex["legend"][j] = {
                            link: legendx[j].OnlineResource["$xlink:href"],
                            type: legendx[j].OnlineResource["$xlink:type"] ?? '',
                            format: legendx[j].Format,
                            width: legendx[j]['$width'],
                            height: legendx[j]['$height'],
                            ...tmplegendx
                        }
                    }
                } else {
                    tmplegendx = copyLegendFunc(legendx)
                    stylex["legend"] = [{
                        link: legendx.OnlineResource["$xlink:href"],
                        type: legendx.OnlineResource["$xlink:type"] ?? '',
                        format: legendx.Format,
                        width: legendx['$width'],
                        height: legendx['$height'],
                        ...tmplegendx
                    }]
                }
            }
        } //else {
          //  console.log("No style provided in WMS layer: ", layx)
        //}
    } else if (service === 'WMTS') {
        bbox = getWMTSbbox(layx)
/*      bbox = [...layx[key_bbox]['ows:LowerCorner'].split(' ').map(Number),
                ...layx[key_bbox]['ows:UpperCorner'].split(' ').map(Number)]*/
        if (layx.Style) {
            if (Array.isArray(layx.Style)) {
                for (let i = 0; i < layx.Style.length; i++) {
                    if (layx.Style[i]['$isDefault']) {
                        stylex = { default: layx.Style[i]['ows:Identifier'] }
                        if (layx.Style[i].LegendURL) {
                            legendx = layx.Style[i].LegendURL
                        }
                        break
                    }
                    if (!stylex) {
                        stylex = { example: layx.Style[0]['ows:Identifier'] }
                        if (layx.Style[0].LegendURL) {
                            legendx = layx.Style[0].LegendURL
                        }
                    }
                }
            } else {
                if (layx.Style['$isDefault']) {
                    stylex = { default: layx.Style['ows:Identifier'] }
                    if (layx.Style.LegendURL) {
                        legendx = layx.Style.LegendURL
                    }
                } //else {
                  //  console.log("Warning: Non-default style in layx: ", layx.Style)
                //}
            }

            if (legendx) {
                if (Array.isArray(legendx)) {
                    stylex["legend"] = Array.from({ length: legendx.length })
                    for (let j = 0; j < legendx.length; j++) {
                        tmplegendx = copyLegendFunc(legendx[j])
                        stylex["legend"][j] = {
                            link: legendx[j]["$xlink:href"],
                            type: legendx[j]["$xlink:type"] ?? '',
                            format: legendx[j]['$format'],
                            width: legendx[j]['$width'],
                            height: legendx[j]['$height'],
                            ...tmplegendx
                        }
                    }
                } else {
                    tmplegendx = copyLegendFunc(legendx)
                    stylex["legend"] = [{
                        link: legendx["$xlink:href"],
                        type: legendx["$xlink:type"] ?? '',
                        format: legendx['$format'],
                        width: legendx['$width'],
                        height: legendx['$height'],
                        ...tmplegendx
                    }]
                }
            }
        }
    }

    let dimenx = {}, tmpdimenx //after ver0.1.7: add dimension support 202304
    let dimenName = service === 'WMTS' ? 'ows:Identifier' : '$name'
    let copyDimenFunc = service === 'WMTS' ? copyWmtsDimenItems : copyWmsDimenItems
    if (layx.Dimension) {
        if (Array.isArray(layx.Dimension)) {
            for (let i = 0; i < layx.Dimension.length; i++) {
                tmpdimenx = copyDimenFunc(layx.Dimension[i])
                dimenx[layx.Dimension[i][dimenName]] = {
                    value: service === 'WMTS' ? layx.Dimension[i]['Value'] : layx.Dimension[i]['#text'],
                    default: service === 'WMTS' ? (layx.Dimension[i]['Default'] ?? '') : (layx.Dimension[i]['$default'] ?? ''),
                    unit: service === 'WMTS' ? (layx.Dimension[i]['ows:UOM'] ?? '') : (layx.Dimension[i]['$units'] ?? ''),
                    ...tmpdimenx
                }
            }
        } else {
            tmpdimenx = copyDimenFunc(layx.Dimension)
            dimenx[layx.Dimension[dimenName]] = {
                value: service === 'WMTS' ? layx.Dimension['Value'] : layx.Dimension['#text'],
                default: service === 'WMTS' ? (layx.Dimension['Default'] ?? '') : (layx.Dimension['$default'] ?? ''),
                unit: service === 'WMTS' ? (layx.Dimension['ows:UOM'] ?? '') : (layx.Dimension['$units'] ?? ''),
                ...tmpdimenx
            }
        }
    }


    let itemx = {
        name: layx[key_layname],
        title: layx[key_title],
        bbox: bbox.bbox, //bbox //modified after v0.1.4
        crs: bbox.crs,
        dimension: dimenx,      //layx.Dimension ?? '', //modified after v0.1.7
        style: stylex ?? {},    //after version 0.1.6 added, 202304
        //crs: layx.CRS,
        //abstract: layx.Abstract,
        //keywords: [...layx.KeywordList.Keyword],
        //attribution: `${layx.Attribution.Title}: ${layx.Attribution.OnlineResource['$xlink:href']}`
    }
    if (service === 'WMTS') {
        let formatx //may be 'image/png', 'image/jpeg',..
        let tmplidx = -1 //find tmplate index
        if (Array.isArray(layx.Format)) {
            formatx = layx.Format
        } else {
            formatx = [layx.Format]
        }

        let templatex = Array.from({ length: formatx.length })
        if (Array.isArray(layx.ResourceURL)) {
          for (let i = 0; i < layx.ResourceURL.length; i++) {
            if (formatx[i] && layx.ResourceURL[i]['$format'] === formatx[i]) {
              templatex[i] = layx.ResourceURL[i]['$template']
            } else {
              tmplidx = formatx.indexOf(layx.ResourceURL[i]['$format'])
              if (tmplidx >= 0) {
                if (templatex[tmplidx]) { console.log("Warning: find repeated foramt/template setting: ", formatx[tmplidx]) }
                templatex[tmplidx] = layx.ResourceURL[i]['$template']
              } else {
                console.log("Warning: cannot find corresponding foramt/template setting: ", layx.ResourceURL[i]['$format'])
              }
            }
            if (!templatex.includes(undefined)) break
          }
        } else {
          templatex = [layx.ResourceURL['$template']]
        }

        itemx = {
            ...itemx,
            format: formatx, //layx.Format,
            template: templatex, //layx.ResourceURL['$template'],
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
      let qurlx = decodeURIComponent(requrl).replace(/(^"|^'|"$|'$|\?(.*)$)/g, '')
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
      const selectedService = req.query.type.toUpperCase() //'wmts'.toUpperCase()
      if (!supportedOgcServices.includes(selectedService)) {
        let err = "Not support: " + selectedService + " yet for OGC service type"
        fastify.log.info(err)
        reply.code(400).send(new Error(err))
      }
      const pattern = req.query.layer??''

      const url = qryurl.href //discard hash and search

      let data = await getCapabilities(url, selectedService)

      //let key_capabilities = selectedService === 'WMS' ? 'WMS_Capabilities' : 'Capabilities'
      //ver0.1.5 for 'https://wms.nlsc.gov.tw/wms'has diff key WMT_MS_Capabilities
      let key_capabilities = Object.keys(data)[0]
      let key_prefix = selectedService === 'WMS' ? '' : 'ows:'
      let key_content = selectedService === 'WMS' ? 'Capability' : 'Contents'
      let key_meta = selectedService === 'WMS' ? 'Service' : `${key_prefix}ServiceIdentification`

      let capa = data[key_capabilities]
      //let services = capa[key_meta]
      let layerobj = capa[key_content].Layer //Object.entries(capa.Capability.Layer)
      //let key_title = selectedService === 'WMS' ? 'Title' : `${key_prefix}Identifier`
      //let key_layname = selectedService === 'WMS' ? 'Name' : `${key_prefix}Identifier`
      //let key_bbox = selectedService === 'WMS' ? 'BoundingBox' : `${key_prefix}WGS84BoundingBox` //modified after v0.1.4
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
      let key_bbox = 'BoundingBox'
      let bbox0 //= [] //modified after v0.1.4
      let layername = []
      if (selectedService === 'WMS' && isMultiLay && layerobj[key_bbox]) { //Note if like aboving nested structure, may have no bbox0
        bbox0 = getWMSbbox(layerobj[key_bbox])
/*      bbox0 = [layerobj[key_bbox]['$minx'], layerobj[key_bbox]['$miny'],
                 layerobj[key_bbox]['$maxx'], layerobj[key_bbox]['$maxy']]*/
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

      let serviceinfo = capa[key_meta]
      if (selectedService === 'WMTS') { //add for WMTS after v0.1.4
        if (capa.hasOwnProperty('ows:ServiceProvider')) {
          serviceinfo['ows:ServiceProvider'] = capa['ows:ServiceProvider']
        }
      /*if (capa.hasOwnProperty('ows:OperationsMetadata')) {
          serviceinfo['OperationsMetadata'] = capa['ows:OperationsMetadata']
        }
        if (capa.hasOwnProperty('ServiceMetadataURL')) {
          serviceinfo['ServiceMetadataURL'] = capa['ServiceMetadataURL']
        }*/
        if (capa.Contents && capa.Contents.hasOwnProperty('TileMatrixSet')) {
          let tilematrixset = capa.Contents.TileMatrixSet
          let tileset = {}, tilemat
          if (tilematrixset) {
            if (Array.isArray(tilematrixset)) {
                for (let i = 0; i < tilematrixset.length; i++) {
                    tilemat = []
                    for (let j = 0; j < tilematrixset[i].TileMatrix.length; j++) {
                        tilemat.push(tilematrixset[i].TileMatrix[j]['ows:Identifier'])
                    }
                    tileset[tilematrixset[i]['ows:Identifier']] = tilemat
                }
            } else {
                tilemat = []
                for (let j = 0; j < tilematrixset.TileMatrix.length; j++) {
                    tilemat.push(tilematrixset.TileMatrix[j]['ows:Identifier'])
                }
                tileset[tilematrixset['ows:Identifier']] = tilemat
            }
            serviceinfo['TileMatrixSet'] = tileset //capa.Contents['TileMatrixSet']
          }
        }
      }

      let output = {
        layers: layername,
        service: serviceinfo,
        capability: result
      }
      reply.send(output)
    }
  })

  next()
}
