"""Source-faithful operations shared by preparation and independent byte replay."""
import io
from PIL import Image, ImageOps

def replay(raw: bytes, operations: list[dict]) -> bytes:
    if operations == [{'operation':'identity-copy'}]:return raw
    image=ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert('RGB');output=None
    for index,op in enumerate(operations):
        kind=op['operation']
        if kind=='crop':
            box=op['box_px']
            if not(len(box)==4 and all(type(x)is int for x in box) and 0<=box[0]<box[2]<=image.width and 0<=box[1]<box[3]<=image.height):raise ValueError('crop outside source bounds')
            image=image.crop(tuple(box))
        elif kind=='lanczos-resize':
            size=op['size']
            if not(len(size)==2 and all(type(x)is int and 0<x<=8192 for x in size)):raise ValueError('invalid resize size')
            if op.get('method')=='thumbnail':image.thumbnail(tuple(op['bounds']),Image.Resampling.LANCZOS,reducing_gap=op['reducing_gap'])
            else:image=image.resize(tuple(size),Image.Resampling.LANCZOS)
            if list(image.size)!=size:raise ValueError('resize result differs from recipe')
        elif kind=='opencv-fastNlMeansDenoisingColored':
            import cv2,numpy as np
            a=cv2.cvtColor(np.asarray(image),cv2.COLOR_RGB2BGR);a=cv2.fastNlMeansDenoisingColored(a,None,op['h'],op['hColor'],op['templateWindowSize'],op['searchWindowSize']);image=Image.fromarray(cv2.cvtColor(a,cv2.COLOR_BGR2RGB))
        elif kind=='jpeg-encode':
            if index!=len(operations)-1:raise ValueError('encode must terminate recipe')
            output=io.BytesIO();image.save(output,'JPEG',quality=op['quality'],subsampling=op['subsampling'],optimize=True)
        else:raise ValueError('unrecognized image operation: '+kind)
    if output is None:raise ValueError('missing display encoding')
    return output.getvalue()
