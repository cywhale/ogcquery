import { parse } from 'arraybuffer-xml-parser'
import { fetch } from 'undici'

const url = 'https://neo.gsfc.nasa.gov/wms/wms'
//'https://ecodata.odb.ntu.edu.tw/geoserver/marineheatwave/wms'
//'https://server.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/WMTS'
//'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/wmts.cgi' //multilayer wmts
const selectedService = 'wms'.toUpperCase() //'wmts'.toUpperCase()
const pattern = null //'*_M' //'blue*' //'*fire*'

const getCapabilities = async (url, service) => {
    const capabilitiesUrl = `${url}?service=${service}&request=GetCapabilities`
    console.log("Url: ", capabilitiesUrl)
    const res = await fetch(capabilitiesUrl)
    const xml = await res.text()
    //console.log("XML: ", xml)
    let jbody = parse(xml, { arrayMode: false })
    return jbody
}

let data = await getCapabilities(url, selectedService)
let key_capabilities = selectedService == 'WMS' ? 'WMS_Capabilities' : 'Capabilities'
let key_prefix = selectedService == 'WMS' ? '' : 'ows:'
let key_content = selectedService == 'WMS' ? 'Capability' : 'Contents'
//let key_meta = selectedService == 'WMS' ? 'Service' : `${key_prefix}ServiceIdentification`
let capa = data[key_capabilities]
//let services = capa[key_meta]
let layerobj = capa[key_content].Layer //Object.entries(capa.Capability.Layer)
//let key_title = selectedService == 'WMS' ? 'Title' : `${key_prefix}Identifier`
//let key_layname = selectedService == 'WMS' ? 'Name' : `${key_prefix}Identifier`
let key_bbox = selectedService == 'WMS' ? 'BoundingBox' : `${key_prefix}WGS84BoundingBox`
//let key_metaurl = selectedService == 'WMS' ? 'MetadataURL' : `${key_prefix}Metadata`
//let key_dataurl = selectedService == 'WMS' ? 'DataURL' : //??

//console.log("Capabilities: ", capa)
//console.log("Services: ", services)
//console.log("Layers: ", layerobj)

let layers
if (selectedService == 'WMS') {
    layers = layerobj.Layer
} else {
    layers = layerobj
}
const isMultiLay = Array.isArray(layers)
//console.log("MultiLay: ", isMultiLay, typeof layers)

const getSingleLayer = (layer, service = "WMS", isMulti = false, bbox0 = [], pattern = '') => {
    let layx, bbox, re
    let key_prefix = service == 'WMS' ? '' : 'ows:'
    let key_title = service == 'WMS' ? 'Title' : `${key_prefix}Identifier`
    let key_layname = service == 'WMS' ? 'Name' : `${key_prefix}Identifier`
    let key_bbox = service == 'WMS' ? 'BoundingBox' : `${key_prefix}WGS84BoundingBox`
    /*
        if (!isMulti && service == 'WMS') {
            layx = layer.Layer
        } else {
            layx = layer
        }*/
    if (!layer[key_layname] && layer.Layer) {
        layx = layer.Layer
    } else {
        layx = layer
    }

    if (!layx[key_layname]) {
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
                if (!re.test(layx[key_layname])) {
                    return null
                }
            }
        }
    }

    if (service == 'WMS' && !layx[key_bbox]) {
        bbox = bbox0
    } else if (service == 'WMS') {
        bbox = [layx[key_bbox][0]['$minx'], layx[key_bbox][0]['$miny'],
        layx[key_bbox][0]['$maxx'], layx[key_bbox][0]['$maxy']]
    } else {
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
    if (service == 'WMTS') {
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
    return itemx
}

let result = [], layx, layy, itemx
let bbox0 = []
if (selectedService == 'WMS' && isMultiLay) {
    bbox0 = [layerobj[key_bbox]['$minx'], layerobj[key_bbox]['$miny'],
    layerobj[key_bbox]['$maxx'], layerobj[key_bbox]['$maxy']]
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
                if (selectedService == 'WMS' && !layx[key_bbox]) {
                    bbox = [layerobj[key_bbox]['$minx'], layerobj[key_bbox]['$miny'],
                    layerobj[key_bbox]['$maxx'], layerobj[key_bbox]['$maxy']]
                } else if (selectedService == 'WMS') {
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
                if (selectedService == 'WMTS') {
                    itemx = {
                        ...itemx,
                        format: layx.Format,
                        template: layx.ResourceURL['$template'],
                        dimension: layx.Dimension,
                        TileMatrixSet: layx.TileMatrixSetLink.TileMatrixSet,
                    }
                }*/
        if (selectedService == 'WMS' && isMultiLay && layx.Layer && Array.isArray(layx.Layer)) {
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
    //layx = selectedService == 'WMS' ? layers.Layer : layers
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
    if (selectedService == 'WMS') {
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
        //style: selectedService == 'WMS'? layx.Style[0].Name: layx.Style['ows:Identifier'], 
    }
    if (selectedService == 'WMTS') {
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
