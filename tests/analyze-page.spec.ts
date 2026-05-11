import { test, expect } from '@playwright/test';

const FLIGHT_ID    = 7417;
const COMPARED_ID  = 100;
const PARAM_A      = 'ALTITUDE';
const PARAM_B      = 'AIRSPEED';
const PARAM_C      = 'HEADING';
const ANOMALY_TIME = 1005;
const ANOMALY_X_MS = ANOMALY_TIME * 1000;

function makeTelemetryRows(masterIndex: number, count: number, baseTime: number) {
  return Array.from({ length: count }, (_, i) => ({
    masterIndex,
    timestep: baseTime + i,
    fields: {
      [PARAM_A]: 1000 + Math.sin(i * 0.5) * 50,
      [PARAM_B]: 200  + Math.cos(i * 0.3) * 20,
      [PARAM_C]: 180  + Math.sin(i * 0.2) * 30,
    },
  }));
}

const flightMeta = {
  anomalies: {
    [PARAM_A]: [{ startEpoch: 1004, endEpoch: 1006, representativeEpoch: ANOMALY_TIME, label: 'spike' }],
  },
  historicalSimilarity: {
    [PARAM_A]: [{
      recordId: 'hist-1',
      comparedFlightIndex: COMPARED_ID,
      startEpoch: 1003,
      endEpoch: 1007,
      label: 'similar_pattern',
      finalScore: 0.91,
      anomalyTime: ANOMALY_TIME,
    }],
  },
};

const specialPoints = {
  anomalies: {
    [PARAM_A]: [ANOMALY_TIME],
    [PARAM_B]: [],
    [PARAM_C]: [],
  },
  historicalSimilarity: {
    [PARAM_A]: [{ anomalyTime: ANOMALY_TIME }],
    [PARAM_B]: [],
    [PARAM_C]: [],
  },
};

const sampleInvestigation = {
  id: 'inv-001',
  masterIndex: FLIGHT_ID,
  param: PARAM_A,
  time: ANOMALY_TIME,
  value: 1050.5,
  name: 'Engine Spike',
  description: 'Altitude spiked beyond normal range during climb.',
  createdAt: '2026-01-15T10:30:00Z',
};

// ─── shared route setup ───────────────────────────────────────────────────────

async function setupBaseRoutes(page: any, investigations: any[] = []) {
  await page.route(`**/TelemetryDataArchive/fields/${FLIGHT_ID}`, async (route: any) =>
    route.fulfill({ json: makeTelemetryRows(FLIGHT_ID, 20, 1000) }));

  await page.route(`**/TelemetryDataArchive/flight/${FLIGHT_ID}`, async (route: any) =>
    route.fulfill({ json: flightMeta }));

  await page.route(`**/get-all-special-points-for-flight/${FLIGHT_ID}`, async (route: any) =>
    route.fulfill({ json: specialPoints }));

  await page.route('**/get-flight-connections/**', async (route: any) =>
    route.fulfill({ json: route.request().url().includes(`/${PARAM_A}`) ? [PARAM_B, PARAM_C] : [] }));

  await page.route(`**/TelemetryDataArchive/fields/${COMPARED_ID}`, async (route: any) =>
    route.fulfill({ json: makeTelemetryRows(COMPARED_ID, 15, 2000) }));

  await page.route(`**/TelemetryDataArchive/flight/${COMPARED_ID}`, async (route: any) =>
    route.fulfill({ json: { anomalies: {}, historicalSimilarity: {} } }));

  await page.route(`**/get-all-special-points-for-flight/${COMPARED_ID}`, async (route: any) =>
    route.fulfill({ json: null }));

  await page.route(`**/TelemetryDataArchive/investigations/${FLIGHT_ID}`, async (route: any) =>
    route.fulfill({ json: investigations }));

  await page.route(`**/TelemetryDataArchive/investigations/${COMPARED_ID}`, async (route: any) =>
    route.fulfill({ json: [] }));

  await page.route(`**/get-flight-historical-similarity/**`, async (route: any) =>
    route.fulfill({ json: [] }));
}

// ─── shared action helpers ────────────────────────────────────────────────────

async function gotoFlight(page: any) {
  await page.goto(`http://localhost:4200/archive/${FLIGHT_ID}`);
  await page.waitForSelector('.paramCard', { timeout: 10_000 });
}

async function openChart(page: any, param: string) {
  await page.locator('.paramCard').filter({ hasText: param }).click();
  await expect(page.locator('.gridChartBody .highcharts-root')).toBeVisible({ timeout: 10_000 });
}

async function expandHistoricalCard(page: any) {
  await openChart(page, PARAM_A);
  await page.locator('.modeBtn').filter({ hasText: 'Historical' }).click();
  await expect(page.locator('.timeGroup')).toBeVisible({ timeout: 10_000 });
  await page.locator('.timeGroupHeader').click();
  await expect(page.locator('.historicalCardNew')).toBeVisible({ timeout: 5_000 });
}

