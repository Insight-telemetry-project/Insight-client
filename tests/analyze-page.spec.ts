import { test, expect } from '@playwright/test';

const FLIGHT_ID       = 7417;
const COMPARED_ID     = 100;
const PARAM_A         = 'ALTITUDE';
const PARAM_B         = 'AIRSPEED';
const PARAM_C         = 'HEADING';
const ANOMALY_TIME    = 1005;

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
