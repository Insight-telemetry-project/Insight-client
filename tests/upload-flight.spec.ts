import { test, expect, Page } from '@playwright/test';

// ─── Constants ───────────────────────────────────────────────────────────────

const FLIGHT_A = 7417;
const FILE_A   = 'tests/files/7417.pcap';

const FLIGHT_B = 9164;
const FILE_B   = 'tests/files/9164.pcap';

const TOTAL_PARAMS  = 5;
const PARAM_STEP_MS = 200;
const STAGE_HOLD_MS = 1500;
const LAST_PARAM_AT = TOTAL_PARAMS * PARAM_STEP_MS;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hubFrame(target: string, arg: unknown): string {
  return JSON.stringify({ type: 1, target, arguments: [arg] }) + '\x1e';
}

function schedulePipeline(ws: { send: (m: string) => void }, flightId: number): void {
  for (let i = 1; i <= TOTAL_PARAMS; i++) {
    setTimeout(() => ws.send(hubFrame('analysis-progress', {
      flightId,
      completedParameters: i,
      totalParameters: TOTAL_PARAMS,
      parameter: `PARAM_${i}`,
    })), i * PARAM_STEP_MS);
  }

  setTimeout(() => ws.send(hubFrame('analysis-stage',    { flightId, stage: 'historical' })),
    LAST_PARAM_AT + STAGE_HOLD_MS);
  setTimeout(() => ws.send(hubFrame('analysis-stage',    { flightId, stage: 'causality'  })),
    LAST_PARAM_AT + 2 * STAGE_HOLD_MS);
  setTimeout(() => ws.send(hubFrame('analysis-finished', { flightId })),
    LAST_PARAM_AT + 3 * STAGE_HOLD_MS);
}

async function setupSignalR(page: Page): Promise<void> {
  await page.route('**/analysis-progress/negotiate**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        negotiateVersion: 1,
        connectionId: 'test-conn-id',
        connectionToken: 'test-token',
        availableTransports: [{ transport: 'WebSockets', transferFormats: ['Text', 'Binary'] }],
      }),
    });
  });

  await page.routeWebSocket(/analysis-progress/, (ws) => {
    let handshakeDone = false;

    ws.onMessage((raw) => {
      const msg = typeof raw === 'string' ? raw : raw.toString();

      if (!handshakeDone && msg.includes('"protocol"')) {
        handshakeDone = true;
        ws.send('{}\x1e');
        return;
      }

      if (msg.includes('JoinFlight')) {
        try {
          const parsed = JSON.parse(msg.replace(/\x1e/g, ''));
          const flightId: number = parsed.arguments?.[0];
          if (flightId) schedulePipeline(ws, flightId);
        } catch {}
      }
    });
  });
}

function flightCard(page: Page, flightId: number) {
  return page
    .locator('.flightCard')
    .filter({ has: page.locator('.flightNumber', { hasText: String(flightId) }) });
}

async function assertFullPipeline(page: Page, flightId: number): Promise<void> {
  const card = flightCard(page, flightId);

  await expect(card).toBeVisible({ timeout: 10_000 });

  // 1. Preparing badge (before first SignalR progress)
  await expect(card.locator('.analysisPreparing')).toBeVisible({ timeout: 5_000 });
  await expect(card.locator('.analysisPreparing')).toContainText('preparing analysis...');

  // 2. Progress bar appears, text shows "Analyzing X/Y"
  await expect(card.locator('.analysisProgress')).toBeVisible({ timeout: 10_000 });
  await expect(card.locator('.analysisText')).toContainText('Analyzing', { timeout: 10_000 });

  // 3. Reaches 100 %
  await expect(card.locator('.analysisPercentTop')).toHaveText('100%', { timeout: 15_000 });

  // 4. Historical search stage
  await expect(card.locator('.analysisText')).toHaveText('Searching historical points...', { timeout: 10_000 });

  // 5. Causality stage
  await expect(card.locator('.analysisText')).toHaveText('Analyzing flight causality...', { timeout: 10_000 });

  // 6. Analysis finished — progress bar and preparing badge gone
  await expect(card.locator('.analysisProgress')).not.toBeVisible({ timeout: 10_000 });
  await expect(card.locator('.analysisPreparing')).not.toBeVisible();
}

// ─── Test 1: single file ──────────────────────────────────────────────────────

