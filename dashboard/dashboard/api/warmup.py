# Copyright 2019 The Chromium Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

import datetime
import random
import time

from google.appengine.ext import ndb

from dashboard import add_histograms
from dashboard import update_test_suite_descriptors
from dashboard import update_test_suites
from dashboard.api import api_request_handler
from dashboard.common import datastore_hooks
from dashboard.common import descriptor
from dashboard.common import utils
from dashboard.models import anomaly
from dashboard.models import graph_data
from dashboard.models import report_template
from dashboard.models import sheriff
from tracing.value import histogram_set
from tracing.value.diagnostics import date_range
from tracing.value.diagnostics import generic_set
from tracing.value.diagnostics import reserved_infos


CLEAR_KINDS = [
    anomaly.Anomaly,
    graph_data.Row,
    graph_data.TestMetadata,
    report_template.ReportTemplate,
]


def Noise(magnitude=1):
  return random.random() * magnitude


def CreateFakeData(index, rts, bot, suite, case=None, measurements=3):
  # Simulate a regression. The unit is biggerIsBetter, start high then drop down
  # after a few data points
  baseline = 5 if index < 50 else 0

  hs = histogram_set.HistogramSet()
  for name in range(measurements):
    hs.CreateHistogram(
        'measurement%d' % name, 'unitless_biggerIsBetter',
        [baseline + Noise() for _ in range(5)],
        summary_options={'min': False, 'max': False, 'count': False})

  hs.AddSharedDiagnosticToAllHistograms(
      reserved_infos.MASTERS.name, generic_set.GenericSet(['TestMaster']))
  hs.AddSharedDiagnosticToAllHistograms(
      reserved_infos.BOTS.name, generic_set.GenericSet([bot]))
  hs.AddSharedDiagnosticToAllHistograms(
      reserved_infos.REVISION_TIMESTAMPS.name, date_range.DateRange(rts))
  hs.AddSharedDiagnosticToAllHistograms(
      reserved_infos.BENCHMARKS.name, generic_set.GenericSet([suite]))
  if case:
    hs.AddSharedDiagnosticToAllHistograms(
        reserved_infos.STORIES.name, generic_set.GenericSet([case]))

  return hs


def AddFakeData(revs=100, suites=2, bots=3, cases=3, measurements=3):
  assert utils.IsDevAppserver()  # THIS BEARS REPEATING!

  sheriff.Sheriff(
      key=ndb.Key('Sheriff', 'Chromium Perf Sheriff'),
      email='test@example.com',
      internal_only=False,
      patterns=[
          'TestMaster/bot%d/test_suite_%d/measurement%d/case%d' % (
              bot, suite, measurement, case)
          for bot in range(bots)
          for suite in range(suites)
          for measurement in range(measurements)
          for case in range(cases)
      ]).put()

  now = datetime.date.today()
  for suite in range(suites):
    suite = 'test_suite_%d' % suite
    for d in range(revs):
      rts = now - datetime.timedelta(days=(revs - d))
      rts = int(time.mktime(rts.timetuple()))
      for bot in range(bots):
        bot = 'bot%d' % bot
        hs = CreateFakeData(d, rts, bot, suite, measurements=measurements)
        for case in range(cases):
          case = 'case%d' % case
          hs.ImportDicts(CreateFakeData(
              d, rts, bot, suite, case, measurements).AsDicts())
        hs.DeduplicateDiagnostics()
        add_histograms.ProcessHistogramSet(hs.AsDicts())
    update_test_suite_descriptors._UpdateDescriptor(
        suite, datastore_hooks.EXTERNAL)
    update_test_suite_descriptors._UpdateDescriptor(
        suite, datastore_hooks.INTERNAL)

  update_test_suites.UpdateTestSuites(datastore_hooks.EXTERNAL)
  update_test_suites.UpdateTestSuites(datastore_hooks.INTERNAL)

  # PutTemplate() requires utils.GetEmail(), which is unset when appengine
  # hits /_ah/warmup.
  report_template.ReportTemplate(
      name='Chromium Performance Overview',
      internal_only=False,
      owners=['test@example.com'],
      template={
          'rows': [
              {
                  'testSuites': ['test_suite_%d' % i for i in range(1)],
                  'bots': ['TestMaster:bot%d' % i for i in range(1)],
                  'testCases': ['case%d' % i for i in range(1)],
                  'measurement': 'measurement%d' % name,
              }
              for name in range(3)
          ],
      }).put()


class WarmupHandler(api_request_handler.ApiRequestHandler):
  def _CheckUser(self):
    pass

  def get(self):
    descriptor.Descriptor.Warmup()

    # DO NOT RUN ANY OF THIS CODE IN PRODUCTION!
    # THIS CHECK IS EXTREMELY IMPORTANT!
    if not utils.IsDevAppserver():
      return

    if self.request.get('clear'):
      # To clear the datastore, hit /_ah/warmup?clear=clear
      for kind in CLEAR_KINDS:
        assert utils.IsDevAppserver()  # THIS BEARS REPEATING!
        ndb.delete_multi(kind.query().fetch(keys_only=True))

    for alert in anomaly.Anomaly.query(anomaly.Anomaly.bug_id != None).fetch():
      # Some of the alerts were triaged, so untriage them.
      alert.bug_id = None
      alert.put()

    if not graph_data.TestMetadata.query().get():
      AddFakeData()
