#!/usr/bin/env python3
"""Real SQLite transitions and contention, without network or canonical writes."""
import concurrent.futures, importlib.util, json, os, sqlite3, tempfile, time, unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('ops',Path(__file__).with_name('photo-operations.py'));ops=importlib.util.module_from_spec(spec);spec.loader.exec_module(ops)
class AttentionTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.q=ops.Queue(self.root/'state');self.record={'id':'UC-001','actor':'Source named performer','character':'Fixture role','production':'Fixture','portrait':None}
  self.q.sync(self.record,'portrait',None,['missing-image'],80)
 def tearDown(self):self.temp.cleanup()
 def test_scan_deduplicates(self):
  self.q.sync(self.record,'portrait',None,['missing-image'],80);self.assertEqual(self.q.summary()['facets'],1);self.assertEqual(self.q.summary()['events'],1)
 def test_parallel_claims_are_exclusive(self):
  with concurrent.futures.ThreadPoolExecutor(max_workers=8)as pool:rows=list(pool.map(lambda _:self.q.claim(),range(16)))
  self.assertEqual(sum(r is not None for r in rows),1)
 def test_expired_worker_cannot_commit(self):
  one=self.q.claim()
  with self.q.connect()as c:c.execute('UPDATE jobs SET lease_until=0')
  two=self.q.claim();self.assertNotEqual(one['token'],two['token'])
  with self.assertRaisesRegex(ValueError,'stale worker'):self.q.transition(one['key'],('collecting',),'source-review',token=one['token'])
 def test_heartbeat_keeps_claim(self):
  one=self.q.claim();self.assertTrue(self.q.heartbeat(one['key'],one['token']));self.assertIsNone(self.q.claim())
 def test_feedback_outranks_inventory(self):
  self.q.sync({**self.record,'id':'UC-002'},'portrait',None,['missing-image'],80);self.q.flag('UC-002/portrait','Explicit owner composition complaint',1000);self.assertEqual(self.q.claim()['key'],'UC-002/portrait')
 def test_rescan_does_not_erase_feedback(self):
  self.q.flag('UC-001/portrait','Head is clipped at the top of the frame');self.q.sync(self.record,'portrait',None,[],0)
  self.assertEqual(self.q.get('UC-001/portrait')['state'],'queued');self.assertEqual(len(self.q.get('UC-001/portrait')['details']['feedback']),1)
 def test_source_change_invalidates_inflight(self):
  one=self.q.claim();self.q.sync({**self.record,'actor':'Changed actor'},'portrait',None,[],0);self.assertEqual(self.q.get(one['key'])['state'],'stale')
  with self.assertRaises(ValueError):self.q.transition(one['key'],('collecting',),'source-review',token=one['token'])
 def test_failure_waits_until_retry_due(self):
  one=self.q.claim();self.q.transition(one['key'],('collecting',),'failed',token=one['token'],next_at=time.time()+3600);self.assertIsNone(self.q.claim())
 def test_review_states_do_not_autoapprove(self):
  one=self.q.claim();self.q.transition(one['key'],('collecting',),'source-review',token=one['token']);self.assertIsNone(self.q.claim())
 def test_unexpected_transition_refused(self):
  with self.assertRaises(ValueError):self.q.transition('UC-001/portrait',('staged',),'published')
 def test_checkpoint_preserves_state(self):
  self.q.export();r=json.loads((self.q.path/'queue.json').read_text());self.assertEqual(r['jobs'][0]['state'],'queued')
  with sqlite3.connect(self.q.path/'attention.backup.sqlite')as c:self.assertEqual(c.execute('select count(*) from jobs').fetchone()[0],1)
 def test_foreign_host_database_is_refused(self):
  with self.q.connect()as c:c.execute("UPDATE meta SET value='some-other-host' WHERE key='owner_host'")
  with self.assertRaisesRegex(ValueError,'owning host'):ops.Queue(self.q.path)
 def test_desk_escapes_feedback(self):
  self.q.flag('UC-001/portrait','<script>window.evil=true</script>');ops.desk(self.q)
  text=(self.q.path/'desk.html').read_text();self.assertNotIn('<script>window.evil',text);self.assertIn('&lt;script&gt;',text)
 def test_retry_retains_previous_run(self):
  one=self.q.claim();self.q.transition(one['key'],('collecting',),'source-review',token=one['token']);self.q.flag(one['key'],'Try an explicitly broader source search')
  two=self.q.claim();self.assertNotEqual(one['run'],two['run'])
 def hold_fixture(self):
  job=self.q.claim();run=self.root/'run';run.mkdir();document={'description':'Explicit source caption identifies a different fictional role.'};raw=json.dumps(document).encode();digest=ops.pm.sha(raw);(run/'doc.json').write_bytes(raw)
  candidate={'candidate_key':'candidate','source_sha256':'a'*64,'origin':'https://example.test/photo','documents':[{'path':'doc.json','sha256':digest}]}
  ops.pm.write(run/'candidates.json',{'candidates':[candidate]});source={'reviewer':'fixture-agent','candidate_holds':[{'candidate_key':'candidate','reason':'This role photograph is not a neutral performer portrait.','evidence':[{'document_sha256':digest,'quote':document['description']}]}]}
  return job,run,candidate,source
 def test_hold_is_exact_subject_and_bytes_scoped(self):
  job,run,candidate,source=self.hold_fixture();self.q.hold_candidates(job,run,source);self.assertTrue(self.q.held(job,candidate))
  self.assertIsNone(self.q.held(job,{**candidate,'source_sha256':'b'*64}))
  self.assertIsNone(self.q.held({**job,'snapshot':{**job['snapshot'],'actor':'Different performer'}},candidate))
 def test_hold_requires_retained_quote(self):
  job,run,candidate,source=self.hold_fixture();source['candidate_holds'][0]['evidence'][0]['quote']='Invented quotation not present in source'
  with self.assertRaisesRegex(ValueError,'quote absent'):self.q.hold_candidates(job,run,source)
  self.assertIsNone(self.q.held(job,candidate))
 def test_staged_task_cannot_be_discarded_by_flag(self):
  job=self.q.claim();self.q.transition(job['key'],('collecting',),'staged',token=job['token'])
  with self.assertRaisesRegex(ValueError,'unpublished'):self.q.flag(job['key'],'Do not replace an unpublished staged candidate')
 def test_portable_export_retains_holds_and_events(self):
  job,run,candidate,source=self.hold_fixture();self.q.hold_candidates(job,run,source);self.q.export();doc=ops.pm.read(self.q.path/'queue.json');self.assertEqual(len(doc['candidate_holds']),1);self.assertGreaterEqual(len(doc['events']),3)
class HtmlAdapterTests(unittest.TestCase):
 def test_does_not_execute_scripts(self):
  import photo_html
  result=photo_html.extract(b'<title>Official gallery</title><script>throw new Error("never execute")</script><img src="/photo.jpg" alt="A named portrait">','https://example.test/gallery/')
  self.assertEqual(result['images'][0]['url'],'https://example.test/photo.jpg');self.assertNotIn('never execute',result['text'])
 def test_full_image_literals_are_retained_not_guessed(self):
  import photo_html
  result=photo_html.extract(b'<script>var full="https://example.test/source/1.jpg";</script><img src="/thumb.jpg">','https://example.test/gallery/')
  self.assertEqual(len(result['images']),2);self.assertEqual(result['images'][0]['url'],'https://example.test/source/1.jpg')
 def test_html_entities_and_relative_urls(self):
  import photo_html
  result=photo_html.extract(b'<a href="/photo.jpg?a=1&amp;b=2">Open image</a>','https://example.test/')
  self.assertEqual(result['images'][0]['url'],'https://example.test/photo.jpg?a=1&b=2')
if __name__=='__main__':unittest.main(verbosity=2)
