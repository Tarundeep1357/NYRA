import json
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

import server


class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.original = server.DATA
        server.DATA = Path(self.temp.name)
        server.initialize()

    def tearDown(self):
        server.DATA = self.original
        self.temp.cleanup()

    def test_voice_task_round_trip_and_persistence(self):
        answer = server.run_command('Hey Nyra, add task: Finish the report')
        self.assertIn('Added', answer['content'])
        server.initialize()
        self.assertEqual(server.state()['tasks'][0]['title'], 'Finish the report')
        server.run_command('Complete task Finish the report')
        self.assertTrue(server.state()['tasks'][0]['done'])

    def test_ambiguous_completion_does_not_mutate_tasks(self):
        server.add_task('Read')
        server.add_task('Read')
        result = server.run_command('complete task Read')
        self.assertIn('exact task', result['content'])
        self.assertTrue(all(not task['done'] for task in server.state()['tasks']))

    def test_memory_is_saved_verbatim_as_data(self):
        server.run_command('Remember that I prefer short answers')
        self.assertEqual(server.state()['memories'][0]['content'], 'I prefer short answers')

    def test_missing_model_does_not_pretend_to_execute(self):
        result = server.run_command('Write a Python script')
        self.assertIn('connect an installed Ollama model', result['content'])
        self.assertIsNone(server.ACTIVE['agent'])

    def test_laptop_actions_wait_for_ok(self):
        prepared = server.run_command('Open VS Code')
        self.assertIn('Say “OK”', prepared['content'])
        self.assertEqual(server.state()['pending_action']['kind'], 'vscode')
        with patch.object(server, '_open_vscode', return_value='VS Code is open.') as launch:
            completed = server.run_command('OK')
        launch.assert_called_once_with(None)
        self.assertIn('VS Code is open', completed['content'])
        self.assertIsNone(server.state()['pending_action'])

    def test_pending_action_expires_before_confirmation(self):
        server.queue_action('app', {'name': 'calculator'}, 'Open calculator')
        expiry = server.PENDING_ACTION['expires_at']
        with patch.object(server.time, 'time', return_value=expiry + 1):
            self.assertIsNone(server.state()['pending_action'])
            result = server.run_command('OK')
        self.assertIn('no laptop action', result['content'])

    def test_gemini_models_are_offered_only_when_key_is_configured(self):
        with patch.dict(server.os.environ, {'GEMINI_API_KEY': 'test-key'}), patch.object(server, 'provider', side_effect=OSError):
            result = server.models()
        self.assertTrue(result['connected'])
        self.assertIn('gemini-2.5-flash', result['models'])

    def test_organize_action_moves_files_without_deleting(self):
        folder = Path(self.temp.name) / 'inbox'
        folder.mkdir()
        (folder / 'notes.txt').write_text('hello', encoding='utf-8')
        server.run_command(f'Organize files in {folder}')
        with patch.object(server, '_organize_files', wraps=server._organize_files) as organize:
            result = server.run_command('OK')
        organize.assert_called_once_with(str(folder))
        self.assertIn('organized 1 files', result['content'])
        self.assertTrue((folder / 'txt' / 'notes.txt').is_file())

    def test_specialist_review_and_feedback_context(self):
        server.query('UPDATE settings SET value=? WHERE key=?', (json.dumps('test-model'), 'model'))
        server.remember('Use Python')
        prior = server.message('assistant', 'Old draft')
        server.query('INSERT INTO feedback VALUES (?,?,?)', (prior['id'], -1, 'Show usage examples'))
        with patch.object(server, 'generate', side_effect=['draft code', 'reviewed code']) as generate:
            answer = server.run_command('Write a Python function')
        self.assertEqual(answer['content'], 'reviewed code')
        self.assertEqual(answer['agent'], 'coder')
        self.assertEqual(generate.call_count, 2)
        self.assertIn('Use Python', generate.call_args_list[0].args[0])
        self.assertIn('Show usage examples', generate.call_args_list[0].args[0])

    def test_model_failure_unlocks_runtime(self):
        server.query('UPDATE settings SET value=? WHERE key=?', (json.dumps('test-model'), 'model'))
        with patch.object(server, 'generate', side_effect=ValueError('Connection failed')):
            answer = server.run_command('Explain gravity')
        self.assertIn('Connection failed', answer['content'])
        self.assertIsNone(server.ACTIVE['agent'])
        self.assertFalse(server.RUN_LOCK.locked())

    def test_review_failure_preserves_honest_draft(self):
        server.query('UPDATE settings SET value=? WHERE key=?', (json.dumps('test-model'), 'model'))
        with patch.object(server, 'generate', side_effect=['A useful draft', ValueError('Review failed')]):
            answer = server.run_command('Explain gravity')
        self.assertIn('A useful draft', answer['content'])
        self.assertIn('unreviewed', answer['content'])

    def test_daily_brief_is_once_per_day_and_survives_restart(self):
        server.add_task('Plan the launch')
        morning = datetime(2026, 9, 20, 9, 1)
        server.scheduler_tick(morning)
        server.initialize()
        server.scheduler_tick(morning)
        self.assertEqual(len(server.state()['messages']), 1)
        server.scheduler_tick(datetime(2026, 9, 21, 9, 1))
        self.assertEqual(len(server.state()['messages']), 2)

    def test_disabled_or_early_brief_does_not_fire(self):
        server.scheduler_tick(datetime(2026, 9, 20, 8, 59))
        self.assertEqual(server.state()['messages'], [])
        server.query('UPDATE settings SET value=? WHERE key=?', ('false', 'daily_brief'))
        server.scheduler_tick(datetime(2026, 9, 20, 12))
        self.assertEqual(server.state()['messages'], [])

    def test_oversized_or_empty_command_is_rejected_before_persistence(self):
        for command in ('', '  ', None, 'x' * 8001):
            with self.assertRaises(ValueError):
                server.run_command(command)
        self.assertEqual(server.state()['messages'], [])

    def test_focus_timer_fires_once_after_deadline(self):
        with patch.object(server.time, 'time', return_value=1000):
            result = server.run_command('Start a 25 minute focus timer')
        self.assertIn('25-minute timer is running', result['content'])
        self.assertEqual(server.state()['timers'][0]['due'], 2500)
        with patch.object(server.time, 'time', return_value=2501):
            server.scheduler_tick(datetime(2026, 9, 20, 8))
            server.scheduler_tick(datetime(2026, 9, 20, 8))
        self.assertEqual(server.state()['timers'], [])
        fired = [message for message in server.state()['messages'] if message['content'].startswith('Timer finished:')]
        self.assertEqual(len(fired), 1)

    def test_app_launch_is_allowlisted_and_has_no_shell(self):
        with patch.object(server.subprocess, 'Popen') as popen:
            server.launch_app('calculator')
        self.assertTrue(popen.call_args.args[0][0].endswith('calc.exe'))
        self.assertFalse(popen.call_args.kwargs['shell'])
        with self.assertRaises(ValueError):
            server.launch_app('calc.exe & powershell')

    def test_generated_code_is_saved_but_not_executed(self):
        with patch.object(server.subprocess, 'Popen') as popen:
            answer = server.save_code('Example:\n```python\nprint("hello")\n```')
        artifact = server.state()['artifacts'][0]
        self.assertIn('Code has not been executed', answer)
        self.assertEqual((server.DATA / 'artifacts' / artifact['name']).read_text(), 'print("hello")\n')
        popen.assert_not_called()

    def test_cloud_models_are_not_offered_as_local(self):
        with patch.object(server, 'provider', return_value={'models': [
                {'name': 'local:3b'}, {'name': 'remote:cloud', 'remote_host': 'https://ollama.com'}, {'name': 'another-cloud'}]}), \
                patch.dict(server.os.environ, {'GEMINI_API_KEY': ''}):
            self.assertEqual(server.models()['models'], ['local:3b'])


    def test_unknown_tool_cannot_be_queued(self):
        with self.assertRaises(ValueError):
            server.queue_action('shell', {'command': 'rm -rf /'}, 'Dangerous action')
        self.assertIsNone(server.state()['pending_action'])

    def test_calendar_request_needs_ok_and_reads_read_only(self):
        server.query('INSERT OR REPLACE INTO settings VALUES (?,?)', ('google_client_id', json.dumps('id.apps.googleusercontent.com')))
        server.query('INSERT OR REPLACE INTO settings VALUES (?,?)', ('google_client_secret', json.dumps('ghs-secret')))
        server.query('INSERT OR REPLACE INTO settings VALUES (?,?)', ('google_refresh_token', json.dumps('refresh-1')))
        prepared = server.run_command('What’s on my calendar?')
        self.assertIn('Say “OK”', prepared['content'])
        pending = server.state()['pending_action']
        self.assertEqual(pending['kind'], 'calendar_read')
        self.assertEqual(pending['domain'], 'cloud')
        events = [{'summary': 'Standup', 'start': '2026-11-09T09:30:00Z'}]
        with patch.object(server, 'calendar_upcoming', return_value=events) as read:
            completed = server.run_command('OK')
        read.assert_called_once_with(5, 7)
        self.assertIn('Standup', completed['content'])
        self.assertIn('read-only', completed['content'])
        self.assertIsNone(server.state()['pending_action'])

    def test_calendar_is_refused_without_ok(self):
        with patch.object(server, '_tool_calendar_read') as read:
            answer = server.run_command('Show my calendar')
        read.assert_not_called()
        self.assertIn('not connected', answer['content'])

    def test_secrets_never_reach_public_state(self):
        server.query('INSERT OR REPLACE INTO settings VALUES (?,?)', ('google_client_secret', json.dumps('top-secret')))
        server.query('INSERT OR REPLACE INTO settings VALUES (?,?)', ('google_refresh_token', json.dumps('refresh-secret')))
        state = server.state()
        self.assertNotIn('google_client_secret', state['settings'])
        self.assertNotIn('google_refresh_token', state['settings'])
        self.assertNotIn('top-secret', json.dumps(state))

    def test_api_key_is_rejected_as_oauth_secret(self):
        with self.assertRaises(ValueError):
            server.connect_calendar_credentials('id.apps.googleusercontent.com', 'AIzaSyExampleKey1234567890')
        self.assertEqual(server.settings()['google_client_secret'], '')

    def test_calendar_authorize_url_is_read_only(self):
        server.query('INSERT OR REPLACE INTO settings VALUES (?,?)', ('google_client_id', json.dumps('id.apps.googleusercontent.com')))
        url = server.calendar_authorize(server.settings()['google_client_id'])
        self.assertTrue(url.startswith('https://accounts.google.com/o/oauth2/v2/auth?'))
        self.assertIn('calendar.readonly', url)
        self.assertIn('redirect_uri=http%3A%2F%2Flocalhost', url)


if __name__ == '__main__':
    unittest.main()
