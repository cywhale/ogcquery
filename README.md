## OGCquery API User Manual

[![DOI](https://zenodo.org/badge/doi/10.5281/zenodo.8304074.svg)](https://doi.org/10.5281/zenodo.8304074)

#### Overview

The OGCquery API fetches XML capabilities from a specified WMS/WMTS URL, offering users the details required to display map layers. This API doesn't support the GetMap function, so users must pull the needed data from the output JSON and add it to the URL to create maps, such as with CesiumJS or Leaflet.

#### Swagger API doc

- [ODB OGCquery API manual/online try-out](https://api.odb.ntu.edu.tw/hub/swagger?node=odb_ogcquery_v1)

#### Introduction of OGCquery API concepts</a>

[![OGCquery_API](https://github.com/cywhale/ODB/blob/master/img/apiverse_function_introduce02_OGC.png)](https://github.com/cywhale/ODB/blob/master/img/apiverse_function_introduce02_OGC.png)
Demo: Try it by using [Ocean APIverse globe viewer and settings](https://api.odb.ntu.edu.tw/hub/earth/settings)


#### Usage

The API request should be made to the host URL with the endpoint /capability

```bash
https://api.odb.ntu.edu.tw/ogcquery/capability
```

Include these parameters as query string:
- url: The URL of the WMS/WMTS service.
- type: The type of the service, either WMS or WMTS.
- layer: (optional) The name of the specific layer (can be filtered by wildcard *).

For example:

```bash
https://api.odb.ntu.edu.tw/ogcquery/capability?url=https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/wmts.cgi&type=WMTS&layer=*ice*
```

The response JSON will have three main objects:
- layers: Names of layers (filtered) fetched from the capabilities XML.
- service: General details from the capabilities XML.
- capability: A list of objects for each layer detailing its capabilities.

To create a map with CesiumJS or Leaflet, users should:
1. Identify the index of their chosen layer, "Selected_layer", in the output.capability list using the layers array.
2. Retrieve the relevant details from the output.capability[index] object.
3. Add this information to the service URL, along with the GetMap/GetTile command.

For example (WMTS, REST format for template URL):

```bash

https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/wmts.cgi?TIME={Time}&TILEMATRIXSET={TileMatrixSet}&TILEMATRIX={TileMatrix}&TILEROW={TileRow}&TILECOL={TileCol}&FORMAT={format}&layer={Seleceted_layer}
```

#### Bounding box (bbox) and CRS

The capabilities XML contains both a bounding box and the CRS of the available layers in array of objects. For example 

```
//In original WMS GetCapabilities XML:
BoundingBox: [
{
  '$CRS': 'CRS:84',
  '$minx': -180,
  '$miny': -90,
  '$maxx': 180,
  '$maxy': 90
},
{
  '$CRS': 'EPSG:4326',
  '$minx': -90,
  '$miny': -180,
  '$maxx': 90,
  '$maxy': 180
}],

//OGCquery API output json:
bbox: {
  'CRS:84': [ -180, -90, 180, 90 ],
  'EPSG:4326': [ -90, -180, 90, 180 ]
},
crs: [ 'CRS:84', 'EPSG:4326' ],

//In original WMTS GetCapabilities XML:
'ows:BoundingBox': {
  '$crs': 'urn:ogc:def:crs:EPSG::3857',
  'ows:LowerCorner': '-2.003750722959434E7 -1.997186888040859E7',
  'ows:UpperCorner': '2.003750722959434E7 1.9971868880408563E7'
},
'ows:WGS84BoundingBox': {
  '$crs': 'urn:ogc:def:crs:OGC:2:84',
  'ows:LowerCorner': '-179.99999000000003 -85.00000000000003',
  'ows:UpperCorner': '179.99999000000003 85.0'
},

//OGCquery API output json: 
bbox: {
  'CRS:84': [ -179.99999000000003, -85.00000000000003, 179.99999000000003, 85 ],
  'EPSG:3857': [
    -20037507.22959434,
    -19971868.88040859,
    20037507.22959434,
    19971868.880408563
]},
crs: [ 'CRS:84', 'EPSG:3857' ],
```

#### Dimension
Time, elevation, and other dimensions included in capabilities XML

```
capability:[
  { //...
  dimension:{
    time:{
      value: '', //in WMS, it's #text
      default: '',
      unit: '',
      // //extra `Dimension` properties is stored as is in original XML
    },//...
  },
}, //{...}
]}
```

#### Style and legend (Breaking change v0.3.0)

The `style` property of a WMS/WMTS layer (an array of objects) provides information about the style's `name` and its associated `legend`. If a default style is available, it will be in the first element of this array with a `default` property. If the server doesn't specify a default style, the `default` property will not exist.

Furthermore, the `legend` property contains an array of objects for LegendURL in XML. This includes details about the URL of the legend image, its dimensions (width and height), and its format. Note that the format of the `LegendURL` can differ substantially across WMS and WMTS services. Consequently, any additional `LegendURL` attributes are kept as provided, leaving users to parse its content. 

Here's an example of the `capability` object:

```js
capability:[
  {
    style: {
      name: "Default style name",
      default: "default", //may not existed if there is no default style provided
      legend: [ {
          link: '',
          type: '', //more likely to be 'simple',
          format: '',
          width:, 
          height:,
          //extra `LegendURL` properties is stored as is
        } ]
    },
    //...
  }, //  {...}, 
]
```

#### TileMatrixSet
Note: `TileMatrixSet` object is under the `service` object.
```js
{
  service: {
    TileMatrixSet: {
      "Each TileMatrixID": ["Each TileMatrix Item", ] //i.e. Each TileMatrixID is the key and its value is array of TileMatrix items in this TileMatrixID
    }
  }
}
```

#### Citation
* This API is compiled by [Ocean Data Bank](https://www.odb.ntu.edu.tw) (ODB), and can be cited as:

    Ocean Data Bank, National Science and Technology Council, Taiwan. https://doi.org/10.5281/zenodo.7512112. Accessed DAY/MONTH/YEAR from api.odb.ntu.edu.tw/ogcquery. v1.0.


#### Version history
- v0.1.4 (202303): Added information about the bounding box (bbox) and CRS problem.
- v0.1.6 (202304): Added default style
- v0.1.7 (202304): Added dimension and legend
- v0.1.8 (202304): Added TileMatrixSet object
- v0.3.0 (202409): Breaking change the `style` to an array of objects to allow multiple styles.