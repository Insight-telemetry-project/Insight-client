import { test, expect } from '@playwright/test';

const FLIGHT_ID = 7417;
const PCAP_FILE = 'tests/files/7417.pcap';

function hubFrame(target: string, arg: unknown): string {
  return JSON.stringify({ type: 1, target, arguments: [arg] }) + '\x1e';
}

test('upload PCAP → modal closes → SignalR analysis pipeline → flight data ready', async ({ page }) => {

  let flightsCallCount = 0;
  await page.route('**/TelemetryDataArchive/all-flight', async (route) => {
    flightsCallCount++;
    await route.fulfill({
      json: flightsCallCount === 1
        ? []
        : [{ flightNumber: FLIGHT_ID, flightLenght: 3600 }],
    });
  });

  let specialCallCount = 0;
  await page.route(`**/get-all-special-points-for-flight/${FLIGHT_ID}`, async (route) => {
    specialCallCount++;
    await route.fulfill({
      json: specialCallCount === 1
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
    await new Promise<void>((resolve) => setTimeout(resolve, 300));
    await route.fulfill({ status: 200, body: '' });
  });

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
        const TOTAL_PARAMS = 5;
        const PARAM_STEP_MS = 200;
        const STAGE_HOLD_MS = 1500;

        const lastParamAt = TOTAL_PARAMS * PARAM_STEP_MS;

        for (let indexParam = 1; indexParam <= TOTAL_PARAMS; indexParam++) {
          setTimeout(() => ws.send(hubFrame('analysis-progress', {
            flightId: FLIGHT_ID,
            completedParameters: indexParam,
            totalParameters: TOTAL_PARAMS,
            parameter: `PARAM_${indexParam}`,
          })), indexParam * PARAM_STEP_MS);
        }

        setTimeout(() => ws.send(hubFrame('analysis-stage', {
          flightId: FLIGHT_ID,
          stage: 'historical',
        })), lastParamAt + STAGE_HOLD_MS);

        setTimeout(() => ws.send(hubFrame('analysis-stage', {
          flightId: FLIGHT_ID,
          stage: 'causality',
        })), lastParamAt + 2 * STAGE_HOLD_MS);

        setTimeout(() => ws.send(hubFrame('analysis-finished', {
          flightId: FLIGHT_ID,
        })), lastParamAt + 3 * STAGE_HOLD_MS);
      }
    });
  });

  await page.goto('http://localhost:4200');

  await expect(page.locator('.uploadOverlay')).not.toHaveClass(/active/);
  await expect(page.locator('.noFlights')).toBeVisible();

  await page.getByRole('button', { name: 'Add Flight' }).click();

  await expect(page.locator('.uploadOverlay')).toHaveClass(/active/);
  await expect(page.locator('.uploadModal')).toBeVisible();

  await page.locator('input.hiddenFileInput').setInputFiles(PCAP_FILE);

  await expect(page.locator('.fileName')).toHaveText('7417.pcap');

  await expect(page.locator('button.uploadBtn')).not.toBeDisabled();

  await page.locator('button.uploadBtn').click();

  await expect(page.locator('button.uploadBtn')).toContainText('Uploading...');

  await expect(page.locator('.uploadOverlay')).not.toHaveClass(/active/, {
    timeout: 10_000,
  });

  const flightCard = page
    .locator('.flightCard')
    .filter({ has: page.locator('.flightNumber', { hasText: String(FLIGHT_ID) }) });

  await expect(flightCard).toBeVisible({ timeout: 10_000 });

  await expect(flightCard.locator('.analysisPreparing')).toBeVisible({ timeout: 5_000 });
  await expect(flightCard.locator('.analysisPreparing')).toContainText('preparing analysis...');

  await expect(flightCard.locator('.analysisProgress')).toBeVisible({ timeout: 10_000 });
  await expect(flightCard.locator('.analysisText')).toContainText('Analyzing', { timeout: 10_000 });

  await expect(flightCard.locator('.analysisPercentTop')).toHaveText('100%', {
    timeout: 15_000,
  });

  await expect(flightCard.locator('.analysisText')).toHaveText(
    'Searching historical points...',
    { timeout: 10_000 },
  );

  await expect(flightCard.locator('.analysisText')).toHaveText(
    'Analyzing flight causality...',
    { timeout: 10_000 },
  );

  await expect(flightCard.locator('.analysisProgress')).not.toBeVisible({ timeout: 10_000 });
  await expect(flightCard.locator('.analysisPreparing')).not.toBeVisible();

  await expect(flightCard.locator('.anomalyTotal')).toContainText('6 unusual points', {
    timeout: 5_000,
  });
  await expect(flightCard.locator('.historicalTotal')).toContainText('3 historical points', {
    timeout: 5_000,
  });
});
