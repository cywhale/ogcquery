import { parse } from 'arraybuffer-xml-parser'
//import { fetch } from 'undici'

const url = //'https://neo.gsfc.nasa.gov/wms/wms'
    //'//https://ecodata.odb.ntu.edu.tw/geoserver/marineheatwave/wms'
    //'https://server.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/WMTS'
    //'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/wmts.cgi' //multilayer wmts
    'https://ecodata.odb.ntu.edu.tw/geoserver/gwc/service/wmts'
// other WMS
//'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi'
// layers is digit(0, 1,...) numbered, and multiple CRS
//'https://idpgis.ncep.noaa.gov/arcgis/services/NWS_Forecasts_Guidance_Warnings/NHC_Atl_trop_cyclones/MapServer/WmsServer'
//'https://idpgis.ncep.noaa.gov/arcgis/services/NWS_Forecasts_Guidance_Warnings/NHC_Atl_trop_cyclones/MapServer/WMSServer'
//'https://nowcoast.noaa.gov/geoserver/ndfd_wind/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities'
//'https://www.ncei.noaa.gov/thredds/wms/ncFC/fc-oisst-daily-avhrr-amsr-dly/OISST_Daily_AVHRR_AMSR_Feature_Collection_best.ncd'
//'https://nrt.cmems-du.eu/thredds/wms/global-analysis-forecast-bio-001-028-daily'
// CMEMS WMS: (SLA)
//'https://nrt.cmems-du.eu/thredds/wms/dataset-duacs-nrt-global-merged-allsat-phy-l4'
// other WMTS
//'https://wmts.nlsc.gov.tw/wmts' //only 3857, no WGS84
// other WMS
//'https://ecodata.odb.ntu.edu.tw/geoserver/ows'
//'https://wms.nlsc.gov.tw/wms' //only 3857, no WGS84 //has diff key $SRS and WMT_MS_Capabilities 


const selectedService = 'wmts'.toUpperCase() //'wmts'.toUpperCase()
const pattern = '*' //'*temperature'  //'*mhw*' //'*64*kt*wind*' //for title //'Aquarius_Sea_Surface_Salinity_L3_Monthly' //null //'*_M' //'blue*' //'*fire*'

const getWMSbbox = (bboxobj) => {
    let bbox = {}
    let crs = []
    let crskey = '$CRS'
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
    console.log("Url: ", capabilitiesUrl)
    const res = await fetch(capabilitiesUrl)
    const xml = await res.text()
    let jbody = parse(xml, { arrayMode: false })
    //console.log("XML to json: ", jbody)
    return jbody
}

let data = await getCapabilities(url, selectedService)
let key_capabilities = Object.keys(data)[0] //selectedService === 'WMS' ? 'WMS_Capabilities' : 'Capabilities'
let prefix_test = key_capabilities.indexOf(":")
let prefix_wms = prefix_test >= 0 ? key_capabilities.substring(0, prefix_test + 1) : ''
if (selectedService === 'WMS' && prefix_wms) {
    if (Object.keys(data[key_capabilities]).indexOf(`${prefix_wms}Service`) >= 0) {
        console.log("Warning: Note that now assume all WMS capabilities has the prefix: ", prefix_wms)
    } else { //if (key_capabilities.substring(prefix_test + 1) !== 'WMS_Capabilities') {
        prefix_wms = ""
        console.log("Warning: WMS seems has informal keys in XML: ", key_capabilities)
    }
}
let key_prefix = selectedService === 'WMS' ? prefix_wms : 'ows:'
let key_capa = selectedService === 'WMS' ? `${key_prefix}Capability` : 'Contents'
let key_meta = selectedService === 'WMS' ? `${key_prefix}Service` : `${key_prefix}ServiceIdentification`
let key_layer = selectedService === 'WMS' ? `${key_prefix}Layer` : `Layer`
let capa = data[key_capabilities]
let serviceinfo = capa[key_meta]
let layerobj = capa[key_content][key_layer] //Object.entries(capa.Capability.Layer)
//let key_title = selectedService === 'WMS' ? 'Title' : `${key_prefix}Identifier`
//let key_layname = selectedService === 'WMS' ? 'Name' : `${key_prefix}Identifier`
//let key_bbox = selectedService === 'WMS' ? 'BoundingBox' : `${key_prefix}WGS84BoundingBox`
//let key_metaurl = selectedService === 'WMS' ? 'MetadataURL' : `${key_prefix}Metadata`
//let key_dataurl = selectedService === 'WMS' ? 'DataURL' : //??
//console.log(data)
console.log("Capabilities: ", capa)
if (selectedService === 'WMTS') { console.log("TileMatrixSet: ", capa.Contents.TileMatrixSet) }
//console.log("TileMatrixSet item0: ", capa.Contents.TileMatrixSet.TileMatrix[0])
//console.log("TileMatrixSet item1: ", capa.Contents.TileMatrixSet[1].TileMatrix)
//console.log("Layers: ", layerobj)
//console.log("Layer-0: ", layerobj.Layer.Layer[0])
//console.log("Layer-0: ", layerobj.Layer[0].Layer[0]) //https://nowcoast.noaa.gov/arcgis
//console.log("Layer-0: ", layerobj.Layer[0])
//console.log("LegendURL.OnlineResource: ", layerobj.Layer[0].Style.LegendURL.OnlineResource)
//for (let i = 0; i < layerobj[0].Style.length; i++) {
//    console.log("Layer style", layerobj[0].Style[i])
//}

