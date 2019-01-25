# Copyright 2017 The Chromium Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

import httplib2

from google.appengine.datastore import datastore_query
from google.appengine.ext import ndb

from dashboard import alerts
from dashboard import file_bug
from dashboard.api import api_request_handler
from dashboard.api import utils as api_utils
from dashboard.common import request_handler
from dashboard.common import utils
from dashboard.models import anomaly
from dashboard.models import report_template
from dashboard.services import issue_tracker_service


class AlertsHandler(api_request_handler.ApiRequestHandler):
  """API handler for various alert requests."""

  def _AllowAnonymous(self):
    return True

  def _RecentBugs(self):
    if not utils.IsValidSheriffUser():
      raise api_request_handler.BadRequestError(
          'Only chromium.org accounts may query recent bugs')
    http = utils.ServiceAccountHttp()  # TODO use self._AuthorizedHttp()
    issue_tracker = issue_tracker_service.IssueTrackerService(http)
    response = issue_tracker.List(
        q='opened-after:today-5', label='Type-Bug-Regression,Performance',
        sort='-id')
    return {'bugs': response.get('items', [])}

  def _CheckUser(self):
    pass

  def Post(self, *args):
    """Returns alert data in response to API requests.

    Possible list types:
      keys: A comma-separated list of urlsafe Anomaly keys.
      bug_id: A bug number on the Chromium issue tracker.
      rev: A revision number.

    Outputs:
      Alerts data; see README.md.
    """
    alert_list = None
    response = {}
    try:
      if len(args) == 0:
        is_improvement = api_utils.ParseBool(self.request.get(
            'is_improvement', None))
        recovered = api_utils.ParseBool(self.request.get('recovered', None))
        start_cursor = self.request.get('cursor', None)
        if start_cursor:
          start_cursor = datastore_query.Cursor(urlsafe=start_cursor)

        min_timestamp = api_utils.ParseISO8601(self.request.get(
            'min_timestamp', None))
        max_timestamp = api_utils.ParseISO8601(self.request.get(
            'max_timestamp', None))

        test_keys = [test_key
                     for template_id in self.request.get_all('report')
                     for test_key in report_template.TestKeysForReportTemplate(
                         template_id)]

        try:
          alert_list, next_cursor, _ = anomaly.Anomaly.QueryAsync(
              bot_name=self.request.get('bot', None),
              bug_id=self.request.get('bug_id', None),
              is_improvement=is_improvement,
              key=self.request.get('key', None),
              limit=int(self.request.get('limit', 100)),
              master_name=self.request.get('master', None),
              max_end_revision=self.request.get('max_end_revision', None),
              max_start_revision=self.request.get('max_start_revision', None),
              max_timestamp=max_timestamp,
              min_end_revision=self.request.get('min_end_revision', None),
              min_start_revision=self.request.get('min_start_revision', None),
              min_timestamp=min_timestamp,
              recovered=recovered,
              sheriff=self.request.get('sheriff', None),
              start_cursor=start_cursor,
              test=self.request.get('test', None),
              test_keys=test_keys,
              test_suite_name=self.request.get('test_suite', None)).get_result()
        except AssertionError:
          alert_list, next_cursor = [], None
        if next_cursor:
          response['next_cursor'] = next_cursor.urlsafe()
      else:
        list_type = args[0]
        if list_type == 'recent_bugs':
          return self._RecentBugs()
    except request_handler.InvalidInputError as e:
      raise api_request_handler.BadRequestError(e.message)

    response['anomalies'] = alerts.AnomalyDicts2(alert_list)
    return response
