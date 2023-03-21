import { parse } from 'arraybuffer-xml-parser'
import { fetch } from 'undici'

const url = //'https://neo.gsfc.nasa.gov/wms/wms'
    //'https://ecodata.odb.ntu.edu.tw/geoserver/marineheatwave/wms'
    'https://server.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/WMTS'
//'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/wmts.cgi' //multilayer wmts
// other WMS
// layers is digit(0, 1,...) numbered, and multiple CRS
//'https://idpgis.ncep.noaa.gov/arcgis/services/NWS_Forecasts_Guidance_Warnings/NHC_Atl_trop_cyclones/MapServer/WmsServer'
//'https://idpgis.ncep.noaa.gov/arcgis/services/NWS_Forecasts_Guidance_Warnings/NHC_Atl_trop_cyclones/MapServer/WMSServer'
//'https://nowcoast.noaa.gov/arcgis/services/nowcoast/sat_meteo_imagery_time/MapServer/WMSServer'
//'https://www.ncei.noaa.gov/thredds/wms/ncFC/fc-oisst-daily-avhrr-amsr-dly/OISST_Daily_AVHRR_AMSR_Feature_Collection_best.ncd'
//'https://nrt.cmems-du.eu/thredds/wms/global-analysis-forecast-bio-001-028-daily'
// CMEMS WMS: (SLA)
//'https://nrt.cmems-du.eu/thredds/wms/dataset-duacs-nrt-global-merged-allsat-phy-l4'
// other WMTS
//'https://wmts.nlsc.gov.tw/wmts' //only 3857, no WGS84
// other WMS
// 'https://wms.nlsc.gov.tw/wms' //only 3857, no WGS84 //has diff key $SRS and WMT_MS_Capabilities 

const selectedService = 'wmts'.toUpperCase() //'wmts'.toUpperCase()
const pattern = '*' //'*temperature'  //'*64*kt*wind*' //for title //'Aquarius_Sea_Surface_Salinity_L3_Monthly' //null //'*_M' //'blue*' //'*fire*'

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
let key_prefix = selectedService === 'WMS' ? '' : 'ows:'
let key_content = selectedService === 'WMS' ? 'Capability' : 'Contents'
let key_meta = selectedService === 'WMS' ? 'Service' : `${key_prefix}ServiceIdentification`
let capa = data[key_capabilities]
let serviceinfo = capa[key_meta]
let layerobj = capa[key_content].Layer //Object.entries(capa.Capability.Layer)
//let key_title = selectedService === 'WMS' ? 'Title' : `${key_prefix}Identifier`
//let key_layname = selectedService === 'WMS' ? 'Name' : `${key_prefix}Identifier`
//let key_bbox = selectedService === 'WMS' ? 'BoundingBox' : `${key_prefix}WGS84BoundingBox`
//let key_metaurl = selectedService === 'WMS' ? 'MetadataURL' : `${key_prefix}Metadata`
//let key_dataurl = selectedService === 'WMS' ? 'DataURL' : //??
//console.log(data)
console.log("Capabilities: ", capa)
//console.log("TileMatrixSet: ", capa.Contents.TileMatrixSet)
//console.log("TileMatrixSet item0: ", capa.Contents.TileMatrixSet[0].TileMatrix)
//console.log("TileMatrixSet item1: ", capa.Contents.TileMatrixSet[1].TileMatrix)
//console.log("Layers: ", layerobj)

if (selectedService === 'WMTS') {
    if (capa.hasOwnProperty('ows:ServiceProvider')) {
        serviceinfo['ows:ServiceProvider'] = capa['ows:ServiceProvider']
    }
    if (capa.hasOwnProperty('ows:OperationsMetadata')) {
        serviceinfo['ows:OperationsMetadata'] = capa['ows:OperationsMetadata']
    }
    if (capa.hasOwnProperty('ServiceMetadataURL')) {
        serviceinfo['ServiceMetadataURL'] = capa['ServiceMetadataURL']
    }
    if (capa.Contents && capa.Contents.hasOwnProperty('TileMatrixSet')) {
        serviceinfo['TileMatrixSet'] = capa.Contents['TileMatrixSet']
    }
}
console.log("Service Info: ", serviceinfo)

