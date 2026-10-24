"""Offline operation and cache regressions; run with the pinned photo interpreter."""
import hashlib,importlib.util,io,json,tempfile,unittest
from pathlib import Path
from PIL import Image
from photo_pixels import replay, compose_region
spec=importlib.util.spec_from_file_location('photo_maintenance',Path(__file__).with_name('photo-maintenance.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class PhotoPixels(unittest.TestCase):
 def setUp(self):
  b=io.BytesIO();Image.new('RGB',(640,480),(117,83,49)).save(b,'PNG');self.raw=b.getvalue()
 def test_composition_integral_numbers_share_javascript_digest(self):
  import subprocess
  source={'protected_region_px':[397,68,1349,1352],'max_height_fraction':.75,'min_margin_fraction':.02}
  result=compose_region(source,[1984,2704],[{'operation':'lanczos-resize','size':[880,1200]}])
  self.assertEqual(result['display_region_px'][-1],600)
  self.assertIs(type(result['display_region_px'][-1]),int)
  root=Path(__file__).resolve().parent.parent
  command="import {fingerprint} from './scripts/lib/photo-preparations.mjs';import fs from 'node:fs';console.log(fingerprint(JSON.parse(fs.readFileSync(0,'utf8'))));"
  other=subprocess.check_output(['node','--input-type=module','-e',command],cwd=root,input=json.dumps(result),text=True).strip()
  self.assertEqual(module.fingerprint(result),other)
 def test_composition_integral_policy_limits_normalize_without_geometry_change(self):
  result=compose_region({'protected_region_px':[20.,30.,400.,300.],'max_height_fraction':1.,'min_margin_fraction':0.},[640,480],[])
  self.assertEqual(result['display_region_px'],[20,30,400,300])
  self.assertIs(type(result['max_height_fraction']),int)
  self.assertIs(type(result['min_margin_fraction']),int)
 def test_copy(self):self.assertEqual(replay(self.raw,[{'operation':'identity-copy'}]),self.raw)
 def test_crop_resize_is_repeatable(self):
  ops=[{'operation':'crop','box_px':[20,10,420,410]},{'operation':'lanczos-resize','size':[300,300]},{'operation':'jpeg-encode','quality':92,'subsampling':0}]
  a=replay(self.raw,ops);self.assertEqual(a,replay(self.raw,ops));self.assertEqual(Image.open(io.BytesIO(a)).size,(300,300))
 def test_invalid_crop(self):
  with self.assertRaises(ValueError):replay(self.raw,[{'operation':'crop','box_px':[-1,0,200,200]}])
 def test_invented_operation(self):
  with self.assertRaises(ValueError):replay(self.raw,[{'operation':'generate-face'}])
 def test_missing_encoding(self):
  with self.assertRaises(ValueError):replay(self.raw,[{'operation':'crop','box_px':[0,0,200,200]}])
 def test_cached_bytes_are_verified_offline(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);url='https://example.test/source';digest=hashlib.sha256(self.raw).hexdigest();(root/'blobs').mkdir();(root/'blobs'/digest).write_bytes(self.raw)
   module.write(root/'requests'/(module.sha(url.encode())+'.json'),{'url':url,'body':'blobs/'+digest,'sha256':digest,'bytes':len(self.raw)})
   cache=module.Cache(root,{'example.test'},offline=True);b,_=cache.get(url);self.assertEqual(b,self.raw);self.assertEqual(cache.stats['network_requests'],0)
   (root/'blobs'/digest).write_bytes(b'corrupt')
   with self.assertRaises(ValueError):cache.get(url)
 def test_offline_cache_miss_never_fetches(self):
  with tempfile.TemporaryDirectory() as tmp:
   cache=module.Cache(tmp,{'example.test'},offline=True)
   with self.assertRaises(ValueError):cache.get('https://example.test/not-cached')
   self.assertEqual(cache.stats['network_requests'],0)
 def test_private_source_refused(self):
  with tempfile.TemporaryDirectory() as tmp:
   cache=module.Cache(tmp,{'example.test'},offline=True)
   with self.assertRaises(ValueError):cache.get('http://127.0.0.1/metadata')
if __name__=='__main__':unittest.main()
