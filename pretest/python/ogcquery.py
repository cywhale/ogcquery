from owslib.wms import WebMapService
from owslib.wmts import WebMapTileService
import io, json
from PIL import Image

from fastapi import FastAPI, status  # , Depends
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from typing import Union

app = FastAPI()

ogcservices = {'wms': WebMapService, 'wmts': WebMapTileService}

@app.on_event("startup")
async def startup():
    global ogcservices

@app.get("/getinfo/{url}")
async def getinfo(url: str, service: Union[str, None] = 'wms'):
    if service not in ogcservices:
        return JSONResponse(status_code=status.HTTP_400_BAD_REQUEST,
                            content=jsonable_encoder({"Error": "Check service should be one of: " + ogcservices.keys()}))
 
    #layx = ogcservices[service](url)
    #result = json.loads(layx.getcapabilities().read().decode('utf-8'))
    #return result

@app.get("/getmap/{url}")
async def getmap(url: str, service: Union[str, None] = 'wms', 
                 layer: Union[str, None] = None, crs: Union[str, None] = 'EPSG:4326',
                 tilesize: Union[str, None] = '256,256', format: Union[str, None] = 'png',):
    wms = WebMapService(url)
    layers = list(wms.contents)
    if layer not in layers:
        return JSONResponse(status_code=status.HTTP_400_BAD_REQUEST,
                            content=jsonable_encoder({"Error": "Check layer should be one of: " + wms.contents}))
    
    layx = layers[layers.index(layer)] # get layer
    srs = layx.crsOptions
    #bbox_force: Union[str, None] = '-180,-90,180,90',

    image = wms.getmap(layers=[layer], srs='EPSG:4326', bbox=(-180, -90, 180, 90), size=(512, 512), format='image/png')
    image = Image.open(io.BytesIO(image.read()))
    return {"map_image": image}


