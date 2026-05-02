import { test, expect } from '@playwright/test';

/**
 * Full upload + analysis pipeline test.
 *
 * Flow being tested:
 *  1. User opens upload modal, selects a .pcap file and clicks "Upload File".
 *  2. POST /packets/decode-stream-file → 200 OK
 *     → isUploading = true (button shows "Uploading...")
 *     → onUploadSuccess() closes the modal and calls getAllFlights()
 *  3. GET all-flight returns the new flight.
 *     → preparingMap.set(flightId) → "preparing analysis..." card appears.
 *     → progressService.connect(flightId) starts SignalR.
 *  4. SignalR handshake → JoinFlight(flightId) invoked by client.
 *  5. Server streams analysis-progress events (one per parameter).
 *     → preparingMap entry removed, progressMap updated.
 *     → UI shows "Analyzing completed/total" + progress bar %.
 *  6. Server sends analysis-stage: "historical"
 *     → UI shows "Searching historical points..."
 *  7. Server sends analysis-stage: "causality"
 *     → UI shows "Analyzing flight causality..."
 *  8. Server sends analysis-finished
 *     → progressMap deleted, flightAnalysisStageMap = "finished".
 *     → refreshFlightData() + refreshAllFlightsData() called.
 *     → UI: no more progress/preparing divs; anomaly/historical counts updated.
 */

const FLIGHT_ID = 7417;
const PCAP_FILE = 'tests/files/7417.pcap';

/** Build a SignalR JSON Hub Protocol server→client invocation frame. */
function hubFrame(target: string, arg: unknown): string {
  return JSON.stringify({ type: 1, target, arguments: [arg] }) + '\x1e';
}