async function dispatchAnomalyClick(page: any, type: 'anomaly' | 'historical' = 'anomaly') {
  // Return a promise that resolves after setTimeout(0) so Angular's detectChanges()
  // (called from outside NgZone) has a chance to flush the DOM update before
  // Playwright proceeds to assert visibility.
  await page.evaluate(
    ({ t, x, param }: { t: string; x: number; param: string }) =>
      new Promise<void>(resolve => {
        window.dispatchEvent(new CustomEvent('anomaly-click', {
          detail: { type: t, x, y: 1050.5, param, clientX: 200, clientY: 300 },
        }));
        setTimeout(resolve, 0);
      }),
    { t: type, x: ANOMALY_X_MS, param: PARAM_A },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ORIGINAL TESTS (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Analyze Page — Core Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(`**/TelemetryDataArchive/fields/${FLIGHT_ID}`, async (route) => {
      await route.fulfill({ json: makeTelemetryRows(FLIGHT_ID, 20, 1000) });
    });

    await page.route(`**/TelemetryDataArchive/flight/${FLIGHT_ID}`, async (route) => {
      await route.fulfill({ json: flightMeta });
    });

    await page.route(`**/get-all-special-points-for-flight/${FLIGHT_ID}`, async (route) => {
      await route.fulfill({ json: specialPoints });
    });

    await page.route('**/get-flight-connections/**', async (route) => {
      const url = route.request().url();
      if (url.includes(`/${PARAM_A}`)) {
        await route.fulfill({ json: [PARAM_B, PARAM_C] });
      } else {
        await route.fulfill({ json: [] });
      }
    });

    await page.route(`**/TelemetryDataArchive/fields/${COMPARED_ID}`, async (route) => {
      await route.fulfill({ json: makeTelemetryRows(COMPARED_ID, 15, 2000) });
    });

    await page.route(`**/TelemetryDataArchive/flight/${COMPARED_ID}`, async (route) => {
      await route.fulfill({ json: { anomalies: {}, historicalSimilarity: {} } });
    });
    await page.route(`**/get-all-special-points-for-flight/${COMPARED_ID}`, async (route) => {
      await route.fulfill({ json: null });
    });

    await page.goto(`http://localhost:4200/archive/${FLIGHT_ID}`);

    await page.waitForSelector('.paramCard', { timeout: 10_000 });
  });

  test('all parameters render with anomaly and historical badges', async ({ page }) => {
    await expect(page.locator('.paramCard')).toHaveCount(3);

    const altCard = page.locator('.paramCard').filter({ hasText: PARAM_A });
    await expect(altCard.locator('.anomalyBadge')).toContainText('Anomalies (1)', { timeout: 5_000 });
    await expect(altCard.locator('.historyBadge')).toContainText('Historical (1)', { timeout: 5_000 });

    const bCard = page.locator('.paramCard').filter({ hasText: PARAM_B });
    await expect(bCard.locator('.anomalyBadge')).toContainText('Anomalies (0)', { timeout: 5_000 });
    await expect(bCard.locator('.historyBadge')).toContainText('Historical (0)', { timeout: 5_000 });
  });

  test('clicking a parameter card opens a Highcharts chart in the grid', async ({ page }) => {
    await expect(page.locator('.gridSection')).not.toBeVisible();
    await expect(page.locator('.emptyState')).toBeVisible();

    await page.locator('.paramCard').filter({ hasText: PARAM_A }).click();

    await expect(page.locator('.gridSection')).toBeVisible();
    await expect(page.locator('.gridChartCard')).toHaveCount(1);
    await expect(page.locator('.gridChartTitle')).toHaveText(PARAM_A);

    await expect(
      page.locator('.gridChartBody .highcharts-root'),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('selecting two parameters shows two independent Highcharts charts', async ({ page }) => {
    await page.locator('.paramCard').filter({ hasText: PARAM_A }).click();
    await page.locator('.paramCard').filter({ hasText: PARAM_B }).click();

    await expect(page.locator('.gridChartCard')).toHaveCount(2, { timeout: 10_000 });

    await expect(page.locator('.gridChartTitle').filter({ hasText: PARAM_A })).toBeVisible();
    await expect(page.locator('.gridChartTitle').filter({ hasText: PARAM_B })).toBeVisible();

    await expect(page.locator('.gridChartBody .highcharts-root')).toHaveCount(2, { timeout: 10_000 });
  });

  test('clicking the X on a chart card removes it and shows the empty state', async ({ page }) => {
    await page.locator('.paramCard').filter({ hasText: PARAM_A }).click();
    await expect(page.locator('.gridChartCard')).toHaveCount(1, { timeout: 10_000 });

    await page.locator('.gridChartClose').click();

    await expect(page.locator('.gridChartCard')).toHaveCount(0);
    await expect(page.locator('.emptyState')).toBeVisible();

    await expect(
      page.locator('.paramCard').filter({ hasText: PARAM_A }),
    ).not.toHaveClass(/selected/);
  });

  test('Anomalies button toggles the red anomaly series on and off', async ({ page }) => {
    await page.locator('.paramCard').filter({ hasText: PARAM_A }).click();

    const anomalyBtn = page.locator('.anomalyBtn');
    await expect(anomalyBtn).toBeVisible({ timeout: 10_000 });

    await expect(anomalyBtn).not.toHaveClass(/hidden/);

    await anomalyBtn.click();
    await expect(anomalyBtn).toHaveClass(/hidden/);

    await anomalyBtn.click();
    await expect(anomalyBtn).not.toHaveClass(/hidden/);
  });

  test('Historical button toggles the yellow historical series on and off', async ({ page }) => {
    await page.locator('.paramCard').filter({ hasText: PARAM_A }).click();

    const histBtn = page.locator('.historyBtn');
    await expect(histBtn).toBeVisible({ timeout: 10_000 });
    await expect(histBtn).not.toHaveClass(/hidden/);

    await histBtn.click();
    await expect(histBtn).toHaveClass(/hidden/);

    await histBtn.click();
    await expect(histBtn).not.toHaveClass(/hidden/);
  });

  test('Related sidebar shows connected parameters fetched from the API', async ({ page }) => {
    await page.locator('.paramCard').filter({ hasText: PARAM_A }).click();

    await expect(
      page.locator('.modeBtn').filter({ hasText: 'Related' }),
    ).toHaveClass(/active/);

    await expect(
      page.locator('.sidebarItem').filter({ hasText: PARAM_B }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator('.sidebarItem').filter({ hasText: PARAM_C }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('clicking a related parameter in the sidebar opens it as a second chart', async ({ page }) => {
    await page.locator('.paramCard').filter({ hasText: PARAM_A }).click();

    const relatedItem = page.locator('.sidebarItem').filter({ hasText: PARAM_B });
    await expect(relatedItem).toBeVisible({ timeout: 10_000 });

    await relatedItem.click();

    await expect(page.locator('.gridChartCard')).toHaveCount(2, { timeout: 10_000 });
    await expect(
      page.locator('.gridChartTitle').filter({ hasText: PARAM_B }),
    ).toBeVisible();
  });

  test('switching to Historical sidebar shows grouped historical matches', async ({ page }) => {
    await page.locator('.paramCard').filter({ hasText: PARAM_A }).click();

    await expect(page.locator('.gridChartBody .highcharts-root')).toBeVisible({ timeout: 10_000 });

    await page.locator('.modeBtn').filter({ hasText: 'Historical' }).click();
    await expect(
      page.locator('.modeBtn').filter({ hasText: 'Historical' }),
    ).toHaveClass(/active/);

    await expect(page.locator('.timeGroup')).toHaveCount(1, { timeout: 10_000 });
    await expect(page.locator('.countBadge')).toContainText('1 match');
  });

  test('expanding a historical time group reveals the match card with score and flight info', async ({ page }) => {
    await page.locator('.paramCard').filter({ hasText: PARAM_A }).click();
    await expect(page.locator('.gridChartBody .highcharts-root')).toBeVisible({ timeout: 10_000 });

    await page.locator('.modeBtn').filter({ hasText: 'Historical' }).click();
    await expect(page.locator('.timeGroup')).toBeVisible({ timeout: 10_000 });

    await expect(page.locator('.historicalCardNew')).toHaveCount(0);

    await page.locator('.timeGroupHeader').click();

    await expect(page.locator('.historicalCardNew')).toHaveCount(1, { timeout: 5_000 });

    await expect(page.locator('.hcardFlight')).toContainText(`Flight #${COMPARED_ID}`);
    await expect(page.locator('.hcardScore')).toContainText('91%');
  });

  test('hovering on a historical sidebar card highlights it', async ({ page }) => {
    await page.locator('.paramCard').filter({ hasText: PARAM_A }).click();
    await expect(page.locator('.gridChartBody .highcharts-root')).toBeVisible({ timeout: 10_000 });

    await page.locator('.modeBtn').filter({ hasText: 'Historical' }).click();
    await expect(page.locator('.timeGroup')).toBeVisible({ timeout: 10_000 });
    await page.locator('.timeGroupHeader').click();

    const card = page.locator('.historicalCardNew');
    await expect(card).toBeVisible({ timeout: 5_000 });

    await card.hover();

    await expect(card).toHaveClass(/hovered/);
  });

  test('dispatching historical-point-hover highlights the matching sidebar card', async ({ page }) => {
    await page.locator('.paramCard').filter({ hasText: PARAM_A }).click();
    await expect(page.locator('.gridChartBody .highcharts-root')).toBeVisible({ timeout: 10_000 });

    await page.locator('.modeBtn').filter({ hasText: 'Historical' }).click();
    await expect(page.locator('.timeGroup')).toBeVisible({ timeout: 10_000 });
    await page.locator('.timeGroupHeader').click();
    await expect(page.locator('.historicalCardNew')).toBeVisible({ timeout: 5_000 });

    await page.evaluate((anomalyTime) => {
      window.dispatchEvent(
        new CustomEvent('historical-point-hover', {
          detail: { anomalyTime: String(anomalyTime) },
        }),
      );
    }, ANOMALY_TIME);

    await expect(
      page.locator('.historicalCardNew.hovered'),
      'card matching the hovered chart point should get .hovered class',
    ).toBeVisible({ timeout: 5_000 });
  });

  test('clicking a historical card navigates to the compared flight analyze page', async ({ page }) => {
    await page.locator('.paramCard').filter({ hasText: PARAM_A }).click();
    await expect(page.locator('.gridChartBody .highcharts-root')).toBeVisible({ timeout: 10_000 });

    await page.locator('.modeBtn').filter({ hasText: 'Historical' }).click();
    await expect(page.locator('.timeGroup')).toBeVisible({ timeout: 10_000 });
    await page.locator('.timeGroupHeader').click();

    await expect(page.locator('.historicalCardNew')).toBeVisible({ timeout: 5_000 });

    await page.locator('.historicalCardNew').click();

    await expect(page).toHaveURL(new RegExp(`/archive/${COMPARED_ID}`), { timeout: 5_000 });
    await expect(page).toHaveURL(new RegExp(`param=${PARAM_A}`));
  });

  test('searching hides non-matching parameter cards via hidden1 class', async ({ page }) => {
    await page.locator('input.searchInput').fill(PARAM_A);

    await expect(page.locator('.paramCard:not(.hidden1)')).toHaveCount(1, { timeout: 5_000 });
    await expect(
      page.locator('.paramCard:not(.hidden1)').filter({ hasText: PARAM_A }),
    ).toBeVisible();

    await page.locator('button.clearBtn').click();
    await expect(page.locator('.paramCard:not(.hidden1)')).toHaveCount(3);
  });

  test('sorting by Historical puts parameters with historical matches first', async ({ page }) => {
    await expect(
      page.locator('.paramCard').filter({ hasText: PARAM_A }).locator('.historyBadge'),
    ).toContainText('Historical (1)', { timeout: 5_000 });

    await page.locator('.sortPill button').filter({ hasText: 'Historical' }).click();

    const firstCard = page.locator('.paramCard:not(.hidden1)').first();
    await expect(firstCard).toContainText(PARAM_A);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HEADER & FLIGHT INFO
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Analyze Page — Header & Flight Info', () => {
  test.beforeEach(async ({ page }) => {
    await setupBaseRoutes(page);
    await gotoFlight(page);
  });

  test('header title shows the correct flight number', async ({ page }) => {
    await expect(page.locator('.title')).toContainText(`Flight ${FLIGHT_ID}`);
  });

  test('frames badge shows the exact row count returned by the API', async ({ page }) => {
    await expect(page.locator('.framesBadge .framesBadgeValue')).toContainText('20', { timeout: 5_000 });
    await expect(page.locator('.framesBadge .framesBadgeLabel')).toContainText('frames');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CHART GRID — BUTTON COUNTS
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Analyze Page — Chart Grid Button Counts', () => {
  test.beforeEach(async ({ page }) => {
    await setupBaseRoutes(page);
    await gotoFlight(page);
    await openChart(page, PARAM_A);
  });

  test('anomalyBtn shows the anomaly count sourced from the special-points API', async ({ page }) => {
    await expect(page.locator('.anomalyBtn')).toContainText('Anomalies (1)', { timeout: 5_000 });
  });

  test('historyBtn shows the historical count sourced from the special-points API', async ({ page }) => {
    await expect(page.locator('.historyBtn')).toContainText('Historical (1)', { timeout: 5_000 });
  });

  test('AIRSPEED chart shows zero anomalies and zero historical matches', async ({ page }) => {
    await page.locator('.paramCard').filter({ hasText: PARAM_B }).click();
    await expect(page.locator('.gridChartCard')).toHaveCount(2, { timeout: 10_000 });

    const airspeedCard = page.locator('.gridChartCard').filter({ hasText: PARAM_B });
    await expect(airspeedCard.locator('.anomalyBtn')).toContainText('Anomalies (0)', { timeout: 5_000 });
    await expect(airspeedCard.locator('.historyBtn')).toContainText('Historical (0)', { timeout: 5_000 });
  });

  test('closing a chart card deselects its parameter card', async ({ page }) => {
    await expect(page.locator('.paramCard').filter({ hasText: PARAM_A })).toHaveClass(/selected/);
    await page.locator('.gridChartClose').click();
    await expect(page.locator('.paramCard').filter({ hasText: PARAM_A })).not.toHaveClass(/selected/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ZOOM SYNC
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Analyze Page — Zoom Sync', () => {
  test.beforeEach(async ({ page }) => {
    await setupBaseRoutes(page);
    await gotoFlight(page);
    // open two charts so the sync button can appear (requires gridItems.length > 1)
    await openChart(page, PARAM_A);
    await page.locator('.paramCard').filter({ hasText: PARAM_B }).click();
    await expect(page.locator('.gridChartCard')).toHaveCount(2, { timeout: 10_000 });
  });

  test('sync button appears on a chart card after a zoom event is dispatched', async ({ page }) => {
    await page.evaluate(({ param, min, max }) => {
      window.dispatchEvent(new CustomEvent('chart-zoom-update', { detail: { param, min, max } }));
    }, { param: PARAM_A, min: 1_002_000, max: 1_010_000 });

    const altCard = page.locator('.gridChartCard').filter({ hasText: PARAM_A });
    await expect(altCard.locator('.syncZoomBtn')).toBeVisible({ timeout: 5_000 });
  });

  test('sync button displays "Sync zoom" label before activation', async ({ page }) => {
    await page.evaluate(({ param, min, max }) => {
      window.dispatchEvent(new CustomEvent('chart-zoom-update', { detail: { param, min, max } }));
    }, { param: PARAM_A, min: 1_002_000, max: 1_010_000 });

    const altCard = page.locator('.gridChartCard').filter({ hasText: PARAM_A });
    await expect(altCard.locator('.syncZoomBtn')).toContainText('Sync zoom', { timeout: 5_000 });
    await expect(altCard.locator('.syncZoomBtn')).not.toHaveClass(/syncing/);
  });

  test('clicking sync button activates syncing and shows "Syncing..." label', async ({ page }) => {
    await page.evaluate(({ param, min, max }) => {
      window.dispatchEvent(new CustomEvent('chart-zoom-update', { detail: { param, min, max } }));
    }, { param: PARAM_A, min: 1_002_000, max: 1_010_000 });

    const altCard = page.locator('.gridChartCard').filter({ hasText: PARAM_A });
    await altCard.locator('.syncZoomBtn').click();

    await expect(altCard.locator('.syncZoomBtn')).toHaveClass(/syncing/, { timeout: 5_000 });
    await expect(altCard.locator('.syncZoomBtn')).toContainText('Syncing...');
  });

  test('clicking sync button a second time deactivates syncing', async ({ page }) => {
    await page.evaluate(({ param, min, max }) => {
      window.dispatchEvent(new CustomEvent('chart-zoom-update', { detail: { param, min, max } }));
    }, { param: PARAM_A, min: 1_002_000, max: 1_010_000 });

    const altCard = page.locator('.gridChartCard').filter({ hasText: PARAM_A });
    await altCard.locator('.syncZoomBtn').click();
    await expect(altCard.locator('.syncZoomBtn')).toHaveClass(/syncing/, { timeout: 5_000 });

    await altCard.locator('.syncZoomBtn').click();
    await expect(altCard.locator('.syncZoomBtn')).not.toHaveClass(/syncing/, { timeout: 5_000 });
  });

  test('dispatching a zoom-reset event removes the sync button', async ({ page }) => {
    await page.evaluate(({ param, min, max }) => {
      window.dispatchEvent(new CustomEvent('chart-zoom-update', { detail: { param, min, max } }));
    }, { param: PARAM_A, min: 1_002_000, max: 1_010_000 });

    const altCard = page.locator('.gridChartCard').filter({ hasText: PARAM_A });
    await expect(altCard.locator('.syncZoomBtn')).toBeVisible({ timeout: 5_000 });

    await page.evaluate(({ param }) => {
      window.dispatchEvent(new CustomEvent('chart-zoom-reset', { detail: { param } }));
    }, { param: PARAM_A });

    await expect(altCard.locator('.syncZoomBtn')).not.toBeVisible({ timeout: 5_000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ANOMALY CLICK — DIRECT INVESTIGATION (no intermediate popup)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Analyze Page — Anomaly Click', () => {
  test.beforeEach(async ({ page }) => {
    await setupBaseRoutes(page);
    await gotoFlight(page);
  });

  test('dispatching anomaly-click opens the investigation modal directly', async ({ page }) => {
    await dispatchAnomalyClick(page, 'anomaly');
    await expect(page.locator('.inv-modal')).toBeVisible({ timeout: 5_000 });
  });

  test('no intermediate popup appears — the modal opens immediately on click', async ({ page }) => {
    await dispatchAnomalyClick(page, 'anomaly');
    await expect(page.locator('.anomaly-popup')).not.toBeVisible();
    await expect(page.locator('.inv-modal')).toBeVisible({ timeout: 5_000 });
  });

  test('modal context shows the correct param from the clicked anomaly point', async ({ page }) => {
    await dispatchAnomalyClick(page, 'anomaly');
    await expect(page.locator('.inv-context-param')).toContainText(PARAM_A, { timeout: 5_000 });
  });

  test('Cancel button closes the directly-opened modal', async ({ page }) => {
    await dispatchAnomalyClick(page, 'anomaly');
    await expect(page.locator('.inv-modal')).toBeVisible({ timeout: 5_000 });

    await page.locator('.inv-btn-cancel').click();
    await expect(page.locator('.inv-modal')).not.toBeVisible({ timeout: 5_000 });
  });

  test('backdrop click closes the directly-opened modal', async ({ page }) => {
    await dispatchAnomalyClick(page, 'anomaly');
    await expect(page.locator('.inv-modal')).toBeVisible({ timeout: 5_000 });

    // Dispatch click directly on the backdrop element — Playwright's coordinate-based
    // click({ force: true }) hits the modal center (which is above the backdrop), so we
    // use dispatchEvent to bypass coordinate routing.
    await page.evaluate(() =>
      new Promise<void>(resolve => {
        document.querySelector('.inv-backdrop')?.dispatchEvent(
          new MouseEvent('click', { bubbles: true }),
        );
        setTimeout(resolve, 50);
      }),
    );
    await expect(page.locator('.inv-modal')).not.toBeVisible({ timeout: 5_000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// INVESTIGATIONS — CREATE
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Analyze Page — Investigations Create', () => {
  test.beforeEach(async ({ page }) => {
    await setupBaseRoutes(page);
    await gotoFlight(page);
    // Clicking an anomaly point now opens the investigation modal directly
    await dispatchAnomalyClick(page, 'anomaly');
    await expect(page.locator('.inv-modal')).toBeVisible({ timeout: 5_000 });
  });

  test('modal displays the parameter name as context', async ({ page }) => {
    await expect(page.locator('.inv-context-param')).toContainText(PARAM_A);
  });

  test('save button is disabled when both fields are empty', async ({ page }) => {
    await expect(page.locator('.inv-btn-save')).toBeDisabled();
  });

  test('save button remains disabled when only the name is filled', async ({ page }) => {
    await page.locator('.inv-input').fill('Just a name');
    await expect(page.locator('.inv-btn-save')).toBeDisabled();
  });

  test('save button becomes enabled when both name and description are filled', async ({ page }) => {
    await page.locator('.inv-input').fill('Engine Anomaly');
    await page.locator('.inv-textarea').fill('Detailed description of the event.');
    await expect(page.locator('.inv-btn-save')).toBeEnabled();
  });

  test('successful save calls the POST investigations API and closes the modal', async ({ page }) => {
    const created = {
      id: 'new-001', masterIndex: FLIGHT_ID, param: PARAM_A,
      time: ANOMALY_TIME, value: 1050.5,
      name: 'Engine Anomaly', description: 'Detailed description.',
      createdAt: '2026-05-01T08:00:00Z',
    };

    let postCalled = false;
    await page.route('**/TelemetryDataArchive/investigations', async (route: any) => {
      if (route.request().method() === 'POST') {
        postCalled = true;
        await route.fulfill({ json: created });
      } else {
        await route.continue();
      }
    });

    await page.locator('.inv-input').fill('Engine Anomaly');
    await page.locator('.inv-textarea').fill('Detailed description.');
    await page.locator('.inv-btn-save').click();

    await expect(page.locator('.inv-modal')).not.toBeVisible({ timeout: 5_000 });
    expect(postCalled).toBe(true);
  });

  test('Cancel button closes the modal without making any API call', async ({ page }) => {
    let postCalled = false;
    await page.route('**/TelemetryDataArchive/investigations', async (route: any) => {
      if (route.request().method() === 'POST') postCalled = true;
      await route.continue();
    });

    await page.locator('.inv-btn-cancel').click();

    await expect(page.locator('.inv-modal')).not.toBeVisible({ timeout: 5_000 });
    expect(postCalled).toBe(false);
  });

  test('clicking the backdrop closes the modal', async ({ page }) => {
    await page.evaluate(() =>
      new Promise<void>(resolve => {
        document.querySelector('.inv-backdrop')?.dispatchEvent(
          new MouseEvent('click', { bubbles: true }),
        );
        setTimeout(resolve, 50);
      }),
    );
    await expect(page.locator('.inv-modal')).not.toBeVisible({ timeout: 5_000 });
  });

  test('save button shows "Saving..." label while the request is in-flight', async ({ page }) => {
    let resolveRequest: (value: any) => void;
    const requestPending = new Promise<any>((resolve) => { resolveRequest = resolve; });

    await page.route('**/TelemetryDataArchive/investigations', async (route: any) => {
      if (route.request().method() === 'POST') {
        await requestPending;
        await route.fulfill({ json: sampleInvestigation });
      } else {
        await route.continue();
      }
    });

    await page.locator('.inv-input').fill('Some name');
    await page.locator('.inv-textarea').fill('Some description here.');
    await page.locator('.inv-btn-save').click();

    await expect(page.locator('.inv-btn-save')).toContainText('Saving...', { timeout: 5_000 });
    await expect(page.locator('.inv-btn-save')).toBeDisabled();

    resolveRequest!(null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// INVESTIGATIONS — VIEW / EDIT / DELETE
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Analyze Page — Investigations View/Edit/Delete', () => {
  test.beforeEach(async ({ page }) => {
    await setupBaseRoutes(page, [sampleInvestigation]);
    await gotoFlight(page);
    await expandHistoricalCard(page);
  });

  test('"Investigation report found" button appears on a historical card that has an investigation', async ({ page }) => {
    await expect(page.locator('.hcard-inv-btn')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('.hcard-inv-btn')).toContainText('Investigation report found');
  });

  test('clicking the badge opens the investigation report modal', async ({ page }) => {
    await page.locator('.hcard-inv-btn').click();
    await expect(page.locator('.inv-overlay')).toBeVisible({ timeout: 5_000 });
  });

  test('own investigation report displays the name and description', async ({ page }) => {
    await page.locator('.hcard-inv-btn').click();
    await expect(page.locator('.inv-report-name')).toContainText('Engine Spike', { timeout: 5_000 });
    await expect(page.locator('.inv-report-scrollable')).toContainText('Altitude spiked beyond normal range');
  });

  test('own investigation report shows Edit and Delete action buttons', async ({ page }) => {
    await page.locator('.hcard-inv-btn').click();
    await expect(page.locator('.inv-btn-edit')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('.inv-btn-delete')).toBeVisible({ timeout: 5_000 });
  });

  test('clicking Edit switches to edit mode with pre-filled fields', async ({ page }) => {
    await page.locator('.hcard-inv-btn').click();
    await page.locator('.inv-btn-edit').click();

    await expect(page.locator('.inv-input')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('.inv-input')).toHaveValue('Engine Spike');
    await expect(page.locator('.inv-textarea')).toHaveValue('Altitude spiked beyond normal range during climb.');
  });

  test('Cancel in edit mode returns to view mode without changes', async ({ page }) => {
    await page.locator('.hcard-inv-btn').click();
    await page.locator('.inv-btn-edit').click();
    await expect(page.locator('.inv-input')).toBeVisible({ timeout: 5_000 });

    await page.locator('.inv-btn-cancel').click();

    await expect(page.locator('.inv-input')).not.toBeVisible({ timeout: 5_000 });
    await expect(page.locator('.inv-report-name')).toBeVisible();
    await expect(page.locator('.inv-report-name')).toContainText('Engine Spike');
  });

  test('saving edits calls the update API and shows updated content', async ({ page }) => {
    const updated = { ...sampleInvestigation, name: 'Updated Name', description: 'Updated description.' };

    await page.route(`**/TelemetryDataArchive/update-investigations/${sampleInvestigation.id}`, async (route: any) =>
      route.fulfill({ json: updated }));

    await page.locator('.hcard-inv-btn').click();
    await page.locator('.inv-btn-edit').click();
    await expect(page.locator('.inv-input')).toBeVisible({ timeout: 5_000 });

    await page.locator('.inv-input').fill('Updated Name');
    await page.locator('.inv-textarea').fill('Updated description.');
    await page.locator('.inv-btn-save').click();

    await expect(page.locator('.inv-report-name')).toContainText('Updated Name', { timeout: 5_000 });
    await expect(page.locator('.inv-report-scrollable')).toContainText('Updated description.');
  });

  test('save-changes button is disabled when either field is blank in edit mode', async ({ page }) => {
    await page.locator('.hcard-inv-btn').click();
    await page.locator('.inv-btn-edit').click();
    await expect(page.locator('.inv-input')).toBeVisible({ timeout: 5_000 });

    await page.locator('.inv-input').fill('');
    await expect(page.locator('.inv-btn-save')).toBeDisabled();
  });

  test('deleting an investigation calls DELETE and closes the modal', async ({ page }) => {
    let deleteCalled = false;
    await page.route(`**/TelemetryDataArchive/investigations/${sampleInvestigation.id}`, async (route: any) => {
      if (route.request().method() === 'DELETE') {
        deleteCalled = true;
        await route.fulfill({ status: 200, body: '' });
      } else {
        await route.continue();
      }
    });

    await page.locator('.hcard-inv-btn').click();
    await page.locator('.inv-btn-delete').click();

    await expect(page.locator('.inv-overlay')).not.toBeVisible({ timeout: 5_000 });
    expect(deleteCalled).toBe(true);
  });

  test('after deletion the investigation badge is removed from the historical card', async ({ page }) => {
    await page.route(`**/TelemetryDataArchive/investigations/${sampleInvestigation.id}`, async (route: any) => {
      if (route.request().method() === 'DELETE') await route.fulfill({ status: 200, body: '' });
      else await route.continue();
    });

    await page.locator('.hcard-inv-btn').click();
    await expect(page.locator('.inv-btn-delete')).toBeVisible({ timeout: 8_000 });
    await page.locator('.inv-btn-delete').click();
    await expect(page.locator('.inv-overlay')).not.toBeVisible({ timeout: 5_000 });

    await expect(page.locator('.hcard-inv-btn')).not.toBeVisible({ timeout: 5_000 });
  });

  test('closing the report modal via backdrop works', async ({ page }) => {
    await page.locator('.hcard-inv-btn').click();
    await expect(page.locator('.inv-overlay')).toBeVisible({ timeout: 5_000 });

    await page.evaluate(() =>
      new Promise<void>(resolve => {
        document.querySelector('.inv-backdrop')?.dispatchEvent(
          new MouseEvent('click', { bubbles: true }),
        );
        setTimeout(resolve, 50);
      }),
    );
    await expect(page.locator('.inv-overlay')).not.toBeVisible({ timeout: 5_000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// INVESTIGATIONS — LINKED (from a compared flight)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Analyze Page — Linked Investigation (from compared flight)', () => {
  test('linked investigation report shows flight badge and no Edit button', async ({ page }) => {
    const linkedInvestigation = {
      ...sampleInvestigation,
      id: 'inv-linked',
      masterIndex: 999,
    };

    await setupBaseRoutes(page, [linkedInvestigation]);
    await gotoFlight(page);
    await expandHistoricalCard(page);

    await page.locator('.hcard-inv-btn').click();

    await expect(page.locator('.inv-modal')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('.inv-btn-edit')).not.toBeVisible();
    await expect(page.locator('.inv-flight-badge')).toContainText('Flight #999');
    await expect(page.locator('.inv-report-name')).toContainText('Engine Spike');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HISTORICAL SIDEBAR — SORT
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Analyze Page — Historical Sidebar Sort', () => {
  test.beforeEach(async ({ page }) => {
    await setupBaseRoutes(page);
    await gotoFlight(page);
    await openChart(page, PARAM_A);
    await page.locator('.modeBtn').filter({ hasText: 'Historical' }).click();
    await expect(page.locator('.timeGroup')).toBeVisible({ timeout: 10_000 });
  });

  test('"Sort by Time" button is active by default', async ({ page }) => {
    await expect(page.locator('.sortBtn').filter({ hasText: 'Sort by Time' })).toHaveClass(/active/);
    await expect(page.locator('.sortBtn').filter({ hasText: 'Sort by Score' })).not.toHaveClass(/active/);
  });

  test('clicking "Sort by Score" makes it active and deactivates "Sort by Time"', async ({ page }) => {
    await page.locator('.sortBtn').filter({ hasText: 'Sort by Score' }).click();
    await expect(page.locator('.sortBtn').filter({ hasText: 'Sort by Score' })).toHaveClass(/active/);
    await expect(page.locator('.sortBtn').filter({ hasText: 'Sort by Time' })).not.toHaveClass(/active/);
  });

  test('clicking "Sort by Time" after switching restores its active state', async ({ page }) => {
    await page.locator('.sortBtn').filter({ hasText: 'Sort by Score' }).click();
    await page.locator('.sortBtn').filter({ hasText: 'Sort by Time' }).click();
    await expect(page.locator('.sortBtn').filter({ hasText: 'Sort by Time' })).toHaveClass(/active/);
  });

  test('time group header displays the match count badge', async ({ page }) => {
    await expect(page.locator('.countBadge')).toContainText('1 match');
  });

  test('expanding a group shows the flight number and score in the card', async ({ page }) => {
    await page.locator('.timeGroupHeader').click();
    await expect(page.locator('.historicalCardNew')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('.hcardFlight')).toContainText(`Flight #${COMPARED_ID}`);
    await expect(page.locator('.hcardScore')).toContainText('91%');
  });

  test('collapsing a group hides its cards again', async ({ page }) => {
    await page.locator('.timeGroupHeader').click();
    await expect(page.locator('.historicalCardNew')).toBeVisible({ timeout: 5_000 });

    await page.locator('.timeGroupHeader').click();
    await expect(page.locator('.historicalCardNew')).toHaveCount(0, { timeout: 5_000 });
  });

  test('historical empty state is shown when parameter has no matches', async ({ page }) => {
    // Switch sidebar focus to AIRSPEED (no historical matches) via its chart card header
    await page.locator('.paramCard').filter({ hasText: PARAM_B }).click();
    await page.locator('.gridChartCard').filter({ hasText: PARAM_B }).locator('.gridChartHeader').click();
    // Two .sidebarEmpty elements can exist in DOM simultaneously; filter to the historical one.
    await expect(
      page.locator('.sidebarEmpty').filter({ hasText: 'No historical similarities' }),
    ).toBeVisible({ timeout: 5_000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SIDEBAR HEADER TEXT
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Analyze Page — Sidebar Header Text', () => {
  test.beforeEach(async ({ page }) => {
    await setupBaseRoutes(page);
    await gotoFlight(page);
  });

  test('shows placeholder text when no parameter is selected', async ({ page }) => {
    await expect(page.locator('.sidebarHeader')).toContainText('Select a parameter to see related parameters');
  });

  test('shows "Related: ALTITUDE" in the header after selecting the parameter', async ({ page }) => {
    await page.locator('.paramCard').filter({ hasText: PARAM_A }).click();
    await expect(page.locator('.sidebarHeader')).toContainText(`Related: ${PARAM_A}`, { timeout: 5_000 });
  });

  test('shows "Historical Similar Points for" header when historical mode is active', async ({ page }) => {
    await openChart(page, PARAM_A);
    await page.locator('.modeBtn').filter({ hasText: 'Historical' }).click();
    await expect(page.locator('.sidebarHeader')).toContainText('Historical Similar Points for', { timeout: 5_000 });
  });

  test('"Related" mode button is active by default', async ({ page }) => {
    await expect(page.locator('.modeBtn').filter({ hasText: 'Related' })).toHaveClass(/active/);
    await expect(page.locator('.modeBtn').filter({ hasText: 'Historical' })).not.toHaveClass(/active/);
  });

  test('switching to Historical mode makes its button active', async ({ page }) => {
    await openChart(page, PARAM_A);
    await page.locator('.modeBtn').filter({ hasText: 'Historical' }).click();
    await expect(page.locator('.modeBtn').filter({ hasText: 'Historical' })).toHaveClass(/active/, { timeout: 5_000 });
    await expect(page.locator('.modeBtn').filter({ hasText: 'Related' })).not.toHaveClass(/active/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PARAMETER COUNT PILL & SORTING
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Analyze Page — Parameter Count Pill', () => {
  test.beforeEach(async ({ page }) => {
    await setupBaseRoutes(page);
    await gotoFlight(page);
  });

  test('count pill shows total parameter count on load', async ({ page }) => {
    await expect(page.locator('.countPill .countValue')).toContainText('3', { timeout: 5_000 });
    await expect(page.locator('.countPill .countLabel')).toContainText('params');
  });

  test('count pill updates to match filtered results after a search', async ({ page }) => {
    await page.locator('input.searchInput').fill(PARAM_A);
    await expect(page.locator('.countPill .countValue')).toContainText('1', { timeout: 5_000 });
  });

  test('count pill resets to total after clearing the search', async ({ page }) => {
    await page.locator('input.searchInput').fill(PARAM_A);
    await expect(page.locator('.countPill .countValue')).toContainText('1', { timeout: 5_000 });

    await page.locator('button.clearBtn').click();
    await expect(page.locator('.countPill .countValue')).toContainText('3', { timeout: 5_000 });
  });

  test('"Unusual" sort pill is active by default', async ({ page }) => {
    await expect(page.locator('.sortPill button').filter({ hasText: 'Unusual' })).toHaveClass(/active/);
    await expect(page.locator('.sortPill button').filter({ hasText: 'Historical' })).not.toHaveClass(/active/);
  });

  test('switching to "Unusual" sort places ALTITUDE (1 anomaly) first', async ({ page }) => {
    await expect(
      page.locator('.paramCard').filter({ hasText: PARAM_A }).locator('.anomalyBadge'),
    ).toContainText('Anomalies (1)', { timeout: 5_000 });

    await page.locator('.sortPill button').filter({ hasText: 'Unusual' }).click();
    await expect(page.locator('.paramCard:not(.hidden1)').first()).toContainText(PARAM_A);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Analyze Page — Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupBaseRoutes(page);
  });

  test('back button navigates to the root route', async ({ page }) => {
    await gotoFlight(page);
    await page.locator('.back-btn').click();
    await expect(page).toHaveURL('http://localhost:4200/', { timeout: 5_000 });
  });

  test('navigating with ?param= query automatically opens the matching chart', async ({ page }) => {
    await page.goto(`http://localhost:4200/archive/${FLIGHT_ID}?param=${PARAM_A}`);
    await expect(page.locator('.gridChartCard')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator('.gridChartTitle')).toHaveText(PARAM_A);
    await expect(page.locator('.gridChartBody .highcharts-root')).toBeVisible({ timeout: 10_000 });
  });

  test('auto-selected parameter card is marked as selected', async ({ page }) => {
    await page.goto(`http://localhost:4200/archive/${FLIGHT_ID}?param=${PARAM_A}`);
    await expect(page.locator('.gridChartCard')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator('.paramCard').filter({ hasText: PARAM_A })).toHaveClass(/selected/, { timeout: 5_000 });
  });

  test('navigating to a compared flight via historical card uses the correct URL', async ({ page }) => {
    await gotoFlight(page);
    await expandHistoricalCard(page);

    await page.locator('.historicalCardNew').click();

    await expect(page).toHaveURL(new RegExp(`/archive/${COMPARED_ID}`), { timeout: 5_000 });
    await expect(page).toHaveURL(new RegExp(`param=${PARAM_A}`));
  });

  test('historical card click URL includes sourceFlightIndex and label instead of raw epoch times', async ({ page }) => {
    await gotoFlight(page);
    await expandHistoricalCard(page);

    await page.locator('.historicalCardNew').click();

    await expect(page).toHaveURL(new RegExp(`/archive/${COMPARED_ID}`), { timeout: 5_000 });
    await expect(page).toHaveURL(new RegExp(`sourceFlightIndex=${FLIGHT_ID}`));
    await expect(page).toHaveURL(new RegExp(`label=similar_pattern`));

    const url = page.url();
    expect(url).not.toContain('pointTime');
    expect(url).not.toContain('startEpoch');
    expect(url).not.toContain('endEpoch');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BACK NAVIGATION STATE RESET
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Analyze Page — Back Navigation State Reset', () => {
  test.beforeEach(async ({ page }) => {
    await setupBaseRoutes(page);
    await gotoFlight(page);
  });

  test('pressing browser back resets sidebar to Related mode with no param selected', async ({ page }) => {
    await expandHistoricalCard(page);
    await page.locator('.historicalCardNew').click();
    await expect(page).toHaveURL(new RegExp(`/archive/${COMPARED_ID}`), { timeout: 5_000 });
    await page.waitForSelector('.paramCard', { timeout: 10_000 });

    await page.goBack();
    await page.waitForSelector('.paramCard', { timeout: 10_000 });

    await expect(
      page.locator('.modeBtn').filter({ hasText: 'Related' }),
    ).toHaveClass(/active/, { timeout: 5_000 });
    await expect(page.locator('.sidebarHeader')).toContainText(
      'Select a parameter to see related parameters',
    );
  });

  test('pressing browser back does not show "Historical Similar Points for null"', async ({ page }) => {
    await expandHistoricalCard(page);
    await page.locator('.historicalCardNew').click();
    await expect(page).toHaveURL(new RegExp(`/archive/${COMPARED_ID}`), { timeout: 5_000 });
    await page.waitForSelector('.paramCard', { timeout: 10_000 });

    await page.goBack();
    await page.waitForSelector('.paramCard', { timeout: 10_000 });

    await expect(page.locator('.sidebarHeader')).not.toContainText('null');
  });

  test('pressing browser back clears historical cards from the visited flight', async ({ page }) => {
    await expandHistoricalCard(page);
    await page.locator('.historicalCardNew').click();
    await expect(page).toHaveURL(new RegExp(`/archive/${COMPARED_ID}`), { timeout: 5_000 });
    await page.waitForSelector('.paramCard', { timeout: 10_000 });

    await page.goBack();
    await page.waitForSelector('.paramCard', { timeout: 10_000 });

    await expect(page.locator('.historicalCardNew')).toHaveCount(0, { timeout: 5_000 });
  });

  test('pressing browser back deselects all chart grid items', async ({ page }) => {
    await expandHistoricalCard(page);
    await page.locator('.historicalCardNew').click();
    await expect(page).toHaveURL(new RegExp(`/archive/${COMPARED_ID}`), { timeout: 5_000 });
    await page.waitForSelector('.paramCard', { timeout: 10_000 });

    await page.goBack();
    await page.waitForSelector('.paramCard', { timeout: 10_000 });

    await expect(page.locator('.gridChartCard')).toHaveCount(0, { timeout: 5_000 });
    await expect(page.locator('.emptyState')).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HISTORICAL FLIGHT NAVIGATION — AUTO-SELECT WITH ZOOM
// ─────────────────────────────────────────────────────────────────────────────

const COMPARED_ANOMALY_TIME = 2005;

const comparedFlightMeta = {
  anomalies: {
    [PARAM_A]: [{ startEpoch: 2004, endEpoch: 2006, representativeEpoch: COMPARED_ANOMALY_TIME, label: 'similar_pattern' }],
  },
  historicalSimilarity: {
    [PARAM_A]: [{
      recordId: 'hist-reverse-1',
      comparedFlightIndex: FLIGHT_ID,
      startEpoch: 2004,
      endEpoch: 2006,
      label: 'similar_pattern',
      finalScore: 0.91,
      anomalyTime: COMPARED_ANOMALY_TIME,
    }],
  },
};

const comparedSpecialPoints = {
  anomalies: { [PARAM_A]: [COMPARED_ANOMALY_TIME], [PARAM_B]: [], [PARAM_C]: [] },
  historicalSimilarity: { [PARAM_A]: [{ anomalyTime: COMPARED_ANOMALY_TIME }], [PARAM_B]: [], [PARAM_C]: [] },
};

async function setupComparedFlightRoutes(page: any) {
  await page.route(`**/TelemetryDataArchive/flight/${COMPARED_ID}`, async (route: any) =>
    route.fulfill({ json: comparedFlightMeta }));

  await page.route(`**/get-all-special-points-for-flight/${COMPARED_ID}`, async (route: any) =>
    route.fulfill({ json: comparedSpecialPoints }));
}

test.describe('Analyze Page — Historical Flight Auto-Select', () => {
  test.beforeEach(async ({ page }) => {
    await setupBaseRoutes(page);
    await setupComparedFlightRoutes(page);
  });

  test('navigating to compared flight via URL auto-selects the parameter chart', async ({ page }) => {
    await page.goto(
      `http://localhost:4200/archive/${COMPARED_ID}?param=${PARAM_A}&sourceFlightIndex=${FLIGHT_ID}&label=similar_pattern`,
    );
    await page.waitForSelector('.paramCard', { timeout: 10_000 });

    await expect(page.locator('.gridChartCard')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator('.gridChartTitle')).toHaveText(PARAM_A);
    await expect(page.locator('.gridChartBody .highcharts-root')).toBeVisible({ timeout: 10_000 });
  });

  test('auto-selected param card is marked as selected on the compared flight', async ({ page }) => {
    await page.goto(
      `http://localhost:4200/archive/${COMPARED_ID}?param=${PARAM_A}&sourceFlightIndex=${FLIGHT_ID}&label=similar_pattern`,
    );
    await page.waitForSelector('.paramCard', { timeout: 10_000 });

    await expect(page.locator('.gridChartCard')).toHaveCount(1, { timeout: 15_000 });
    await expect(
      page.locator('.paramCard').filter({ hasText: PARAM_A }),
    ).toHaveClass(/selected/, { timeout: 5_000 });
  });

  test('compared flight header shows the correct flight number', async ({ page }) => {
    await page.goto(
      `http://localhost:4200/archive/${COMPARED_ID}?param=${PARAM_A}&sourceFlightIndex=${FLIGHT_ID}&label=similar_pattern`,
    );
    await page.waitForSelector('.paramCard', { timeout: 10_000 });

    await expect(page.locator('.title')).toContainText(`Flight ${COMPARED_ID}`);
  });

  test('navigating without sourceFlightIndex/label still auto-selects the param', async ({ page }) => {
    await page.goto(
      `http://localhost:4200/archive/${COMPARED_ID}?param=${PARAM_A}`,
    );
    await page.waitForSelector('.paramCard', { timeout: 10_000 });

    await expect(page.locator('.gridChartCard')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator('.gridChartTitle')).toHaveText(PARAM_A);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RELATED SIDEBAR INTERACTIONS
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Analyze Page — Related Sidebar', () => {
  test.beforeEach(async ({ page }) => {
    await setupBaseRoutes(page);
    await gotoFlight(page);
    await openChart(page, PARAM_A);
  });

  test('related sidebar shows "No strong relations" for a param with no connections', async ({ page }) => {
    await page.locator('.paramCard').filter({ hasText: PARAM_B }).click();
    await expect(page.locator('.gridChartCard')).toHaveCount(2, { timeout: 10_000 });

    // click the AIRSPEED chart card header to set sidebar to AIRSPEED
    await page.locator('.gridChartCard').filter({ hasText: PARAM_B }).locator('.gridChartHeader').click();

    // Two .sidebarEmpty elements exist in the DOM simultaneously (related + historical,
    // the historical one is hidden via [hidden]). Filter to the specific one.
    await expect(
      page.locator('.sidebarEmpty').filter({ hasText: 'No strong relations' }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('clicking a related param that is already open removes it from the grid', async ({ page }) => {
    // Open AIRSPEED via its paramCard so both charts are open
    await page.locator('.paramCard').filter({ hasText: PARAM_B }).click();
    await expect(page.locator('.gridChartCard')).toHaveCount(2, { timeout: 10_000 });

    // Refocus the sidebar on ALTITUDE by clicking its chart card header
    await page.locator('.gridChartCard').filter({ hasText: PARAM_A }).locator('.gridChartHeader').click();

    // AIRSPEED now appears in the related list with .selected (it's already open)
    const relatedB = page.locator('.sidebarItem').filter({ hasText: PARAM_B });
    await expect(relatedB).toBeVisible({ timeout: 10_000 });
    await expect(relatedB).toHaveClass(/selected/);

    // Clicking it from the related sidebar removes it from the grid
    await relatedB.click();
    await expect(page.locator('.gridChartCard')).toHaveCount(1, { timeout: 5_000 });
    await expect(
      page.locator('.gridChartTitle').filter({ hasText: PARAM_B }),
    ).not.toBeVisible();
  });

  test('a related param in the sidebar is styled as selected when its chart is open', async ({ page }) => {
    // Open AIRSPEED via paramCard (not the related sidebar)
    await page.locator('.paramCard').filter({ hasText: PARAM_B }).click();
    await expect(page.locator('.gridChartCard')).toHaveCount(2, { timeout: 10_000 });

    // Switch sidebar focus back to ALTITUDE by clicking its chart card header
    await page.locator('.gridChartCard').filter({ hasText: PARAM_A }).locator('.gridChartHeader').click();

    // AIRSPEED shows in related list and must carry .selected since its chart is open
    const relatedB = page.locator('.sidebarItem').filter({ hasText: PARAM_B });
    await expect(relatedB).toBeVisible({ timeout: 10_000 });
    await expect(relatedB).toHaveClass(/selected/, { timeout: 5_000 });
  });
});