let layers
if (selectedService === 'WMS') {
    layers = layerobj.Layer
} else {
    layers = layerobj
}

let isMultiLay = Array.isArray(layers)
if (!isMultiLay && typeof layers === 'object' && layers.hasOwnProperty('Layer')) {
    layers = layers.Layer
    isMultiLay = Array.isArray(layers)
}
console.log("MultiLay: ", isMultiLay, typeof layers)

const getSingleLayer = (layer, service = "WMS", isMulti = false, bbox0 = [], pattern = '') => {
    let layx, bbox, re, isLayerNotNum
    let key_prefix = service === 'WMS' ? '' : 'ows:'
    let key_title = service === 'WMS' ? 'Title' : `${key_prefix}Identifier`
    let key_layname = service === 'WMS' ? 'Name' : `${key_prefix}Identifier`
    //let key_bbox = service === 'WMS' ? 'BoundingBox' : `${key_prefix}WGS84BoundingBox`
    /*
        if (!isMulti && service === 'WMS') {
            layx = layer.Layer
        } else {
            layx = layer
        }*/
    if (layer[key_layname] === undefined && layer.Layer) {
        layx = layer.Layer
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

    //  let key_bbox = 'BoundingBox'
    if (service === 'WMS' && !layx[key_bbox]) {
        bbox = bbox0
    } else if (service === 'WMS') {
        bbox = getWMSbbox(layx[key_bbox])
        /*        if (Array.isArray(layx[key_bbox])) {
                    bbox = [layx[key_bbox][0]['$minx'], layx[key_bbox][0]['$miny'],
                    layx[key_bbox][0]['$maxx'], layx[key_bbox][0]['$maxy']]
                } else {
                    bbox = [layx[key_bbox]['$minx'], layx[key_bbox]['$miny'],
                    layx[key_bbox]['$maxx'], layx[key_bbox]['$maxy']]
                }
        */
    } else if (service === 'WMTS') {
        bbox = getWMTSbbox(layx)
        /*      key_bbox = layx.hasOwnProperty('ows:WGS84BoundingBox') ? 'ows:WGS84BoundingBox' : 'ows:BoundingBox'
                bbox = [...layx[key_bbox]['ows:LowerCorner'].split(' ').map(Number),
                ...layx[key_bbox]['ows:UpperCorner'].split(' ').map(Number)]
        */
    }

    let itemx = {
        name: layx[key_layname],
        title: layx[key_title],
        bbox: bbox.bbox,
        crs: bbox.crs,
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
        /*      if (isMulti) {
                    if (layx[`${key_prefix}Metadata`]) {
                        itemx = {
                            ...itemx,
                            MetadataURL: layx[`${key_prefix}Metadata`][0]['$xlink:href']
                        }
                    }
                }*/
    }
    console.log(layx)

    return itemx
}

let result = [], layx, layy, itemx
let bbox0
let key_bbox = 'BoundingBox'
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
        if (selectedService === 'WMS' && isMultiLay && layx.Layer && Array.isArray(layx.Layer)) {
            for (let j = 0; j < layx.Layer.length; j++) {
                layy = layx.Layer[j]
                itemx = getSingleLayer(layy, selectedService, isMultiLay, bbox0, pattern)
                if (itemx) {
                    result.push(itemx)
                }
            }
        } else {
            itemx = getSingleLayer(layx, selectedService, isMultiLay, bbox0, pattern)
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
    itemx = getSingleLayer(layers, selectedService, isMultiLay, bbox0, pattern)
    if (itemx) {
        result.push(itemx)
    }
}

if (isMultiLay) {
    console.log("Total: ", result.length)
    console.log(result[0], result[1])
} else {
    console.log(result[0])
}
