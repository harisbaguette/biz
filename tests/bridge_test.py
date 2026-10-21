import fcntl
import hashlib
import io
import time
from unittest.mock import patch
import json
import sys
import tempfile
import unittest
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'connector'))
from bridge import apply_command,read_json,thumbnails,tick,request
from snapshot import uploader_observation
class BridgeTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.runtime=Path(self.temp.name)
  for folder in ['automation','production']:
   p=self.runtime/folder;p.mkdir();(p/'config.json').write_text(json.dumps({'enabled':True,'project':'test-source','keep':'unchanged'}))
  (self.runtime/'automation/status.json').write_text(json.dumps({'next_at':'2030-01-01T00:00:00+09:00','accounts':{'1':{'retry_at':'later','failures':2,'status':'login_required'},'2':{'status':'review_scheduled'}}}))
 def tearDown(self):self.temp.cleanup()
 def test_http_client_identifies_bridge_and_preserves_authenticated_json(self):
  received=[]
  class Handler(BaseHTTPRequestHandler):
   def do_POST(self):
    agent=self.headers.get('User-Agent','')
    if not agent or agent.startswith('Python-urllib'):
     self.send_error(403);return
    body=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
    received.append((agent,self.headers.get('Authorization'),self.headers.get('Accept'),body))
    self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers()
    self.wfile.write(b'{"ok":true}')
   def log_message(self,*args):pass
  server=HTTPServer(('127.0.0.1',0),Handler)
  thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
  try:
   self.assertEqual(request(f'http://127.0.0.1:{server.server_port}','test-token','/api/bridge/snapshot',{'name':'관제'}),{'ok':True})
   self.assertIn('BluekiteBizBridge',received[0][0])
   self.assertEqual(received[0][1:],('Bearer test-token','application/json',{'name':'관제'}))
  finally:server.shutdown();thread.join();server.server_close()
 def test_supported_setting_only(self):
  apply_command({'action':'automation','payload':{'lane':'production','enabled':False}},self.runtime,[{'id':'1'}])
  self.assertEqual(read_json(self.runtime/'production/config.json'),{'enabled':False,'project':'test-source','keep':'unchanged'})
  self.assertTrue(read_json(self.runtime/'automation/config.json')['enabled'])
 def test_running_worker_lock_prevents_overwrite(self):
  lock=(self.runtime/'automation/run.lock').open('a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  with self.assertRaises(RuntimeError):apply_command({'action':'recheck','payload':{'accountId':'1'}},self.runtime,[{'id':'1'}])
  self.assertEqual(read_json(self.runtime/'automation/status.json')['accounts']['1']['failures'],2);lock.close()
 def test_recheck_preserves_interval_and_other_account(self):
  apply_command({'action':'recheck','payload':{'accountId':'1'}},self.runtime,[{'id':'1'}])
  s=read_json(self.runtime/'automation/status.json');self.assertNotIn('retry_at',s['accounts']['1']);self.assertEqual(s['next_at'],'2030-01-01T00:00:00+09:00');self.assertEqual(s['accounts']['2']['status'],'review_scheduled')
 def test_invalid_commands_are_rejected(self):
  for cmd in [{'action':'shell','payload':{}},{'action':'automation','payload':{'lane':'../escape','enabled':True}},{'action':'recheck','payload':{'accountId':'99'}}]:
   with self.assertRaises(ValueError):apply_command(cmd,self.runtime,[{'id':'1'}])
 def test_preview_reports_missing_and_corrupt_files_without_starving_valid_file(self):
  from PIL import Image
  valid=self.runtime/'valid.png';Image.new('RGB',(10,10),'blue').save(valid)
  corrupt=self.runtime/'corrupt.png';corrupt.write_bytes(b'not-an-image')
  snapshot={'accounts':[],'assets':[]};failures=[]
  result=thumbnails(snapshot,{'missing':str(self.runtime/'absent.png'),'corrupt':str(corrupt),'valid':str(valid)},{},['missing','corrupt','valid'],failures)
  self.assertEqual([i['id'] for i in result],['valid'])
  self.assertEqual({i['id'] for i in failures},{'missing','corrupt'})
  self.assertFalse(any(str(self.runtime) in item['message'] for item in failures))
 def test_requested_preview_bypasses_stale_local_cache(self):
  from PIL import Image
  valid=self.runtime/'valid.png';Image.new('RGB',(10,10),'blue').save(valid)
  stamp=str(valid.stat().st_mtime_ns)
  result=thumbnails({'accounts':[],'assets':[]},{'valid':str(valid)},{'valid':stamp},['valid'])
  self.assertEqual(len(result),1)
 def test_uploader_observation_probes_lock_and_mtime_without_writes(self):
  status=self.runtime/'automation/status.json';before=status.read_bytes();mtime=status.stat().st_mtime_ns
  missing=uploader_observation(self.runtime)
  self.assertFalse(missing['runLockActive']);self.assertFalse((self.runtime/'automation/run.lock').exists())
  lock=(self.runtime/'automation/run.lock').open('a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  observed=uploader_observation(self.runtime);self.assertTrue(observed['runLockActive']);self.assertEqual(observed['pollIntervalSeconds'],60)
  lock.close();self.assertFalse(uploader_observation(self.runtime)['runLockActive'])
  self.assertEqual(status.read_bytes(),before);self.assertEqual(status.stat().st_mtime_ns,mtime)
 def test_tick_acknowledges_preview_failures_and_uploads_later_valid_file(self):
  from PIL import Image
  valid=self.runtime/'valid.png';Image.new('RGB',(10,10),'blue').save(valid)
  snapshot={'accounts':[],'assets':[]};calls=[]
  def request_fixture(base,token,path,body=None):
   calls.append((path,body))
   return {'commands':[],'previews':['missing','valid']} if path=='/api/bridge/commands' else {'ok':True}
  cache={'_snapshot':snapshot,'_files':{'valid':str(valid)},'_last_snapshot':time.monotonic()}
  with patch('bridge.request',side_effect=request_fixture):
   result=tick({'source':str(self.runtime),'runtime':str(self.runtime),'url':'https://fixture.invalid','token':'test','receipts':str(self.runtime/'receipts.json')},cache)
  failed=next(body for path,body in calls if path=='/api/bridge/preview-results')
  sent=next(body for path,body in calls if path=='/api/bridge/thumbnails')
  self.assertEqual(failed['items'][0]['id'],'missing');self.assertEqual(sent['items'][0]['id'],'valid');self.assertEqual(result['thumbnails'],1)
if __name__=='__main__':unittest.main()
