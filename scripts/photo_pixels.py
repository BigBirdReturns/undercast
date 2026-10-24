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

def compose_region(specification, source_size, operations):
    """Map a reviewer-marked source region through exact non-generative operations."""
    if not specification:return None
    import math
    region=specification.get('protected_region_px');w,h=source_size
    if not(isinstance(region,list) and len(region)==4 and all(type(n) in (int,float) and math.isfinite(n) for n in region)):
        raise ValueError('protected source region needs four finite coordinates')
    x0,y0,x1,y1=region
    if not(0<=x0<x1<=w and 0<=y0<y1<=h):raise ValueError('protected region outside source')
    maximum=specification.get('max_height_fraction');margin=specification.get('min_margin_fraction')
    if not(type(maximum) in (int,float) and .1<=maximum<=1 and type(margin) in (int,float) and 0<=margin<=.2):
        raise ValueError('explicit bounded context limits required')
    for op in operations:
        if op['operation']=='crop':
            l,t,r,b=op['box_px'];x0-=l;x1-=l;y0-=t;y1-=t;w,h=r-l,b-t
            if not(0<=x0<x1<=w and 0<=y0<y1<=h):raise ValueError('crop removes protected source region')
        elif op['operation']=='lanczos-resize':
            nw,nh=op['size'];x0*=nw/w;x1*=nw/w;y0*=nh/h;y1*=nh/h;w,h=nw,nh
    # JSON.stringify serializes integral numbers without '.0'. Preserve identical
    # region fingerprints across Python preparation and JavaScript approval.
    def canonical_number(value):
        return int(value) if isinstance(value, float) and value.is_integer() else value
    return {'version':1,'display_region_px':[canonical_number(v) for v in [x0,y0,x1,y1]],'max_height_fraction':canonical_number(maximum),'min_margin_fraction':canonical_number(margin)}