if (selectedService === 'WMTS') {
    if (capa.hasOwnProperty('ows:ServiceProvider')) {
        serviceinfo['ows:ServiceProvider'] = capa['ows:ServiceProvider']
    }
    /*if (capa.hasOwnProperty('ows:OperationsMetadata')) {
        serviceinfo['OperationsMetadata'] = capa['ows:OperationsMetadata']
    }
    if (capa.hasOwnProperty('ServiceMetadataURL')) {
        serviceinfo['ServiceMetadataURL'] = capa['ServiceMetadataURL']
    }*/
    console.log("Debug TileMatrixSet:", capa.Contents)
    if (capa.Contents && capa.Contents.hasOwnProperty('TileMatrixSet')) {
        let tilematrixset = capa.Contents.TileMatrixSet
        console.log("Debug TileMatrixSet:", tilematrixset)

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
//console.log("Service Info: ", serviceinfo)
if (selectedService === 'WMTS') {
    console.log("Service Info for tilematrixset: ", serviceinfo['TileMatrixSet'])
}

let layers
if (selectedService === 'WMS' && layerobj[key_layer] && layerobj[key_layer][key_layer]) {
    layers = layerobj[key_layer]
} else {
    layers = layerobj
}
let isMultiLay = Array.isArray(layers)
if (!isMultiLay && typeof layers === 'object' && layers.hasOwnProperty(key_layer)) {
    layers = layers[key_layer]
    isMultiLay = Array.isArray(layers)
}
console.log("MultiLay: ", isMultiLay, typeof layers, layers)

const removeKeyPrefix = (obj, prefix) => {
    return Object.keys(obj).reduce((newObj, key) => {
        // Check if the key starts with the prefix
        if (key.startsWith(prefix)) {
            // Create a new key name by removing the prefix
            const newKey = key.slice(prefix.length)
            newObj[newKey] = obj[key]
        } else {
            // Copy the key-value pair as is if the key does not start with the prefix
            newObj[key] = obj[key]
        }
        return newObj
    }, {})
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

const getSingleLayer = (layer, service = "WMS", isMulti = false, bbox0 = [], pattern = '', prefix_wms = '') => {
    let layx, bbox, re, isLayerNotNum, stylex, legendx, tmplegendx
    let key_prefix = service === 'WMS' ? prefix_wms : 'ows:'
    let key_layer = service === 'WMS' ? `${key_prefix}Layer` : `Layer`
    let key_title = service === 'WMS' ? `${key_prefix}Title` : `${key_prefix}Identifier`
    let key_layname = service === 'WMS' ? `${key_prefix}Name` : `${key_prefix}Identifier`
    let copyLegendFunc = service === 'WMTS' ? copyWmtsLegendItems : copyWmsLegendItems
    //let key_bbox = service === 'WMS' ? 'BoundingBox' : `${key_prefix}WGS84BoundingBox`
    /*
        if (!isMulti && service === 'WMS') {
            layx = layer.Layer
        } else {
            layx = layer
        }*/
    if (layer[key_layname] === undefined && layer[key_layer]) { //some layer name have value 0 <- so cannot use !layx[key_layname]
        layx = layer[key_layer]
    } else {
        layx = layer
    }

    if (layx[key_layname] === undefined) { //some layer name have value 0 <- so cannot use !layx[key_layname]
        console.log("Error layer: ", layx)
        return null
    } else {
        if (pattern && pattern.trim() !== '') {
            let patx = pattern.trim()
            let fuzzyFlag = patx.indexOf('*')
            if (fuzzyFlag < 0 && layx[key_layname] !== patx) {
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

    //console.log("Debug Single layer: ", layx)
    if (service === 'WMS') {
        let key_bbox = `${key_prefix}BoundingBox`
        let key_style = `${key_prefix}Style`
        let key_styleName = `${key_prefix}Name`
        let key_styleFormat = `${key_prefix}Format`
        let key_LegendURL = `${key_prefix}LegendURL`
        let key_OnlineResource = `${key_prefix}OnlineResource`    
        if (!layx[key_bbox]) {
            bbox = bbox0
        } else {
            bbox = getWMSbbox(layx[key_bbox])
            /*        if (Array.isArray(layx[key_bbox])) {
                        bbox = [layx[key_bbox][0]['$minx'], layx[key_bbox][0]['$miny'],
                        layx[key_bbox][0]['$maxx'], layx[key_bbox][0]['$maxy']]
                    } else {
                        bbox = [layx[key_bbox]['$minx'], layx[key_bbox]['$miny'],
                        layx[key_bbox]['$maxx'], layx[key_bbox]['$maxy']]
                    }
            */
        }
        if (layx[key_style]) {
            if (Array.isArray(layx[key_style])) {
                for (let i = 0; i < layx[key_style].length; i++) {
                    if (layx[key_style][i][key_styleName] === 'default') {
                        stylex = { default: 'default' }
                        if (layx[key_style][i][key_LegendURL]) {
                            legendx = layx[key_style][i][key_LegendURL]
                        }
                        break
                    }
                }
                if (!stylex) {
                    stylex = { example: layx[key_style][0][key_styleName] }
                    if (layx[key_style][0][key_LegendURL]) {
                        legendx = layx[key_style][0][key_LegendURL]
                    }
                }
            } else {
                stylex = { default: layx[key_style][key_styleName] }
                if (layx[key_style][key_LegendURL]) {
                    legendx = layx[key_style][key_LegendURL]
                }
            }
            if (legendx) {
                if (Array.isArray(legendx)) {
                    stylex["legend"] = Array.from({ length: legendx.length })
                    for (let j = 0; j < legendx.length; j++) {
                        tmplegendx = removeKeyPrefix(copyLegendFunc(legendx[j]), prefix_wms)
                        stylex["legend"][j] = {
                            link: legendx[j][key_OnlineResource]["$xlink:href"],
                            type: legendx[j][key_OnlineResource]["$xlink:type"] ?? '',
                            format: legendx[j][key_styleFormat],
                            width: legendx[j]['$width'],
                            height: legendx[j]['$height'],
                            ...tmplegendx
                        }
                    }
                } else {
                    tmplegendx = removeKeyPrefix(copyLegendFunc(legendx), prefix_wms)
                    stylex["legend"] = [{
                        link: legendx[key_OnlineResource]["$xlink:href"],
                        type: legendx[key_OnlineResource]["$xlink:type"] ?? '',
                        format: legendx[key_styleFormat],
                        width: legendx['$width'],
                        height: legendx['$height'],
                        ...tmplegendx
                    }]
                }
            }
        } //else {
        //console.log("No style provided in WMS layer: ", layx)
        //}
    } else if (service === 'WMTS') {
        bbox = getWMTSbbox(layx)
        /*      key_bbox = layx.hasOwnProperty('ows:WGS84BoundingBox') ? 'ows:WGS84BoundingBox' : 'ows:BoundingBox'
                bbox = [...layx[key_bbox]['ows:LowerCorner'].split(' ').map(Number),
                ...layx[key_bbox]['ows:UpperCorner'].split(' ').map(Number)]
        */
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
                } else {
                    console.log("Warning: Non-default style in layx: ", layx.Style)
                }
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

    let dimenx = {}, tmpdimenx
    let key_dimen = service === 'WMS' ? `${key_prefix}Dimension` : `Dimension`
    let dimenName = service === 'WMTS' ? 'ows:Identifier' : '$name'
    let copyDimenFunc = service === 'WMTS' ? copyWmtsDimenItems : copyWmsDimenItems
    if (layx[key_dimen]) {
        if (Array.isArray(layx[key_dimen])) {
            for (let i = 0; i < layx[key_dimen].length; i++) {
                tmpdimenx = removeKeyPrefix(copyDimenFunc(layx[key_dimen][i]), service === 'WMS' ? prefix_wms : '')
                dimenx[layx[key_dimen][i][dimenName]] = {
                    value: service === 'WMTS' ? layx[key_dimen][i]['Value'] : layx[key_dimen][i]['#text'],
                    default: service === 'WMTS' ? (layx[key_dimen][i]['Default'] ?? '') : (layx[key_dimen][i]['$default'] ?? ''),
                    unit: service === 'WMTS' ? (layx[key_dimen][i]['ows:UOM'] ?? '') : (layx[key_dimen][i]['$units'] ?? ''),
                    ...tmpdimenx
                }
            }
        } else {
            tmpdimenx = removeKeyPrefix(copyDimenFunc(layx[key_dimen]), service === 'WMS' ? prefix_wms : '')
            dimenx[layx[key_dimen][dimenName]] = {
                value: service === 'WMTS' ? layx[key_dimen]['Value'] : layx[key_dimen]['#text'],
                default: service === 'WMTS' ? (layx[key_dimen]['Default'] ?? '') : (layx[key_dimen]['$default'] ?? ''),
                unit: service === 'WMTS' ? (layx[key_dimen]['ows:UOM'] ?? '') : (layx[key_dimen]['$units'] ?? ''),
                ...tmpdimenx
            }
        }
    }

    let itemx = {
        name: layx[key_layname],
        title: layx[key_title],
        bbox: bbox.bbox,
        crs: bbox.crs,
        dimension: dimenx, //layx.Dimension ?? '',
        style: stylex ?? {},
        //crs: layx.CRS,
        //abstract: layx.Abstract,
        //keywords: [...layx.KeywordList.Keyword],
        //attribution: `${layx.Attribution.Title}: ${layx.Attribution.OnlineResource['$xlink:href']}`
    }
    if (service === 'WMTS') {
        let formatx //may be 'image/png', 'image/jpeg',..
        //let ftmpidx = -1 //find format index
        let tmplidx = -1 //find tmplate index
        if (Array.isArray(layx.Format)) {
            formatx = layx.Format
            /*ftmpidx = layx.Format.findIndex((elem, idx) => {
                if (elem === 'image/png' || elem === 'image/jpeg') {
                    return idx
                }
            })
            if (ftmpidx === -1) {
                console.log("Warning: capabilities not include supports for image/png or image/jpeg")
                formatx = layx.Format[0]
            } else {
                formatx = layx.Format[ftmpidx]
            }
            console.log("Debug format find idx: ", ftmpidx, formatx)*/
        } else {
            formatx = [layx.Format]
        }

        let templatex = Array.from({ length: formatx.length })

        if (Array.isArray(layx.ResourceURL)) {
            /*if (ftmpidx >= 0 && layx.ResourceURL[ftmpidx]['$format'] === formatx) {
                  templatex = layx.ResourceURL[ftmpidx]['$template']
              } else if (ftmpidx >= 0) {
                  tmplidx = layx.ResourceURL.findIndex((elem, idx) => {
                      if (elem['$format'] === formatx) {
                          return idx
                      }
                  })
                  if (tmplidx === -1) {
                      console.log("Warning: capabilities not find corresponding template for format: ", formatx)
                      templatex = layx.ResourceURL[0]['$template']
                  } else {
                      templatex = layx.ResourceURL[tmplidx]['$template']
                  }
              } else {
                  templatex = layx.ResourceURL[0]['$template']
              }
              console.log("Debug template find idx: ", tmplidx, templatex)*/
            for (let i = 0; i < layx.ResourceURL.length; i++) {
                if (formatx[i] && layx.ResourceURL[i]['$format'] === formatx[i]) {
                    templatex[i] = layx.ResourceURL[i]['$template']
                    //console.log("Debug match: ", i, templatex[i])
                } else {
                    tmplidx = formatx.indexOf(layx.ResourceURL[i]['$format'])
                    if (tmplidx >= 0) {
                        if (templatex[tmplidx]) { console.log("Warning: find repeated foramt/template setting: ", formatx[tmplidx]) }
                        templatex[tmplidx] = layx.ResourceURL[i]['$template']
                        //console.log("Debug rematch: ", i, tmplidx, templatex[tmplidx])
                    } else {
                        console.log("Warning: cannot find corresponding foramt/template setting: ", layx.ResourceURL[i]['$format'])
                    }
                }
                if (!templatex.includes(undefined)) break
            }
        } else {
            templatex = [layx.ResourceURL['$template']]
        }

        let tilemat = []
        if (Array.isArray(layx.TileMatrixSetLink)) {
            for (let i=0;i<layx.TileMatrixSetLink.length;i++) {
                tilemat.push(layx.TileMatrixSetLink[i].TileMatrixSet)                
            }
        } else {
            tilemat = [layx.TileMatrixSetLink.TileMatrixSet]
        }
        console.log("Debug tilemat: ", JSON.stringify(tilemat))
        itemx = {
            ...itemx,
            format: formatx, //layx.Format,
            template: templatex, //layx.ResourceURL['$template'],
            TileMatrixSet: tilemat //Array.isArray(layx.TileMatrixSetLink) ? layx.TileMatrixSetLink[0].TileMatrixSet : layx.TileMatrixSetLink.TileMatrixSet,
        }
        /*      if (isMulti) {
                    if (layx[`${key_prefix}Metadata`]) {
                        itemx = {
                            ...itemx,
                            MetadataURL: layx[`${key_prefix}Metadata`][0]['$xlink:href']
                        }
                    }
                }*/
    }
    return itemx
}

let result = [], layx, layy, itemx
let bbox0
let key_bbox = `${key_prefix}BoundingBox` //key_bbox = 'BoundingBox'
if (selectedService === 'WMS' && isMultiLay && layerobj[key_bbox]) {
    bbox0 = getWMSbbox(layerobj[key_bbox])
    //bbox0 = [layerobj[key_bbox]['$minx'], layerobj[key_bbox]['$miny'],
    //layerobj[key_bbox]['$maxx'], layerobj[key_bbox]['$maxy']]
}

if (isMultiLay) {
    for (let i = 0; i < layers.length; i++) {
        layx = layers[i]
        /*      if (i <= 1) {
                    if (selectedService == "WMS") {
                        console.log("Inside layer:", layx.Layer)
                        console.log("Layer MetadataURL:", layx.Layer[0].MetadataURL.OnlineResource)
                        console.log("Layer DataURL:", layx.Layer[0].DataURL.OnlineResource)
                        console.log("Layer Style:", layx.Layer[0].Style[0])
                    } else {
                        console.log("Layer: ", layx)
                        console.log("Layer Metadata:", layx['ows:Metadata'])
                        console.log("Layer Style:", layx['Style'])
                    }
                }
                if (selectedService === 'WMS' && !layx[key_bbox]) {
                    bbox = [layerobj[key_bbox]['$minx'], layerobj[key_bbox]['$miny'],
                    layerobj[key_bbox]['$maxx'], layerobj[key_bbox]['$maxy']]
                } else if (selectedService === 'WMS') {
                    bbox = [layx[key_bbox][0]['$minx'], layx[key_bbox][0]['$miny'],
                    layx[key_bbox][0]['$maxx'], layx[key_bbox][0]['$maxy']]
                } else {
                    if (i <= 1) {
                        let test1 = layx[key_bbox]['ows:LowerCorner'].split(' ').map(Number)
                        let test2 = layx[key_bbox]['ows:UpperCorner'].split(' ').map(Number)
                        console.log("WMTS bbox: ", layx[key_bbox]['ows:LowerCorner'], ", ",
                            layx[key_bbox]['ows:LowerCorner'].split(' '), ', test2: ', test2, ", typeof: ", typeof test1)
                    }
                    console.log("WMTS bbox: ")
                    bbox = [...layx[key_bbox]['ows:LowerCorner'].split(' ').map(Number),
                    ...layx[key_bbox]['ows:UpperCorner'].split(' ').map(Number)]
                }
                itemx = {
                    name: layx[key_layname] ?? layx[key_title],
                    title: layx[key_title],
                    bbox: bbox,
                    //crs: layx.CRS,
                    //abstract: layx.Abstract,
                    //keywords: [...layx.KeywordList.Keyword],
                    //attribution: `${layx.Attribution.Title}: ${layx.Attribution.OnlineResource['$xlink:href']}`
                }
                if (selectedService === 'WMTS') {
                    itemx = {
                        ...itemx,
                        format: layx.Format,
                        template: layx.ResourceURL['$template'],
                        dimension: layx.Dimension,
                        TileMatrixSet: layx.TileMatrixSetLink.TileMatrixSet,
                    }
                }*/
        if (selectedService === 'WMS' && isMultiLay && layx[key_layer] && Array.isArray(layx[key_layer])) {
            for (let j = 0; j < layx[key_layer].length; j++) {
                layy = layx[key_layer][j]
                itemx = getSingleLayer(layy, selectedService, isMultiLay, bbox0, pattern, prefix_wms)
                if (itemx) {
                    result.push(itemx)
                }
            }
        } else {
            itemx = getSingleLayer(layx, selectedService, isMultiLay, bbox0, pattern, prefix_wms)
            if (itemx) {
                result.push(itemx)
            }
        }
    }
} else {
    /*
    let testidx = layers.findIndex(layx => { return (layx.Title == 'GRACE_LWE_M') })
    if (testidx >= 0) {
        console.log("Test: ", layers[testidx].Layer)
    }
    */
    //layx = selectedService === 'WMS' ? layers.Layer : layers
    /*  console.log(layx.BoundingBox[0])
        console.log(layx.BoundingBox[1])
        console.log(layx.Style[0])
        console.log(layx.Style[1])
        console.log(layx.Attribution.OnlineResource)
        console.log(layx.BoundingBox)
        Object.keys(layx.BoundingBox).forEach(function (key) {
            console.log("Key-value: ", key, layx.BoundingBox[key])
        })
    */
    /* 
    if (selectedService === 'WMS') {
        bbox = [layx[key_bbox][0]['$minx'], layx[key_bbox][0]['$miny'],
        layx[key_bbox][0]['$maxx'], layx[key_bbox][0]['$maxy']]
    } else {
        bbox = [...layx[key_bbox]['ows:LowerCorner'].split(' ').map(Number),
        ...layx[key_bbox]['ows:UpperCorner'].split(' ').map(Number)]
    }

    itemx = {
        name: layx[key_layname],
        title: layx[key_title],
        //abstract: layx.Abstract,
        //crs: layx.CRS,
        //keywords: [...layx.KeywordList.Keyword],
        //attribution: `${layx.Attribution.Title}: ${layx.Attribution.OnlineResource['$xlink:href']}`
        bbox: bbox,
        //style: selectedService === 'WMS'? layx.Style[0].Name: layx.Style['ows:Identifier'], 
    }
    if (selectedService === 'WMTS') {
        itemx = {
            ...itemx,
            format: layx.Format,
            template: layx.ResourceURL['$template'],
            dimension: layx.Dimension ?? '',
            TileMatrixSet: Array.isArray(layx.TileMatrixSetLink) ? layx.TileMatrixSetLink[0].TileMatrixSet : layx.TileMatrixSetLink.TileMatrixSet,
        }
    }*/
    itemx = getSingleLayer(layers, selectedService, isMultiLay, bbox0, pattern, prefix_wms)
    if (itemx) {
        result.push(itemx)
    }
}

if (isMultiLay) {
    console.log("Total: ", result.length)
    if (result.length <= 1) {
        console.log(result[0])
    } else {
        console.log(result[0], result[1])
    }
} else {
    console.log(result[0])
}
if (result[0].style) {
    console.log(result[0].style)
    if (result[0].style.legend) {
        console.log(result[0].style.legend)
    }
}
console.log(serviceinfo)
