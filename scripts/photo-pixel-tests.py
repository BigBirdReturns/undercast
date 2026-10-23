"""Offline operation and cache regressions; run with the pinned photo interpreter."""
import hashlib,importlib.util,io,json,tempfile,unittest
from pathlib import Path
from PIL import Image
from photo_pixels import replay
spec=importlib.util.spec_from_file_location('photo_maintenance',Path(__file__).with_name('photo-maintenance.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class PhotoPixels(unittest.TestCase):
 def setUp(self):
  b=io.BytesIO();Image.new('RGB',(640,480),(117,83,49)).save(b,'PNG');self.raw=b.getvalue()
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