test('upload PCAP → modal closes → SignalR analysis pipeline → flight data ready', async ({ page }) => {

  // ── HTTP mock: GET all-flight ─────────────────────────────────────────────
  // First call (ngOnInit → loadFlights): no flights yet.
  // All subsequent calls (onUploadSuccess → getAllFlights): new flight present.
  let flightsCallCount = 0;
  await page.route('**/TelemetryDataArchive/all-flight', async (route) => {
    flightsCallCount++;
    await route.fulfill({
      json: flightsCallCount === 1
        ? []
        : [{ flightNumber: FLIGHT_ID, flightLenght: 3600 }],
    });
  });

  // ── HTTP mock: GET special-points ─────────────────────────────────────────
  // First call (loadAnomaliesForFlight during onUploadSuccess): analysis not done → null.
  // Subsequent calls (refreshFlightData after analysis-finished): real data.
  let specialCallCount = 0;
  await page.route(`**/get-all-special-points-for-flight/${FLIGHT_ID}`, async (route) => {
    specialCallCount++;
    await route.fulfill({
      json: specialCallCount === 1
        ? null
        : {
            anomalies: {
              PARAM_A: [100, 200, 300], // 3 anomalies
              PARAM_B: [400],           // 1 anomaly
              PARAM_C: [500, 600],      // 2 anomalies  → total: 6
            },
            historicalSimilarity: {
              PARAM_A: [{ anomalyTime: 100 }, { anomalyTime: 200 }], // 2
              PARAM_B: [{ anomalyTime: 400 }],                        // 1
              PARAM_C: [],                                             // 0 → total: 3
            },
          },
    });
  });

  // ── HTTP mock: POST decode-stream-file ────────────────────────────────────
  // Small artificial delay so the "Uploading..." spinner is observable.
  await page.route('**/packets/decode-stream-file', async (route) => {
    await new Promise<void>((resolve) => setTimeout(resolve, 300));
    await route.fulfill({ status: 200, body: '' });
  });

  // ── SignalR mock: negotiate ───────────────────────────────────────────────
  // SignalR first POSTs to /negotiate to get a connection token; we return a
  // minimal valid response directing the client to use WebSockets only.
  await page.route('**/analysis-progress/negotiate**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        negotiateVersion: 1,
        connectionId: 'test-conn-id',
        connectionToken: 'test-token',
        availableTransports: [
          { transport: 'WebSockets', transferFormats: ['Text', 'Binary'] },
        ],
      }),
    });
  });

  // ── SignalR mock: WebSocket ───────────────────────────────────────────────
  // After negotiation the client opens a WebSocket and sends the JSON Hub
  // Protocol handshake.  Once it invokes JoinFlight we emit the full pipeline.
  await page.routeWebSocket(/analysis-progress/, (ws) => {
    let handshakeDone = false;

    ws.onMessage((raw) => {
      const msg = typeof raw === 'string' ? raw : raw.toString();

      // Step A: answer SignalR JSON Hub Protocol handshake  {"protocol":"json","version":1}\x1e
      if (!handshakeDone && msg.includes('"protocol"')) {
        handshakeDone = true;
        ws.send('{}\x1e');
        return;
      }

      // Step B: client invokes JoinFlight(FLIGHT_ID) → emit analysis events
      if (msg.includes('JoinFlight')) {
        const TOTAL_PARAMS = 5;
        const PARAM_STEP_MS = 200;  // gap between parameter events
        const STAGE_HOLD_MS = 1500; // each stage stays visible long enough to assert

        const lastParamAt = TOTAL_PARAMS * PARAM_STEP_MS; // 1000ms

        // analysis-progress: one event per parameter
        for (let i = 1; i <= TOTAL_PARAMS; i++) {
          setTimeout(() => ws.send(hubFrame('analysis-progress', {
            flightId: FLIGHT_ID,
            completedParameters: i,
            totalParameters: TOTAL_PARAMS,
            parameter: `PARAM_${i}`,
          })), i * PARAM_STEP_MS);
        }

        // analysis-stage: historical  (backend searching past flights)
        setTimeout(() => ws.send(hubFrame('analysis-stage', {
          flightId: FLIGHT_ID,
          stage: 'historical',
        })), lastParamAt + STAGE_HOLD_MS);           // 2500ms

        // analysis-stage: causality  (backend running causality model)
        setTimeout(() => ws.send(hubFrame('analysis-stage', {
          flightId: FLIGHT_ID,
          stage: 'causality',
        })), lastParamAt + 2 * STAGE_HOLD_MS);       // 4000ms

        // analysis-finished  (all stages done)
        setTimeout(() => ws.send(hubFrame('analysis-finished', {
          flightId: FLIGHT_ID,
        })), lastParamAt + 3 * STAGE_HOLD_MS);       // 5500ms
      }
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // Navigate
  // ════════════════════════════════════════════════════════════════════════════
  await page.goto('http://localhost:4200');

  // Initial state: no flights in list, upload modal is closed.
  await expect(page.locator('.uploadOverlay')).not.toHaveClass(/active/);
  await expect(page.locator('.noFlights')).toBeVisible();

  // ── Step 1: Open upload modal ─────────────────────────────────────────────
  await page.getByRole('button', { name: 'Add Flight' }).click();

  await expect(page.locator('.uploadOverlay')).toHaveClass(/active/);
  await expect(page.locator('.uploadModal')).toBeVisible();

  // ── Step 2: Select PCAP file ──────────────────────────────────────────────
  await page.locator('input.hiddenFileInput').setInputFiles(PCAP_FILE);

  // File preview shows the chosen file name.
  await expect(page.locator('.fileName')).toHaveText('7417.pcap');

  // Upload button becomes enabled.
  await expect(page.locator('button.uploadBtn')).not.toBeDisabled();

  // ── Step 3: Click Upload File ─────────────────────────────────────────────
  await page.locator('button.uploadBtn').click();

  // While HTTP request is in flight: button switches to spinner + "Uploading..."
  await expect(page.locator('button.uploadBtn')).toContainText('Uploading...');

  // ── Step 4: Modal closes after HTTP 200 ───────────────────────────────────
  // onUploadSuccess() sets isUploading=false and calls closeUploadModal().
  await expect(page.locator('.uploadOverlay')).not.toHaveClass(/active/, {
    timeout: 10_000,
  });

  // ── Step 5: New flight card appears ───────────────────────────────────────
  // getAllFlights() (2nd call) returns the new flight; Angular renders the card.
  const flightCard = page
    .locator('.flightCard')
    .filter({ has: page.locator('.flightNumber', { hasText: String(FLIGHT_ID) }) });

  await expect(flightCard).toBeVisible({ timeout: 10_000 });

  // ── Step 6: Preparing state ───────────────────────────────────────────────
  // preparingMap.set(flightId) is set before SignalR connects.
  // progressMap does NOT have the flight yet → .analysisPreparing is shown.
  await expect(flightCard.locator('.analysisPreparing')).toBeVisible({ timeout: 5_000 });
  await expect(flightCard.locator('.analysisPreparing')).toContainText('preparing analysis...');

  // ── Step 7: Parameter analysis (analysis-progress events) ─────────────────
  // First analysis-progress event: preparingMap entry deleted, progressMap set.
  // .analysisProgress becomes visible; .analysisText shows "Analyzing X/Y".
  await expect(flightCard.locator('.analysisProgress')).toBeVisible({ timeout: 10_000 });
  await expect(flightCard.locator('.analysisText')).toContainText('Analyzing', { timeout: 10_000 });

  // After all 5 parameters: getProgressPercent returns 100.
  await expect(flightCard.locator('.analysisPercentTop')).toHaveText('100%', {
    timeout: 15_000,
  });

  // ── Step 8: Historical similarity search ──────────────────────────────────
  // analysis-stage "historical" → flightAnalysisStageMap = "historical"
  // getFlightAnalysisStatusText returns "Searching historical points..."
  // (progressMap still has flight so .analysisProgress stays visible)
  await expect(flightCard.locator('.analysisText')).toHaveText(
    'Searching historical points...',
    { timeout: 10_000 },
  );

  // ── Step 9: Causality analysis ────────────────────────────────────────────
  // analysis-stage "causality" → "Analyzing flight causality..."
  await expect(flightCard.locator('.analysisText')).toHaveText(
    'Analyzing flight causality...',
    { timeout: 10_000 },
  );

  // ── Step 10: Analysis finished ────────────────────────────────────────────
  // analysis-finished:
  //   progressMap.delete(flightId)  → .analysisProgress hidden
  //   flightAnalysisStageMap = "finished"
  //   refreshFlightData() + refreshAllFlightsData() called
  await expect(flightCard.locator('.analysisProgress')).not.toBeVisible({ timeout: 10_000 });
  await expect(flightCard.locator('.analysisPreparing')).not.toBeVisible();

  // ── Step 11: Flight shows refreshed anomaly + historical counts ───────────
  // refreshFlightData() triggers the 2nd call to get-all-special-points,
  // which returns real data.  buildParameterOverviewList populates the maps.
  //
  // getTotalAnomalies:   3 + 1 + 2 = 6
  // getTotalHistorical:  2 + 1 + 0 = 3
  await expect(flightCard.locator('.anomalyTotal')).toContainText('6 unusual points', {
    timeout: 5_000,
  });
  await expect(flightCard.locator('.historicalTotal')).toContainText('3 historical points', {
    timeout: 5_000,
  });
});
