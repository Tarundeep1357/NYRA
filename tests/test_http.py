import json
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from http.server import ThreadingHTTPServer

import server


class HttpTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.original_data, self.original_port = server.DATA, server.PORT
        server.DATA = Path(self.temp.name)
        server.initialize()
        self.http = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        server.PORT = self.http.server_port
        self.origin = f'http://127.0.0.1:{server.PORT}'
        threading.Thread(target=self.http.serve_forever, daemon=True).start()

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        server.DATA, server.PORT = self.original_data, self.original_port
        self.temp.cleanup()

    def request(self, path, data=None, headers=None):
        request = Request(self.origin + path, data=json.dumps(data).encode() if data is not None else None,
                          headers=headers or {})
        try:
            with urlopen(request, timeout=4) as response:
                return response.status, response.read(), response.headers
        except HTTPError as error:
            return error.code, error.read(), error.headers

    def test_mutations_require_session_token_and_same_origin(self):
        self.assertEqual(self.request('/api/tasks', {'title': 'Bad request'})[0], 403)
        self.assertEqual(self.request('/api/tasks', {'title': 'Cross-site'},
                         {'X-Nyra-Token': server.TOKEN, 'Origin': 'https://untrusted.example'})[0], 403)
        code, _, _ = self.request('/api/tasks', {'title': 'Allowed'},
                                  {'X-Nyra-Token': server.TOKEN, 'Origin': self.origin})
        self.assertEqual(code, 200)
        self.assertEqual([task['title'] for task in server.state()['tasks']], ['Allowed'])

    def test_unknown_host_and_private_file_paths_are_blocked(self):
        self.assertEqual(self.request('/api/session', headers={'Host': 'untrusted.example'})[0], 403)
        for path in ('/data/nyra.db', '/server.py', '/../server.py'):
            self.assertEqual(self.request(path)[0], 404)

    def test_artifacts_download_as_attachments_not_executable_pages(self):
        server.save_code('```html\n<script>alert("example")</script>\n```')
        artifact = server.state()['artifacts'][0]
        code, body, headers = self.request('/api/artifact/' + artifact['id'])
        self.assertEqual(code, 200)
        self.assertIn(b'<script>', body)
        self.assertIn('attachment;', headers['Content-Disposition'])
        self.assertEqual(headers['Content-Type'], 'application/octet-stream')
        self.assertEqual(self.request('/api/artifact/../../server.py')[0], 404)


if __name__ == '__main__':
    unittest.main()