test('upload single PCAP → modal stays open during upload → full analysis pipeline', async ({ page }) => {
  let flightsCall = 0;
  await page.route('**/TelemetryDataArchive/all-flight', async (route) => {
    flightsCall++;
    await route.fulfill({
      json: flightsCall === 1
        ? []
        : [{ flightNumber: FLIGHT_A, flightLenght: 3600 }],
    });
  });

  let specialCall = 0;
  await page.route(`**/get-all-special-points-for-flight/${FLIGHT_A}`, async (route) => {
    specialCall++;
    await route.fulfill({
      json: specialCall === 1
        ? null
        : {
            anomalies: {
              PARAM_A: [100, 200, 300],
              PARAM_B: [400],
              PARAM_C: [500, 600],
            },
            historicalSimilarity: {
              PARAM_A: [{ anomalyTime: 100 }, { anomalyTime: 200 }],
              PARAM_B: [{ anomalyTime: 400 }],
              PARAM_C: [],
            },
          },
    });
  });

  await page.route('**/packets/decode-stream-file', async (route) => {
    await new Promise<void>((r) => setTimeout(r, 300));
    await route.fulfill({ json: FLIGHT_A });
  });

  await setupSignalR(page);
  await page.goto('http://localhost:4200');

  // Initial state
  await expect(page.locator('.uploadOverlay')).not.toHaveClass(/active/);
  await expect(page.locator('.noFlights')).toBeVisible();

  // Open modal
  await page.getByRole('button', { name: 'Add Flight' }).click();
  await expect(page.locator('.uploadOverlay')).toHaveClass(/active/);
  await expect(page.locator('.uploadModal')).toBeVisible();

  // Pick file → preview appears
  await page.locator('input.hiddenFileInput').setInputFiles(FILE_A);
  await expect(page.locator('.fileName')).toHaveText('7417.pcap');
  await expect(page.locator('button.uploadBtn')).toContainText('Upload File');
  await expect(page.locator('button.uploadBtn')).not.toBeDisabled();

  // Click upload
  await page.locator('button.uploadBtn').click();

  // Modal stays open while uploading
  await expect(page.locator('.uploadOverlay')).toHaveClass(/active/);
  await expect(page.locator('button.uploadBtn')).toContainText('Uploading...');
  await expect(page.locator('.uploadModal .cancelBtn')).toBeDisabled();

  // Modal closes only after server responds and flight list refreshes
  await expect(page.locator('.uploadOverlay')).not.toHaveClass(/active/, { timeout: 10_000 });

  // Full analysis pipeline
  await assertFullPipeline(page, FLIGHT_A);

  // Final data
  const card = flightCard(page, FLIGHT_A);
  await expect(card.locator('.anomalyTotal')).toContainText('6 unusual points',    { timeout: 5_000 });
  await expect(card.locator('.historicalTotal')).toContainText('3 historical points', { timeout: 5_000 });
});

// ─── Test 2: multiple files in parallel ──────────────────────────────────────

test('upload two PCAP files in parallel → both flights get SignalR progress → both complete pipeline', async ({ page }) => {
  let flightsCall = 0;
  await page.route('**/TelemetryDataArchive/all-flight', async (route) => {
    flightsCall++;
    await route.fulfill({
      json: flightsCall === 1
        ? []
        : [
            { flightNumber: FLIGHT_A, flightLenght: 3600 },
            { flightNumber: FLIGHT_B, flightLenght: 2400 },
          ],
    });
  });

  let specialA = 0;
  await page.route(`**/get-all-special-points-for-flight/${FLIGHT_A}`, async (route) => {
    specialA++;
    await route.fulfill({
      json: specialA === 1
        ? null
        : {
            anomalies: { PARAM_A: [10, 20], PARAM_B: [30] },
            historicalSimilarity: {
              PARAM_A: [{ anomalyTime: 10 }],
              PARAM_B: [],
            },
          },
    });
  });

  let specialB = 0;
  await page.route(`**/get-all-special-points-for-flight/${FLIGHT_B}`, async (route) => {
    specialB++;
    await route.fulfill({
      json: specialB === 1
        ? null
        : {
            anomalies: { PARAM_X: [1, 2, 3, 4], PARAM_Y: [5] },
            historicalSimilarity: {
              PARAM_X: [{ anomalyTime: 1 }, { anomalyTime: 2 }],
              PARAM_Y: [{ anomalyTime: 5 }],
            },
          },
    });
  });

  // Return the correct flightId for each file based on filename in request body
  await page.route('**/packets/decode-stream-file', async (route) => {
    const body = route.request().postDataBuffer()?.toString() ?? '';
    const id   = body.includes('7417.pcap') ? FLIGHT_A : FLIGHT_B;
    await new Promise<void>((r) => setTimeout(r, 300));
    await route.fulfill({ json: id });
  });

  await setupSignalR(page);
  await page.goto('http://localhost:4200');

  await expect(page.locator('.noFlights')).toBeVisible();

  // Open modal
  await page.getByRole('button', { name: 'Add Flight' }).click();
  await expect(page.locator('.uploadModal')).toBeVisible();

  // Pick two files → both appear in preview
  await page.locator('input.hiddenFileInput').setInputFiles([FILE_A, FILE_B]);
  await expect(page.locator('.fileName').nth(0)).toHaveText('7417.pcap');
  await expect(page.locator('.fileName').nth(1)).toHaveText('9164.pcap');

  // Button shows count
  await expect(page.locator('button.uploadBtn')).toContainText('Upload 2 Files');
  await expect(page.locator('button.uploadBtn')).not.toBeDisabled();

  // Click upload
  await page.locator('button.uploadBtn').click();

  // Modal stays open while both requests are in flight
  await expect(page.locator('.uploadOverlay')).toHaveClass(/active/);
  await expect(page.locator('button.uploadBtn')).toContainText('Uploading...');
  await expect(page.locator('.uploadModal .cancelBtn')).toBeDisabled();

  // Modal closes only after both requests complete
  await expect(page.locator('.uploadOverlay')).not.toHaveClass(/active/, { timeout: 10_000 });

  // Both pipelines run in parallel — assert both simultaneously so neither misses its window
  await Promise.all([
    assertFullPipeline(page, FLIGHT_A),
    assertFullPipeline(page, FLIGHT_B),
  ]);

  // Flight A final data: 3 anomalies, 1 historical
  const cardA = flightCard(page, FLIGHT_A);
  await expect(cardA.locator('.anomalyTotal')).toContainText('3 unusual points',    { timeout: 5_000 });
  await expect(cardA.locator('.historicalTotal')).toContainText('1 historical points', { timeout: 5_000 });

  // Flight B final data: 5 anomalies, 3 historical
  const cardB = flightCard(page, FLIGHT_B);
  await expect(cardB.locator('.anomalyTotal')).toContainText('5 unusual points',    { timeout: 5_000 });
  await expect(cardB.locator('.historicalTotal')).toContainText('3 historical points', { timeout: 5_000 });
});
